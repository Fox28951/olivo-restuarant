// Olivo restaurant site: serves the public page and the password-protected admin panel.
// Start: npm start  (first set a password: npm run set-password)
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/paths.js';
import { loadContent, saveContent, sanitizeContent, image } from './lib/content.js';
import { buildIndex } from './lib/render.js';
import { loadBookings, saveBookings, validateBooking, STATUSES } from './lib/bookings.js';
import {
  requireAdmin, sameOrigin, hasSession, startSession, endSession,
  isPasswordSet, passwordSource, verifyPassword, setPassword, MIN_PASSWORD_LENGTH,
  isLockedOut, recordFailure, clearFailures,
} from './lib/auth.js';

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_DIR = path.join(ROOT, 'assets', 'uploads');

const app = express();
app.disable('x-powered-by');
// Behind a hosting proxy (Render, Railway, nginx) set TRUST_PROXY=1 so client IPs and HTTPS are detected.
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

/* ---------- Public site ---------- */

const indexFile = path.join(ROOT, 'index.html');
app.get(['/', '/index.html'], (req, res) => res.sendFile(indexFile));
for (const dir of ['css', 'js', 'assets']) {
  app.use('/' + dir, express.static(path.join(ROOT, dir), { maxAge: '1h' }));
}

// Booking requests: at most 5 per visitor per hour.
const bookingHits = new Map();
app.post('/api/bookings', express.json({ limit: '10kb' }), (req, res) => {
  const now = Date.now();
  const hits = (bookingHits.get(req.ip) || []).filter((t) => now - t < 3600000);
  if (hits.length >= 5) return res.status(429).json({ error: 'Too many requests. Please call us instead.' });
  bookingHits.set(req.ip, [...hits, now]);

  const { booking, error } = validateBooking(req.body, loadContent());
  if (error) return res.status(400).json({ error });
  saveBookings([booking, ...loadBookings()]);
  res.status(201).json({ ok: true });
});

/* ---------- Admin panel ---------- */

app.use('/admin', (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'no-store');
  next();
}, express.static(path.join(ROOT, 'admin')));

app.get('/api/admin/session', (req, res) => {
  res.json({ loggedIn: hasSession(req), passwordSet: isPasswordSet() });
});

app.post('/api/admin/login', express.json({ limit: '2kb' }), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Cross-site request blocked.' });
  if (!isPasswordSet()) return res.status(503).json({ error: 'No admin password yet. Set ADMIN_PASSWORD on the host or run "npm run set-password".' });
  if (isLockedOut(req.ip)) return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });

  if (!verifyPassword(req.body?.password)) {
    recordFailure(req.ip);
    return res.status(401).json({ error: 'Wrong password.' });
  }
  clearFailures(req.ip);
  startSession(req, res);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

// Everything below requires a logged-in owner.
const admin = express.Router();
admin.use(requireAdmin);
admin.use(express.json({ limit: '15mb' }));

admin.get('/content', (req, res) => res.json(loadContent()));

admin.put('/content', (req, res) => {
  const content = sanitizeContent(req.body);
  saveContent(content);
  buildIndex(content);
  res.json(content);
});

admin.get('/images', (req, res) => {
  const list = (dir) => {
    const abs = path.join(ROOT, 'assets', dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs)
      .map((f) => `assets/${dir}/${f}`)
      .filter((p) => image(p) && !/-sm\.\w+$/.test(p));
  };
  res.json([...list('img'), ...list('uploads')]);
});

// The browser resizes photos before upload and sends two JPEGs: full size and a small copy.
admin.post('/upload', (req, res) => {
  const decode = (dataUrl, maxBytes) => {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) return null;
    const buf = Buffer.from(m[1], 'base64');
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    return isJpeg && buf.length <= maxBytes ? buf : null;
  };
  const full = decode(req.body?.full, 6 * 1024 * 1024);
  const small = decode(req.body?.small, 2 * 1024 * 1024);
  if (!full || !small) return res.status(400).json({ error: 'Please upload a JPEG, PNG or WebP photo.' });

  const slug = String(req.body?.name || 'photo').toLowerCase()
    .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
  const base = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, `${base}.jpg`), full);
  fs.writeFileSync(path.join(UPLOAD_DIR, `${base}-sm.jpg`), small);
  res.status(201).json({ image: `assets/uploads/${base}.jpg` });
});

// Only uploaded photos can be deleted, and only when no section uses them.
admin.delete('/images', (req, res) => {
  const target = image(req.query.path);
  if (!target || !target.startsWith('assets/uploads/')) return res.status(400).json({ error: 'Only uploaded photos can be deleted.' });
  if (JSON.stringify(loadContent()).includes(`"${target}"`)) {
    return res.status(409).json({ error: 'This photo is still used on the site. Remove it from all sections first.' });
  }
  for (const p of [target, target.replace(/(\.\w+)$/, '-sm$1')]) {
    fs.rmSync(path.join(ROOT, p), { force: true });
  }
  res.json({ ok: true });
});

admin.get('/bookings', (req, res) => res.json(loadBookings()));

admin.patch('/bookings/:id', (req, res) => {
  const list = loadBookings();
  const booking = list.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (!STATUSES.includes(req.body?.status)) return res.status(400).json({ error: 'Unknown status.' });
  booking.status = req.body.status;
  saveBookings(list);
  res.json(booking);
});

admin.delete('/bookings/:id', (req, res) => {
  const list = loadBookings();
  const next = list.filter((b) => b.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'Booking not found.' });
  saveBookings(next);
  res.json({ ok: true });
});

admin.post('/password', (req, res) => {
  const { current, next } = req.body || {};
  if (passwordSource() === 'env') {
    return res.status(409).json({ error: 'The password is set by the ADMIN_PASSWORD environment variable. Change it in your hosting settings.' });
  }
  if (!verifyPassword(current)) return res.status(400).json({ error: 'Current password is wrong.' });
  if (typeof next !== 'string' || next.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  setPassword(next);
  startSession(req, res); // keep this browser logged in
  res.json({ ok: true });
});

app.use('/api/admin', admin);

/* ---------- Errors ---------- */

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => res.status(404).type('text').send('Not found'));
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 413 ? 'The file is too large.' : status === 400 ? 'Invalid request.' : 'Server error.' });
});

// Rebuild the page on start so index.html always matches content.json.
buildIndex(sanitizeContent(loadContent()));

app.listen(PORT, () => {
  console.log(`Site:  http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  const source = passwordSource();
  if (source === 'env') console.log('Admin password: from ADMIN_PASSWORD environment variable');
  else if (source === 'file') console.log('Admin password: from data/admin.json');
  else console.log('No admin password yet — set ADMIN_PASSWORD or run: npm run set-password');
  if (source === 'env' && process.env.ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    console.warn(`Warning: ADMIN_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters.`);
  }
});
