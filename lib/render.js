// Builds index.html from content.json. Every value from the content goes through esc()
// (text) or has already been validated as a safe URL / asset path by sanitizeContent().
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

const INDEX_FILE = path.join(ROOT, 'index.html');
const SHORT_DAYS = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "assets/img/pasta.jpg" -> "assets/img/pasta-sm.jpg" when the small copy exists
export function thumb(image) {
  const small = image.replace(/(\.\w+)$/, '-sm$1');
  return fs.existsSync(path.join(ROOT, small)) ? small : image;
}

const telHref = (phone) => 'tel:' + phone.replace(/[^\d+]/g, '');

// Collapses consecutive days with the same hours: "Mon – Thu  12:00 – 23:00"
export function groupHours(hours) {
  const groups = [];
  for (const h of hours) {
    const value = h.closed ? 'Closed' : `${h.open} – ${h.close}`;
    const last = groups[groups.length - 1];
    if (last && last.value === value) last.to = h.day;
    else groups.push({ from: h.day, to: h.day, value });
  }
  return groups.map((g) => ({
    label: g.from === g.to ? SHORT_DAYS[g.from] : `${SHORT_DAYS[g.from]} – ${SHORT_DAYS[g.to]}`,
    value: g.value,
  }));
}

function heroHoursFact(hours) {
  const open = hours.filter((h) => !h.closed);
  if (open.length === 7 && open.every((h) => h.open === open[0].open)) {
    return { strong: `From ${open[0].open}`, small: 'open every day' };
  }
  return { strong: `Open ${open.length} days`, small: 'see opening hours' };
}

function renderDish(item) {
  const img = item.image
    ? `<img class="dish__img" src="${thumb(item.image)}" alt="${esc(item.name)}" width="800" height="533" loading="lazy">`
    : '';
  const tag = item.tag
    ? `<span class="tag${item.tagStyle ? ' tag--' + item.tagStyle : ''}">${esc(item.tag)}</span>`
    : '';
  return `
            <li class="dish${item.image ? '' : ' dish--text'}">
              ${img}
              <div class="dish__body">
                <div class="dish__head"><h3 class="dish__name">${esc(item.name)}</h3><span class="dish__price">${esc(item.price)}</span></div>
                <p class="dish__desc">${esc(item.description)}</p>
                ${tag}
              </div>
            </li>`;
}

function renderMenu(menu) {
  const tabs = menu.categories.map((cat, i) => `
          <button class="tabs__btn" role="tab" id="tab-${i}" aria-controls="panel-${i}" aria-selected="${i === 0}"${i === 0 ? '' : ' tabindex="-1"'}>${esc(cat.title)}</button>`).join('');

  const panels = menu.categories.map((cat, i) => `
        <div class="menu-panel" role="tabpanel" id="panel-${i}" aria-labelledby="tab-${i}" tabindex="0"${i === 0 ? '' : ' hidden'}>
          <ul class="menu-list">${cat.items.map(renderDish).join('')}
          </ul>
        </div>`).join('');

  return `
        <div class="tabs" role="tablist" aria-label="Menu sections">${tabs}
        </div>
${panels}`;
}

function renderGallery(gallery) {
  return gallery.map((g, i) => {
    const mod = i === 0 ? ' gallery__item--wide' : i === 3 ? ' gallery__item--tall' : '';
    return `
          <li class="gallery__item${mod}">
            <button class="gallery__btn" type="button" data-full="${g.image}">
              <img src="${thumb(g.image)}" alt="${esc(g.alt)}" loading="lazy" width="800" height="533">
            </button>
          </li>`;
  }).join('');
}

