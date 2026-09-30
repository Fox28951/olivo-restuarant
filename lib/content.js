// Loading, validating and saving the site content (data/content.json).
// Everything the admin panel sends goes through sanitizeContent() before it is stored,
// so the page renderer can trust the shape of the data.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

export const CONTENT_FILE = path.join(ROOT, 'data', 'content.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const MAX_BACKUPS = 30;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TAG_STYLES = ['', 'veg', 'hot'];

export function loadContent() {
  return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
}

export function saveContent(content) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (fs.existsSync(CONTENT_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(CONTENT_FILE, path.join(BACKUP_DIR, `content-${stamp}.json`));
    const backups = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('content-')).sort();
    backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))
      .forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  }
  writeFileAtomic(CONTENT_FILE, JSON.stringify(content, null, 2) + '\n');
}

export function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/* ---------- Validation helpers ---------- */

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function str(v, max = 300) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function text(v, max = 2000) {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '';
}

export function url(v) {
  const s = str(v, 500);
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^(mailto|tel):[^\s"'<>]+$/i.test(s)) return s;
  return '';
}

// Only images inside our own asset folders are allowed.
export function image(v) {
  const s = str(v, 200);
  return /^assets\/(img|uploads)\/[\w-]+\.(jpe?g|png|webp)$/i.test(s) ? s : '';
}

export function time(v, fallback) {
  const s = str(v, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : fallback;
}

function int(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/* ---------- Schema ---------- */

export function sanitizeContent(input) {
  const c = obj(input);
  const site = obj(c.site);
  const contacts = obj(c.contacts);
  const menu = obj(c.menu);
  const about = obj(c.about);
  const booking = obj(c.booking);
  const hoursIn = arr(c.hours, 7);

  return {
    site: {
      name: str(site.name, 60) || 'Restaurant',
      eyebrow: str(site.eyebrow, 80),
      heroLead: str(site.heroLead, 300),
      heroImage: image(site.heroImage) || 'assets/img/interior.jpg',
      metaDescription: str(site.metaDescription, 300),
    },
    contacts: {
      addressLine1: str(contacts.addressLine1, 120),
      addressLine2: str(contacts.addressLine2, 120),
      directions: str(contacts.directions, 200),
      mapUrl: url(contacts.mapUrl),
      phone: str(contacts.phone, 40),
      email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(str(contacts.email, 120)) ? str(contacts.email, 120) : '',
      socials: arr(contacts.socials, 8)
        .map((s) => ({ label: str(obj(s).label, 30), url: url(obj(s).url) }))
        .filter((s) => s.label && s.url),
    },
    hours: DAYS.map((day, i) => {
      const h = obj(hoursIn[i]);
      return { day, open: time(h.open, '12:00'), close: time(h.close, '23:00'), closed: h.closed === true };
    }),
    hoursNote: str(c.hoursNote, 200),
    menu: {
      title: str(menu.title, 120),
      lead: str(menu.lead, 300),
      note: str(menu.note, 300),
      categories: arr(menu.categories, 12)
        .map((cat) => ({
          title: str(obj(cat).title, 40),
          items: arr(obj(cat).items, 40)
            .map((it) => {
              const item = obj(it);
              return {
                name: str(item.name, 80),
                description: str(item.description, 300),
                price: str(item.price, 20),
                image: image(item.image),
                tag: str(item.tag, 30),
                tagStyle: TAG_STYLES.includes(item.tagStyle) ? item.tagStyle : '',
              };
            })
            .filter((it) => it.name),
        }))
        .filter((cat) => cat.title),
    },
    about: {
      title: str(about.title, 120),
      paragraphs: arr(about.paragraphs, 6).map((p) => text(p, 1000)).filter(Boolean),
      image: image(about.image) || 'assets/img/bar.jpg',
      accentImage: image(about.accentImage),
      stats: arr(about.stats, 4)
        .map((s) => ({ value: str(obj(s).value, 10), label: str(obj(s).label, 60) }))
        .filter((s) => s.value && s.label),
    },
    gallery: arr(c.gallery, 40)
      .map((g) => ({ image: image(obj(g).image), alt: str(obj(g).alt, 150) }))
      .filter((g) => g.image),
    booking: {
      text: str(booking.text, 400),
      maxGuests: int(booking.maxGuests, 1, 30, 10),
      lastSeatingMinutes: int(booking.lastSeatingMinutes, 0, 240, 90),
      zones: arr(booking.zones, 8).map((z) => str(z, 40)).filter(Boolean),
    },
  };
}
