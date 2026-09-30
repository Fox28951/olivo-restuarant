/* Olivo — site interactions: navigation, menu tabs, gallery, booking form */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  $('#year').textContent = new Date().getFullYear();

  /* ---------- Header background on scroll ---------- */
  const header = $('#header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  const burger = $('#burger');
  const nav = $('#nav');

  function setNav(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('nav-open', open);
  }

  burger.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setNav(false);
      burger.focus();
    }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setNav(false); });

  /* ---------- Active navigation link ---------- */
  const navLinks = $$('.nav__link');
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => {
        link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main > section[id]').forEach((s) => sectionObserver.observe(s));

  /* ---------- Menu tabs ---------- */
  const tabs = $$('[role="tab"]');

  function selectTab(tab, focus) {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab, false));
    tab.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      selectTab(tabs[(keys[e.key] + tabs.length) % tabs.length], true);
    });
  });

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$('.section__head, .about__media, .about__text, .gallery__item, .booking__intro, .form, .contact-card');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  revealEls.forEach((el) => {
    el.classList.add('reveal');
    revealObserver.observe(el);
  });

  /* ---------- Gallery lightbox ---------- */
  const lightbox = $('#lightbox');
  const lbImg = $('#lightbox-img');
  const lbCaption = $('#lightbox-caption');
  const galleryBtns = $$('.gallery__btn');
  let current = 0;
  let lastFocus = null;

  function showImage(index) {
    current = (index + galleryBtns.length) % galleryBtns.length;
    const btn = galleryBtns[current];
    const thumb = $('img', btn);
    lbImg.src = btn.dataset.full;
    lbImg.alt = thumb.alt;
    lbCaption.textContent = `${thumb.alt} · ${current + 1} / ${galleryBtns.length}`;
  }

  galleryBtns.forEach((btn, i) => {
    btn.setAttribute('aria-label', 'Open photo: ' + $('img', btn).alt);
    btn.addEventListener('click', () => {
      lastFocus = btn;
      showImage(i);
      lightbox.showModal();
    });
  });

  lightbox.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close' || e.target === lightbox) lightbox.close();
    else if (action === 'prev') showImage(current - 1);
    else if (action === 'next') showImage(current + 1);
  });

  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showImage(current - 1);
    if (e.key === 'ArrowRight') showImage(current + 1);
  });

  lightbox.addEventListener('close', () => {
    lbImg.removeAttribute('src');
    if (lastFocus) lastFocus.focus();
  });

  // Swipe on touch screens
  let touchX = null;
  lightbox.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) showImage(current + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ---------- Booking form ---------- */
  const form = $('#booking-form');
  const dateInput = $('#f-date');
  const timeSelect = $('#f-time');
  const success = $('#form-success');
  const formError = $('#form-error');
  const submitBtn = $('button[type="submit"]', form);

  // Opening hours Monday..Sunday and last seating (minutes before closing) come from the page.
  const hours = JSON.parse(form.dataset.hours || '[]');
  const lastSeating = Number(form.dataset.lastSeating) || 0;

  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const parseDate = (value) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const today = new Date();
  dateInput.min = toISODate(today);
  dateInput.max = toISODate(new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()));

  function fillTimes() {
    const prev = timeSelect.value;
    timeSelect.length = 1;
    if (!dateInput.value) {
      timeSelect.options[0].textContent = 'Choose a date first';
      return;
    }

    const date = parseDate(dateInput.value);
    const day = hours[(date.getDay() + 6) % 7]; // hours[] starts on Monday
    if (!day || day.closed) {
      timeSelect.options[0].textContent = 'Closed on this day';
      return;
    }

    const open = toMinutes(day.open);
    let close = toMinutes(day.close);
    if (close <= open) close += 24 * 60; // closes after midnight
    const isToday = toISODate(date) === toISODate(new Date());
    const now = new Date();
    const earliest = now.getHours() * 60 + now.getMinutes() + 30; // at least 30 minutes' notice

    for (let m = open; m <= close - lastSeating; m += 30) {
      if (isToday && m < earliest) continue;
      const label = `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
      timeSelect.add(new Option(label, label));
    }
    timeSelect.options[0].textContent = timeSelect.length > 1 ? 'Choose a time' : 'No tables left today';
    if ([...timeSelect.options].some((o) => o.value === prev)) timeSelect.value = prev;
  }
  fillTimes();
  dateInput.addEventListener('change', fillTimes);

  const messages = {
    name: { valueMissing: 'Please enter your name', tooShort: 'Your name is too short' },
    phone: { valueMissing: 'Please enter your phone number', patternMismatch: 'Please check the number, e.g. +44 7700 900000' },
    date: { valueMissing: 'Please choose a date', rangeUnderflow: 'This date has passed', rangeOverflow: 'Bookings open two months ahead', badInput: 'Invalid date' },
    time: { valueMissing: 'Please choose a time' },
  };

  function validateField(input) {
    const field = input.closest('.field');
    const error = $('.field__error', field);
    let text = '';
    if (!input.validity.valid) {
      const custom = messages[input.name] || {};
      const key = Object.keys(custom).find((k) => input.validity[k]);
      text = key ? custom[key] : input.validationMessage;
    }
    field.classList.toggle('is-invalid', Boolean(text));
    input.setAttribute('aria-invalid', String(Boolean(text)));
    if (error) error.textContent = text;
    return !text;
  }

  const required = $$('input[required], select[required]', form);
  required.forEach((input) => {
    const evt = input.tagName === 'SELECT' || input.type === 'date' ? 'change' : 'blur';
    input.addEventListener(evt, () => validateField(input));
    input.addEventListener('input', () => {
      if (input.closest('.field').classList.contains('is-invalid')) validateField(input);
    });
  });

  // Sends the request to the server. When the page is opened as a local file there is
  // no server, so the form only shows the confirmation (preview mode).
  async function sendBooking(data) {
    if (!location.protocol.startsWith('http')) return;
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Something went wrong. Please call us to book.');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    const invalid = required.filter((input) => !validateField(input));
    if (invalid.length) {
      invalid[0].focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    try {
      await sendBooking(data);
    } catch (err) {
      formError.textContent = err.message;
      formError.hidden = false;
      return;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request booking';
    }

    const dateLabel = parseDate(data.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const guests = `${data.guests} ${data.guests === '1' ? 'guest' : 'guests'}`;
    success.innerHTML = `
      <div class="form__success-icon" aria-hidden="true">✓</div>
      <h3>Thank you, ${escapeHTML(data.name)}!</h3>
      <p>We have received your request for ${escapeHTML(dateLabel)} at ${escapeHTML(data.time)}, ${escapeHTML(guests)}.
         We will call ${escapeHTML(data.phone)} to confirm.</p>
      <button class="btn btn--ghost" type="button" data-reset>Make another booking</button>`;
    success.hidden = false;
    success.focus();
  });

  success.addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset]')) return;
    form.reset();
    fillTimes();
    $$('.field', form).forEach((f) => f.classList.remove('is-invalid'));
    success.hidden = true;
    $('#f-name').focus();
  });

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