export function renderPage(c) {
  const { site, contacts, menu, about, booking } = c;
  const name = esc(site.name);
  const hoursFact = heroHoursFact(c.hours);
  const hoursGroups = groupHours(c.hours);
  const heroSmall = thumb(site.heroImage);
  const bookingHours = esc(JSON.stringify(c.hours.map(({ open, close, closed }) => ({ open, close, closed }))));
  const guests = Array.from({ length: booking.maxGuests }, (_, i) => i + 1)
    .map((n) => `<option value="${n}"${n === 2 ? ' selected' : ''}>${n} ${n === 1 ? 'guest' : 'guests'}</option>`).join('');
  const zones = booking.zones.map((z) => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
  const phone = contacts.phone
    ? `<a class="link" href="${telHref(contacts.phone)}">${esc(contacts.phone)}</a>` : '';

  return `<!doctype html>
<!-- Generated from data/content.json by lib/render.js. Edit content in the admin panel (/admin), not here. -->
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — Italian Restaurant &amp; Bar in London</title>
  <meta name="description" content="${esc(site.metaDescription)}">
  <meta name="theme-color" content="#0f0d0b">

  <meta property="og:title" content="${name} — Italian Restaurant &amp; Bar in London">
  <meta property="og:description" content="${esc(site.metaDescription)}">
  <meta property="og:image" content="${site.heroImage}">
  <meta property="og:type" content="website">

  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="preload" as="image" href="${site.heroImage}" imagesrcset="${heroSmall} 800w, ${site.heroImage} 1600w" imagesizes="100vw">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <!-- ============ Header ============ -->
  <header class="header" id="header">
    <div class="container header__inner">
      <a class="logo" href="#top" aria-label="${name} — home">
        <span class="logo__mark" aria-hidden="true">${esc(site.name.charAt(0))}</span>
        <span class="logo__text">${name}</span>
      </a>

      <nav class="nav" id="nav" aria-label="Main navigation">
        <ul class="nav__list">
          <li><a class="nav__link" href="#menu">Menu</a></li>
          <li><a class="nav__link" href="#about">About</a></li>
          <li><a class="nav__link" href="#gallery">Gallery</a></li>
          <li><a class="nav__link" href="#contacts">Contact</a></li>
        </ul>
        <a class="btn btn--primary nav__cta" href="#booking">Book a table</a>
      </nav>

      <button class="burger" id="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <main id="main">
    <!-- ============ Hero ============ -->
    <section class="hero" id="top">
      <img class="hero__bg"
           src="${site.heroImage}"
           srcset="${heroSmall} 800w, ${site.heroImage} 1600w"
           sizes="100vw"
           alt="The ${name} dining room in the evening"
           fetchpriority="high">
      <div class="container hero__content">
        <p class="eyebrow">${esc(site.eyebrow)}</p>
        <h1 class="hero__title">${name}</h1>
        <p class="hero__lead">${esc(site.heroLead)}</p>
        <div class="hero__actions">
          <a class="btn btn--primary btn--lg" href="#booking">Book a table</a>
          <a class="btn btn--ghost btn--lg" href="#menu">View the menu</a>
        </div>
        <ul class="hero__facts">
          <li><strong>${esc(hoursFact.strong)}</strong><span>${esc(hoursFact.small)}</span></li>
          <li><strong>${esc(contacts.addressLine1)}</strong><span>${esc(contacts.addressLine2)}</span></li>
        </ul>
      </div>
      <a class="hero__scroll" href="#menu" aria-label="Scroll to the menu"></a>
    </section>

    <!-- ============ Menu ============ -->
    <section class="section" id="menu" aria-labelledby="menu-title">
      <div class="container">
        <header class="section__head">
          <p class="eyebrow">Menu</p>
          <h2 class="section__title" id="menu-title">${esc(menu.title)}</h2>
          <p class="section__lead">${esc(menu.lead)}</p>
        </header>
${renderMenu(menu)}
        <p class="menu-note">${esc(menu.note)}</p>
      </div>
    </section>

    <!-- ============ About ============ -->
    <section class="section section--alt" id="about" aria-labelledby="about-title">
      <div class="container about">
        <div class="about__media">
          <img class="about__img about__img--main" src="${thumb(about.image)}"
               srcset="${thumb(about.image)} 800w, ${about.image} 1600w"
               sizes="(min-width: 900px) 40vw, 100vw"
               alt="Inside ${name}" width="800" height="533" loading="lazy">
          ${about.accentImage ? `<img class="about__img about__img--accent" src="${thumb(about.accentImage)}" alt="" width="800" height="533" loading="lazy">` : ''}
        </div>
        <div class="about__text">
          <p class="eyebrow">About us</p>
          <h2 class="section__title" id="about-title">${esc(about.title)}</h2>
          ${about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n          ')}
          <ul class="stats">
            ${about.stats.map((s) => `<li><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></li>`).join('\n            ')}
          </ul>
        </div>
      </div>
    </section>

    <!-- ============ Gallery ============ -->
    <section class="section" id="gallery" aria-labelledby="gallery-title">
      <div class="container">
        <header class="section__head">
          <p class="eyebrow">Gallery</p>
          <h2 class="section__title" id="gallery-title">Inside ${name}</h2>
        </header>

        <ul class="gallery">${renderGallery(c.gallery)}
        </ul>
      </div>
    </section>

    <!-- ============ Booking ============ -->
    <section class="section section--alt booking" id="booking" aria-labelledby="booking-title">
      <div class="container booking__inner">
        <div class="booking__intro">
          <p class="eyebrow">Reservations</p>
          <h2 class="section__title" id="booking-title">Book a table</h2>
          <p>${esc(booking.text)}</p>
          ${contacts.phone ? `<a class="booking__phone" href="${telHref(contacts.phone)}">${esc(contacts.phone)}</a>` : ''}
        </div>

        <form class="form" id="booking-form" action="/api/bookings" method="post" novalidate
              data-hours="${bookingHours}" data-last-seating="${booking.lastSeatingMinutes}">
          <div class="form__grid">
            <div class="field">
              <label for="f-name">Name</label>
              <input id="f-name" name="name" type="text" autocomplete="name" required minlength="2" maxlength="80" placeholder="Your name">
              <p class="field__error" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="f-phone">Phone</label>
              <input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required
                     pattern="[+]?[0-9\\s()\\-]{10,20}" placeholder="+44 7700 900000">
              <p class="field__error" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="f-date">Date</label>
              <input id="f-date" name="date" type="date" required>
              <p class="field__error" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="f-time">Time</label>
              <select id="f-time" name="time" required>
                <option value="">Choose a date first</option>
              </select>
              <p class="field__error" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="f-guests">Guests</label>
              <select id="f-guests" name="guests" required>${guests}</select>
            </div>
            ${zones ? `<div class="field">
              <label for="f-zone">Seating</label>
              <select id="f-zone" name="zone">${zones}</select>
            </div>` : ''}
            <div class="field field--full">
              <label for="f-comment">Notes <span class="field__opt">(optional)</span></label>
              <textarea id="f-comment" name="comment" rows="3" maxlength="500" placeholder="Occasion, dietary requirements, high chair…"></textarea>
            </div>
          </div>

          <p class="form__error" id="form-error" role="alert" hidden></p>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Request booking</button>
          <p class="form__hint">We only use your details to manage this booking.</p>

          <div class="form__success" id="form-success" role="status" tabindex="-1" hidden></div>
        </form>
      </div>
    </section>

    <!-- ============ Contact ============ -->
    <section class="section" id="contacts" aria-labelledby="contacts-title">
      <div class="container">
        <header class="section__head">
          <p class="eyebrow">Contact</p>
          <h2 class="section__title" id="contacts-title">Find us</h2>
        </header>

        <div class="contacts">
          <div class="contact-card">
            <h3>Address</h3>
            <p>${esc(contacts.addressLine1)}<br>${esc(contacts.addressLine2)}${contacts.directions ? `<br>${esc(contacts.directions)}` : ''}</p>
            ${contacts.mapUrl ? `<a class="btn btn--ghost" href="${esc(contacts.mapUrl)}" target="_blank" rel="noopener">Open in Maps ↗</a>` : ''}
          </div>
          <div class="contact-card">
            <h3>Opening hours</h3>
            <dl class="hours">
              ${hoursGroups.map((g) => `<div><dt>${g.label}</dt><dd>${g.value}</dd></div>`).join('\n              ')}
            </dl>
            ${c.hoursNote ? `<p class="contact-card__note">${esc(c.hoursNote)}</p>` : ''}
          </div>
          <div class="contact-card">
            <h3>Get in touch</h3>
            ${phone ? `<p>${phone}</p>` : ''}
            ${contacts.email ? `<p><a class="link" href="mailto:${esc(contacts.email)}">${esc(contacts.email)}</a></p>` : ''}
            <ul class="socials">
              ${contacts.socials.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('\n              ')}
            </ul>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container footer__inner">
      <a class="logo" href="#top" aria-label="${name} — back to top">
        <span class="logo__mark" aria-hidden="true">${esc(site.name.charAt(0))}</span>
        <span class="logo__text">${name}</span>
      </a>
      <p>© <span id="year">${new Date().getFullYear()}</span> ${name}. All rights reserved.</p>
      <a class="link" href="#top">Back to top ↑</a>
    </div>
  </footer>

  <!-- Gallery lightbox -->
  <dialog class="lightbox" id="lightbox" aria-label="Photo viewer">
    <button class="lightbox__close" type="button" data-action="close" aria-label="Close">×</button>
    <button class="lightbox__nav lightbox__nav--prev" type="button" data-action="prev" aria-label="Previous photo">‹</button>
    <figure class="lightbox__figure">
      <img class="lightbox__img" id="lightbox-img" src="" alt="">
      <figcaption class="lightbox__caption" id="lightbox-caption"></figcaption>
    </figure>
    <button class="lightbox__nav lightbox__nav--next" type="button" data-action="next" aria-label="Next photo">›</button>
  </dialog>

  <script src="js/main.js" defer></script>
</body>
</html>
`;
}

export function buildIndex(content) {
  fs.writeFileSync(INDEX_FILE, renderPage(content));
}
