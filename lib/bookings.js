// Table booking requests from the public form, stored in data/bookings.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';
import { str, text, time, writeFileAtomic } from './content.js';

const BOOKINGS_FILE = path.join(ROOT, 'data', 'bookings.json');
export const STATUSES = ['new', 'confirmed', 'cancelled'];

export function loadBookings() {
  if (!fs.existsSync(BOOKINGS_FILE)) return [];
  return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
}

export function saveBookings(list) {
  fs.mkdirSync(path.dirname(BOOKINGS_FILE), { recursive: true });
  writeFileAtomic(BOOKINGS_FILE, JSON.stringify(list, null, 2) + '\n');
}

// Returns { booking } or { error } — never trusts the browser-side validation.
export function validateBooking(input, content) {
  const b = input && typeof input === 'object' ? input : {};
  const name = str(b.name, 80);
  const phone = str(b.phone, 20);
  const date = str(b.date, 10);
  const slot = time(b.time, '');
  const guests = Number.parseInt(b.guests, 10);
  const zones = content.booking.zones;
  const zone = zones.includes(b.zone) ? b.zone : zones[0] || '';

  if (name.length < 2) return { error: 'Please enter your name.' };
  if (!/^\+?[0-9\s()-]{10,20}$/.test(phone)) return { error: 'Please enter a valid phone number.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Please choose a date.' };

  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date(Date.now() + 62 * 86400000).toISOString().slice(0, 10);
  if (date < today || date > limit) return { error: 'Bookings are available up to two months ahead.' };

  const dayIndex = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  if (content.hours[dayIndex].closed) return { error: 'We are closed on that day.' };
  if (!slot) return { error: 'Please choose a time.' };
  if (!Number.isInteger(guests) || guests < 1 || guests > content.booking.maxGuests) {
    return { error: 'Please choose the number of guests.' };
  }

  return {
    booking: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'new',
      name, phone, date, time: slot, guests, zone,
      comment: text(b.comment, 500),
    },
  };
}
