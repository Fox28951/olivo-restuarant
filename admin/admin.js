/* Olivo admin panel: edits data/content.json through the server API and manages bookings. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let content = null;      // working copy being edited
  let savedJSON = '';      // last saved version, to detect unsaved changes
  let section = 'general';
  let images = [];         // photos available on the server
  let bookings = [];
  let bookingFilter = 'upcoming';
  const openCategories = new WeakSet(); // menu categories whose editor is expanded

  /* ---------- Small helpers ---------- */

  // Creates DOM elements without innerHTML, so user text is never parsed as HTML.
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(Infinity)) {
      if (child != null && child !== false) el.append(child instanceof Node ? child : String(child));
    }
    return el;
  }

  async function api(url, { method = 'GET', body } = {}) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.endsWith('/login')) {
      showLogin('Your session has expired. Please log in again.');
      throw new Error('Session expired');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  let toastTimer;
  function toast(message, isError) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('toast--error', Boolean(isError));
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2500);
  }

  const thumbOf = (path) => path.replace(/(\.\w+)$/, '-sm$1');

  // Shows the small copy of a photo, falling back to the original if there is none.
  function thumbImg(path, props = {}) {
    return h('img', {
      ...props,
      src: '/' + thumbOf(path),
      onerror: (e) => {
        if (e.target.dataset.fallback) return;
        e.target.dataset.fallback = '1';
        e.target.src = '/' + path;
      },
    });
  }
  const isDirty = () => content && JSON.stringify(content) !== savedJSON;

  function markDirty() {
    $('#savebar').hidden = !isDirty();
  }

  function changed() {
    markDirty();
    render();
  }

  /* ---------- Form building blocks ---------- */

  function field(label, obj, key, opts = {}) {
    const { type = 'text', rows = 3, hint, options, span, placeholder, min, max, onInput } = opts;
    let control;
    if (type === 'textarea') {
      control = h('textarea', { rows, placeholder, value: obj[key] ?? '' });
    } else if (type === 'select') {
      control = h('select', {}, options.map((o) => h('option', { value: o.value, selected: o.value === obj[key] }, o.label)));
    } else {
      control = h('input', { type, placeholder, min, max, value: obj[key] ?? '' });
    }
    control.addEventListener('input', () => {
      obj[key] = type === 'number' ? Number(control.value) : control.value;
      markDirty();
      if (onInput) onInput(control.value);
    });
    return h('label', { class: 'fld' + (span ? ' span-all' : '') }, h('span', {}, label), control, hint && h('small', {}, hint));
  }

  function listTools(list, index, { label = 'item', horizontal } = {}) {
    const move = (to) => {
      [list[index], list[to]] = [list[to], list[index]];
      changed();
    };
    return h('div', { class: 'row-tools' },
      h('button', { type: 'button', class: 'icon-btn', title: 'Move ' + (horizontal ? 'left' : 'up'), 'aria-label': 'Move ' + label + (horizontal ? ' left' : ' up'), disabled: index === 0, onclick: () => move(index - 1) }, horizontal ? '←' : '↑'),
      h('button', { type: 'button', class: 'icon-btn', title: 'Move ' + (horizontal ? 'right' : 'down'), 'aria-label': 'Move ' + label + (horizontal ? ' right' : ' down'), disabled: index === list.length - 1, onclick: () => move(index + 1) }, horizontal ? '→' : '↓'),
      h('button', {
        type: 'button', class: 'icon-btn icon-btn--danger', title: 'Delete', 'aria-label': 'Delete ' + label,
        onclick: () => {
          if (!confirm(`Delete this ${label}?`)) return;
          list.splice(index, 1);
          changed();
        },
      }, '×'));
  }

  function imageField(label, obj, key, { allowEmpty } = {}) {
    const preview = obj[key]
      ? thumbImg(obj[key], { class: 'img-field__preview', alt: '' })
      : h('div', { class: 'img-field__preview' }, 'No photo');
    return h('div', { class: 'fld span-all' },
      h('span', {}, label),
      h('div', { class: 'img-field' },
        preview,
        h('div', { class: 'img-field__actions' },
          h('button', {
            type: 'button', class: 'btn btn--ghost btn--sm',
            onclick: async () => {
              const picked = await pickImage(obj[key]);
              if (picked) { obj[key] = picked; changed(); }
            },
          }, obj[key] ? 'Change photo' : 'Choose photo'),
          allowEmpty && obj[key] && h('button', { type: 'button', class: 'btn btn--danger btn--sm', onclick: () => { obj[key] = ''; changed(); } }, 'Remove'))));
  }

  const card = (title, ...children) => h('section', { class: 'card' }, title && h('h2', {}, title), children);
  const addButton = (text, onclick) => h('button', { type: 'button', class: 'btn btn--ghost btn--sm add-btn', onclick }, '+ ' + text);

  /* ---------- Sections ---------- */

  const sections = {
    general: {
      title: 'General',
      lead: 'Restaurant name and the first screen of the site.',
      render() {
        const s = content.site;
        return [
          card('Main screen', h('div', { class: 'grid' },
            field('Restaurant name', s, 'name', { onInput: (v) => { $('#brand-name').textContent = v; } }),
            field('Small line above the name', s, 'eyebrow', { placeholder: 'Ristorante & Bar · Since 2016' }),
            field('Short description', s, 'heroLead', { type: 'textarea', span: true }),
            imageField('Background photo', s, 'heroImage'))),
          card('Search engines', field('Description shown in Google results', s, 'metaDescription', { type: 'textarea', rows: 2, hint: 'Up to about 160 characters works best.' })),
        ];
      },
    },

    menu: {
      title: 'Menu & prices',
      lead: 'Dishes are grouped into tabs on the site. Click a category to open it.',
      render() {
        const m = content.menu;
        return [
          card('Section text', h('div', { class: 'grid' },
            field('Heading', m, 'title', { span: true }),
            field('Introduction', m, 'lead', { type: 'textarea', rows: 2, span: true }),
            field('Note under the menu', m, 'note', { type: 'textarea', rows: 2, span: true, hint: 'For example service charge or allergy information.' }))),
          m.categories.map((cat, ci) => {
            const details = h('details', { class: 'card', open: openCategories.has(cat) },
              h('summary', {}, cat.title || 'Untitled category', h('span', { class: 'muted' }, `${cat.items.length} dishes`)),
              h('div', { class: 'row-head' },
                h('div', { class: 'row-head__title' }, field('Category name (tab title)', cat, 'title')),
                listTools(m.categories, ci, { label: 'category' })),
              cat.items.map((item, ii) => h('div', { class: 'card card--nested' },
                h('div', { class: 'row-head' },
                  h('div', { class: 'row-head__title' }, item.name || 'New dish'),
                  listTools(cat.items, ii, { label: 'dish' })),
                h('div', { class: 'grid' },
                  field('Dish name', item, 'name'),
                  field('Price', item, 'price', { placeholder: '£18' }),
                  field('Description', item, 'description', { type: 'textarea', rows: 2, span: true }),
                  field('Label (optional)', item, 'tag', { placeholder: 'Signature, Vegetarian…' }),
                  field('Label colour', item, 'tagStyle', { type: 'select', options: [
                    { value: '', label: 'Gold' }, { value: 'veg', label: 'Green (vegetarian)' }, { value: 'hot', label: 'Red (spicy)' },
                  ] }),
                  imageField('Photo (optional)', item, 'image', { allowEmpty: true })))),
              addButton('Add dish', () => {
                cat.items.push({ name: '', description: '', price: '', image: '', tag: '', tagStyle: '' });
                changed();
              }));
            details.addEventListener('toggle', () => {
              if (details.open) openCategories.add(cat); else openCategories.delete(cat);
            });
            return details;
          }),
          addButton('Add category', () => {
            const cat = { title: 'New category', items: [] };
            m.categories.push(cat);
            openCategories.add(cat);
            changed();
          }),
        ];
      },
    },

    about: {
      title: 'About',
      lead: 'The story of the restaurant, two photos and key numbers.',
      render() {
        const a = content.about;
        return [
          card('Text',
            field('Heading', a, 'title'),
            h('div', { class: 'stack', style: 'margin-top:1rem' },
              a.paragraphs.map((_, i) => h('div', { class: 'card card--nested' },
                h('div', { class: 'row-head' }, h('div', { class: 'row-head__title' }, `Paragraph ${i + 1}`), listTools(a.paragraphs, i, { label: 'paragraph' })),
                field('Text', a.paragraphs, i, { type: 'textarea', rows: 4 })))),
            addButton('Add paragraph', () => { a.paragraphs.push(''); changed(); })),
          card('Photos', h('div', { class: 'grid' },
            imageField('Main photo', a, 'image'),
            imageField('Small overlapping photo', a, 'accentImage', { allowEmpty: true }))),
          card('Numbers',
            a.stats.map((s, i) => h('div', { class: 'card card--nested' },
              h('div', { class: 'row-head' }, h('div', { class: 'row-head__title' }, s.value || 'New number'), listTools(a.stats, i, { label: 'number' })),
              h('div', { class: 'grid' }, field('Number', s, 'value', { placeholder: '40+' }), field('Caption', s, 'label', { placeholder: 'wines by the glass' })))),
            a.stats.length < 4 && addButton('Add number', () => { a.stats.push({ value: '', label: '' }); changed(); })),
        ];
      },
    },

    gallery: {
      title: 'Gallery',
      lead: 'The first photo is shown large, the fourth is shown tall. Write a short description for each photo — it helps visitors using screen readers.',
      render() {
        const g = content.gallery;
        return [
          card(null,
            g.length ? h('div', { class: 'thumbs' }, g.map((item, i) => h('div', { class: 'thumb' },
              thumbImg(item.image, { alt: '' }),
              field('Description', item, 'alt'),
              listTools(g, i, { label: 'photo', horizontal: true })))) : h('p', { class: 'empty' }, 'No photos yet.'),
            addButton('Add photo', async () => {
              const picked = await pickImage();
              if (picked) { g.push({ image: picked, alt: '' }); changed(); }
            })),
        ];
      },
    },

    contact: {
      title: 'Contact & hours',
      lead: 'Address, phone, opening hours and booking settings.',
      render() {
        const c = content.contacts;
        const b = content.booking;
        return [
          card('Address', h('div', { class: 'grid' },
            field('Street', c, 'addressLine1'),
            field('City and postcode', c, 'addressLine2'),
            field('How to get here', c, 'directions', { span: true }),
            field('Map link', c, 'mapUrl', { type: 'url', span: true, hint: 'Open the place in Google Maps, press Share and paste the link here.' }))),
          card('Phone, email and social media',
            h('div', { class: 'grid' },
              field('Phone', c, 'phone', { type: 'tel' }),
              field('Email', c, 'email', { type: 'email' })),
            h('div', { class: 'stack', style: 'margin-top:1rem' }, c.socials.map((s, i) => h('div', { class: 'card card--nested' },
              h('div', { class: 'row-head' }, h('div', { class: 'row-head__title' }, s.label || 'New link'), listTools(c.socials, i, { label: 'link' })),
              h('div', { class: 'grid' }, field('Name', s, 'label', { placeholder: 'Instagram' }), field('Link', s, 'url', { type: 'url', placeholder: 'https://' }))))),
            addButton('Add social link', () => { c.socials.push({ label: '', url: '' }); changed(); })),
          card('Opening hours',
            content.hours.map((d) => h('div', { class: 'hours-row' },
              h('div', { class: 'hours-row__day' }, d.day),
              d.closed ? h('div', { class: 'muted', style: 'padding-bottom:.6rem' }, 'Closed') : field('Opens', d, 'open', { type: 'time' }),
              d.closed ? h('div') : field('Closes', d, 'close', { type: 'time' }),
              h('label', { class: 'check' },
                h('input', { type: 'checkbox', checked: d.closed, onchange: (e) => { d.closed = e.target.checked; changed(); } }),
                'Closed'))),
            h('p', { class: 'muted small' }, 'If the closing time is earlier than the opening time (e.g. 01:00), it means after midnight.'),
            field('Note under the hours', content, 'hoursNote')),
          card('Booking form', h('div', { class: 'grid' },
            field('Text next to the form', b, 'text', { type: 'textarea', rows: 2, span: true }),
            field('Maximum guests per booking', b, 'maxGuests', { type: 'number', min: 1, max: 30 }),
            field('Last booking before closing (minutes)', b, 'lastSeatingMinutes', { type: 'number', min: 0, max: 240 }),
            h('div', { class: 'span-all stack' },
              h('span', { class: 'fld' }, h('span', {}, 'Seating options')),
              b.zones.map((_, i) => h('div', { class: 'row-head' }, h('div', { class: 'row-head__title' }, field('', b.zones, i)), listTools(b.zones, i, { label: 'option' }))),
              addButton('Add seating option', () => { b.zones.push(''); changed(); })))),
        ];
      },
    },

    bookings: {
      title: 'Bookings',
      lead: 'Requests from the booking form. Call the guest, then mark the booking as confirmed.',
      render() {
        const today = new Date().toISOString().slice(0, 10);
        const filters = {
          upcoming: { label: 'Upcoming', test: (b) => b.date >= today && b.status !== 'cancelled' },
          new: { label: 'New', test: (b) => b.status === 'new' },
          all: { label: 'All', test: () => true },
        };
        const list = bookings.filter(filters[bookingFilter].test).sort((x, y) => (bookingFilter === 'all'
          ? y.createdAt.localeCompare(x.createdAt)
          : (x.date + x.time).localeCompare(y.date + y.time)));

        return [
          h('div', { class: 'filters' },
            Object.entries(filters).map(([key, f]) => h('button', {
              type: 'button', class: 'chip' + (key === bookingFilter ? ' is-active' : ''),
              onclick: () => { bookingFilter = key; render(); },
            }, `${f.label} (${bookings.filter(f.test).length})`)),
            h('button', { type: 'button', class: 'chip', onclick: () => loadBookings().then(render) }, '↻ Refresh')),
          list.length ? list.map(renderBooking) : h('div', { class: 'card empty' }, 'No bookings here yet.'),
        ];
      },
    },

    settings: {
      title: 'Password',
      lead: 'Change the admin password. Other devices will be logged out.',
      render() {
        const current = h('input', { type: 'password', autocomplete: 'current-password', required: true });
        const next = h('input', { type: 'password', autocomplete: 'new-password', required: true, minLength: 10 });
        const repeat = h('input', { type: 'password', autocomplete: 'new-password', required: true });
        const error = h('p', { class: 'alert', role: 'alert', hidden: true });
        const form = h('form', { class: 'stack', style: 'max-width:420px' },
          h('label', { class: 'fld' }, h('span', {}, 'Current password'), current),
          h('label', { class: 'fld' }, h('span', {}, 'New password'), next, h('small', {}, 'At least 10 characters.')),
          h('label', { class: 'fld' }, h('span', {}, 'Repeat new password'), repeat),
          error,
          h('button', { class: 'btn btn--primary', type: 'submit' }, 'Change password'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          error.hidden = true;
          if (next.value !== repeat.value) {
            error.textContent = 'The new passwords do not match.';
            error.hidden = false;
            return;
          }
          try {
            await api('/api/admin/password', { method: 'POST', body: { current: current.value, next: next.value } });
            form.reset();
            toast('Password changed');
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
          }
        });
        return [card(null, form)];
      },
    },
  };

  function renderBooking(b) {
    const when = new Date(b.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const status = h('select', {
      'aria-label': 'Status',
      onchange: async (e) => {
        try {
          Object.assign(b, await api('/api/admin/bookings/' + b.id, { method: 'PATCH', body: { status: e.target.value } }));
          updateBadge();
          render();
          toast('Booking updated');
        } catch (err) { toast(err.message, true); }
      },
    }, ['new', 'confirmed', 'cancelled'].map((s) => h('option', { value: s, selected: s === b.status }, s[0].toUpperCase() + s.slice(1))));

    return h('article', { class: 'card booking' },
      h('div', { class: 'booking__when' }, h('strong', {}, b.time), when),
      h('div', { class: 'booking__who' },
        h('strong', {}, b.name), h('span', { class: 'status status--' + b.status }, b.status),
        h('p', {}, h('a', { href: 'tel:' + b.phone.replace(/[^\d+]/g, '') }, b.phone), ` · ${b.guests} ${b.guests === 1 ? 'guest' : 'guests'}${b.zone ? ' · ' + b.zone : ''}`),
        b.comment && h('p', {}, '“' + b.comment + '”'),
        h('p', { class: 'small' }, 'Received ' + new Date(b.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))),
      h('div', { class: 'booking__tools' },
        h('label', { class: 'fld' }, status),
        h('button', {
          type: 'button', class: 'btn btn--danger btn--sm',
          onclick: async () => {
            if (!confirm(`Delete the booking from ${b.name}?`)) return;
            try {
              await api('/api/admin/bookings/' + b.id, { method: 'DELETE' });
              bookings = bookings.filter((x) => x !== b);
              updateBadge();
              render();
            } catch (err) { toast(err.message, true); }
          },
        }, 'Delete')));
  }

  /* ---------- Rendering and navigation ---------- */

  function render() {
    const def = sections[section];
    const scroll = window.scrollY;
    $('#content').replaceChildren(
      h('h1', {}, def.title),
      h('p', { class: 'lead' }, def.lead),
      ...def.render().flat());
    window.scrollTo(0, scroll);
  }

  function go(name) {
    if (!sections[name]) name = 'general';
    section = name;
    $$('.sidebar__link').forEach((b) => b.classList.toggle('is-active', b.dataset.section === name));
    history.replaceState(null, '', '#' + name);
    $('#sidebar').classList.remove('is-open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
    render();
    window.scrollTo(0, 0);
    if (name === 'bookings') loadBookings().then(render).catch(() => {});
  }

  $('#sidebar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-section]');
    if (btn) go(btn.dataset.section);
  });

  window.addEventListener('hashchange', () => {
    if (content && location.hash.slice(1) !== section) go(location.hash.slice(1));
  });

  $('#menu-toggle').addEventListener('click', () => {
    const open = $('#sidebar').classList.toggle('is-open');
    $('#menu-toggle').setAttribute('aria-expanded', String(open));
  });

  /* ---------- Saving ---------- */

  $('#save').addEventListener('click', async () => {
    const btn = $('#save');
    btn.disabled = true;
    try {
      content = await api('/api/admin/content', { method: 'PUT', body: content });
      savedJSON = JSON.stringify(content);
      markDirty();
      render();
      toast('Saved — the site is updated');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $('#discard').addEventListener('click', () => {
    if (!confirm('Discard all unsaved changes?')) return;
    content = JSON.parse(savedJSON);
    $('#brand-name').textContent = content.site.name;
    markDirty();
    render();
  });

  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });

  /* ---------- Bookings ---------- */

  async function loadBookings() {
    bookings = await api('/api/admin/bookings');
    updateBadge();
  }

  function updateBadge() {
    const count = bookings.filter((b) => b.status === 'new').length;
    const badge = $('#bookings-badge');
    badge.textContent = count;
    badge.hidden = count === 0;
  }

  /* ---------- Image picker and upload ---------- */

  const picker = $('#picker');
  let pickResolve = null;

  function pickImage(current) {
    return new Promise((resolve) => {
      pickResolve = resolve;
      renderPicker(current);
      $('#upload-status').textContent = '';
      picker.showModal();
    });
  }

  function closePicker(value) {
    if (pickResolve) pickResolve(value || null);
    pickResolve = null;
    if (picker.open) picker.close();
  }

  picker.addEventListener('close', () => closePicker(null));
  picker.addEventListener('click', (e) => {
    if (e.target === picker || e.target.closest('[data-close]')) closePicker(null);
  });

  function renderPicker(current) {
    $('#picker-grid').replaceChildren(...images.map((img) => h('li', { class: 'picker__item' },
      h('button', {
        type: 'button', class: 'picker__choose' + (img === current ? ' is-current' : ''), title: img,
        onclick: () => closePicker(img),
      }, thumbImg(img, { alt: img.split('/').pop(), loading: 'lazy' })),
      img.startsWith('assets/uploads/') && h('button', {
        type: 'button', class: 'icon-btn icon-btn--danger picker__delete', title: 'Delete photo', 'aria-label': 'Delete photo',
        onclick: async () => {
          if (!confirm('Delete this photo from the server?')) return;
          try {
            await api('/api/admin/images?path=' + encodeURIComponent(img), { method: 'DELETE' });
            images = images.filter((x) => x !== img);
            renderPicker(current);
          } catch (err) { toast(err.message, true); }
        },
      }, '×'))));
  }

  // Resizes in the browser so the server only stores web-sized JPEGs.
  async function toJpeg(file, maxWidth) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  $('#upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = $('#upload-status');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      status.textContent = 'Please choose a JPEG, PNG or WebP photo.';
      return;
    }
    status.textContent = 'Uploading…';
    try {
      const [full, small] = await Promise.all([toJpeg(file, 1920), toJpeg(file, 800)]);
      const { image } = await api('/api/admin/upload', { method: 'POST', body: { name: file.name, full, small } });
      images.push(image);
      closePicker(image);
    } catch (err) {
      status.textContent = err.message;
    }
  });

  /* ---------- Login ---------- */

  function showLogin(message) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    const error = $('#login-error');
    error.textContent = message || '';
    error.hidden = !message;
    $('#login-password').focus();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#login-error');
    error.hidden = true;
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('#login-password').value } });
      $('#login-password').value = '';
      await startApp();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  $('#logout').addEventListener('click', async () => {
    if (isDirty() && !confirm('You have unsaved changes. Log out anyway?')) return;
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    content = null;
    showLogin();
  });

  async function startApp() {
    [content, images] = await Promise.all([api('/api/admin/content'), api('/api/admin/images')]);
    savedJSON = JSON.stringify(content);
    $('#brand-name').textContent = content.site.name;
    $('#login').hidden = true;
    $('#app').hidden = false;
    markDirty();
    go(location.hash.slice(1));
    loadBookings().catch(() => {});
  }

  (async function init() {
    try {
      const session = await api('/api/admin/session');
      if (session.loggedIn) await startApp();
      else showLogin(session.passwordSet ? '' : 'No admin password has been set yet. Set ADMIN_PASSWORD on the host or run "npm run set-password" on the server.');
    } catch (err) {
      showLogin('Cannot reach the server. Is it running?');
    }
  })();
})();
