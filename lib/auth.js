// Admin authentication: one owner password (scrypt hash), in-memory sessions
// in an HttpOnly cookie, and a limit on failed login attempts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';
import { writeFileAtomic } from './content.js';

const ADMIN_FILE = path.join(ROOT, 'data', 'admin.json');
const COOKIE = 'olivo_admin';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILS = 5;
const LOCK_WINDOW = 15 * 60 * 1000; // 15 minutes
export const MIN_PASSWORD_LENGTH = 10;

const sessions = new Map(); // token -> expiresAt
const failures = new Map(); // ip -> { count, first }

/* ---------- Password hashing ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

// On hosting (Render etc.) the password comes from the ADMIN_PASSWORD environment variable.
// It takes priority over data/admin.json and is hashed in memory only — never written to disk.
let envCache = null; // { password, creds }

function envCredentials() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !password.trim()) return null;
  if (envCache?.password !== password) envCache = { password, creds: hashPassword(password) };
  return envCache.creds;
}

function readCredentials() {
  const fromEnv = envCredentials();
  if (fromEnv) return fromEnv;
  if (fs.existsSync(ADMIN_FILE)) return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
  return null;
}

export function isPasswordSet() {
  return readCredentials() !== null;
}

// 'env' (ADMIN_PASSWORD), 'file' (data/admin.json) or null.
export function passwordSource() {
  if (envCredentials()) return 'env';
  return fs.existsSync(ADMIN_FILE) ? 'file' : null;
}

export function verifyPassword(password) {
  const creds = readCredentials();
  if (!creds || typeof password !== 'string') return false;
  const expected = Buffer.from(creds.hash, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(creds.salt, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function setPassword(password) {
  fs.mkdirSync(path.dirname(ADMIN_FILE), { recursive: true });
  writeFileAtomic(ADMIN_FILE, JSON.stringify(hashPassword(password)));
  sessions.clear(); // log out every existing session
}

/* ---------- Login rate limiting ---------- */

export function isLockedOut(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > LOCK_WINDOW) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILS;
}

export function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > LOCK_WINDOW) failures.set(ip, { count: 1, first: Date.now() });
  else f.count += 1;
}

export function clearFailures(ip) {
  failures.delete(ip);
}

/* ---------- Sessions ---------- */

function readCookie(req) {
  const header = req.headers.cookie || '';
  const match = header.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  return match ? match.slice(COOKIE.length + 1) : null;
}

function cookieAttrs(req, maxAgeSeconds) {
  const secure = req.secure ? '; Secure' : '';
  return `${COOKIE}=%VALUE%; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function startSession(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  res.setHeader('Set-Cookie', cookieAttrs(req, SESSION_TTL / 1000).replace('%VALUE%', token));
}

export function endSession(req, res) {
  const token = readCookie(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', cookieAttrs(req, 0).replace('%VALUE%', ''));
}

export function hasSession(req) {
  const token = readCookie(req);
  const expires = token && sessions.get(token);
  if (!expires) return false;
  if (expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

// Blocks unauthenticated requests and cross-site writes.
export function requireAdmin(req, res, next) {
  if (!hasSession(req)) return res.status(401).json({ error: 'Please log in.' });
  if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: 'Cross-site request blocked.' });
  next();
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches from older browsers may omit it; SameSite=Strict still applies
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
