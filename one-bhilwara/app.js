/* One Bhilwara — app shell, router and views (no build step, no dependencies). */
(function () {
  'use strict';

  const D = window.OB_DATA;
  const $ = (sel, el = document) => el.querySelector(sel);
  const main = $('#main');

  /* ---------- storage (all keys namespaced, every access guarded) ---------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('ob:' + key); return v === null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem('ob:' + key, JSON.stringify(val)); } catch (_) { /* private mode */ }
    }
  };

  /* ---------- i18n ---------- */
  const STR = {
    en: {
      appName: 'One Bhilwara', search: 'Search', offline: 'You are offline — saved content is still available.',
      tabHome: 'Home', tabExplore: 'Explore', tabDirectory: 'Directory', tabServices: 'Services', tabSos: 'SOS',
      greetMorning: 'Good morning', greetAfternoon: 'Good afternoon', greetEvening: 'Good evening',
      heroSub: 'Everything about the Textile City, in one place.',
      quick: 'Quick access', transport: 'Transport', saved: 'Saved', about: 'About',
      emergencyNumbers: 'Emergency numbers', seeAll: 'See all', placesToVisit: 'Places to visit',
      didYouKnow: 'Did you know?', call: 'Call', map: 'Map', open: 'Open', directions: 'Directions',
      sosTitle: 'Emergency', sosSub: 'Tap a number to call. 112 connects police, fire and ambulance.',
      tapToCall: 'Tap to call', shareLocation: '📍 Share my location', locShared: 'Location link copied',
      locFail: 'Could not get your location', allHelplines: 'All helplines',
      exploreTitle: 'Explore Bhilwara', exploreSub: 'Temples, forts, lakes and culture in and around the city. Distances are approximate.',
      all: 'All', temple: 'Temples', heritage: 'Heritage', nature: 'Nature', culture: 'Culture', km: 'km',
      directoryTitle: 'City directory', directorySub: 'Opens the live listing in Maps, so timings and numbers stay current.',
      servicesTitle: 'e-Services', servicesSub: 'Official government portals. Opens in your browser.',
      transportTitle: 'Getting around', transportSub: 'Rail, road and air connections.',
      savedTitle: 'Saved', savedEmpty: 'Nothing saved yet. Tap ☆ on any place, office or number to keep it here.',
      searchTitle: 'Search', searchPlaceholder: 'Search places, offices, helplines…', noResults: 'No results',
      aboutTitle: 'About One Bhilwara',
      aboutBody: 'An independent city companion for Bhilwara, Rajasthan. Works offline once opened. Helpline numbers are national or state numbers; always verify local details before travelling.',
      install: 'Install One Bhilwara', installSub: 'Add to your home screen — works offline.', installBtn: 'Install',
      updateReady: 'A new version is ready.', reload: 'Reload', savedToast: 'Saved', removedToast: 'Removed',
      weatherNow: 'Now in Bhilwara', weatherOff: 'Weather unavailable right now', feels: 'Humidity',
      version: 'Version'
    },
    hi: {
      appName: 'वन भीलवाड़ा', search: 'खोजें', offline: 'आप ऑफ़लाइन हैं — सहेजी गई जानकारी उपलब्ध है।',
      tabHome: 'होम', tabExplore: 'घूमें', tabDirectory: 'निर्देशिका', tabServices: 'सेवाएँ', tabSos: 'SOS',
      greetMorning: 'सुप्रभात', greetAfternoon: 'नमस्कार', greetEvening: 'शुभ संध्या',
      heroSub: 'वस्त्र नगरी की हर जानकारी, एक ही जगह।',
      quick: 'त्वरित पहुँच', transport: 'यातायात', saved: 'सहेजे गए', about: 'परिचय',
      emergencyNumbers: 'आपातकालीन नंबर', seeAll: 'सभी देखें', placesToVisit: 'घूमने की जगहें',
      didYouKnow: 'क्या आप जानते हैं?', call: 'कॉल', map: 'नक्शा', open: 'खोलें', directions: 'रास्ता',
      sosTitle: 'आपातकाल', sosSub: 'कॉल करने के लिए नंबर दबाएँ। 112 पर पुलिस, फायर और एम्बुलेंस मिलती है।',
      tapToCall: 'कॉल करें', shareLocation: '📍 मेरी लोकेशन भेजें', locShared: 'लोकेशन लिंक कॉपी हुआ',
      locFail: 'लोकेशन नहीं मिल सकी', allHelplines: 'सभी हेल्पलाइन',
      exploreTitle: 'भीलवाड़ा घूमें', exploreSub: 'शहर और आसपास के मंदिर, किले, तालाब और संस्कृति। दूरी अनुमानित है।',
      all: 'सभी', temple: 'मंदिर', heritage: 'धरोहर', nature: 'प्रकृति', culture: 'संस्कृति', km: 'किमी',
      directoryTitle: 'शहर निर्देशिका', directorySub: 'नक्शे में ताज़ा जानकारी खुलती है, ताकि समय और नंबर सही रहें।',
      servicesTitle: 'ई-सेवाएँ', servicesSub: 'आधिकारिक सरकारी पोर्टल। ब्राउज़र में खुलते हैं।',
      transportTitle: 'आवागमन', transportSub: 'रेल, सड़क और हवाई संपर्क।',
      savedTitle: 'सहेजे गए', savedEmpty: 'अभी कुछ सहेजा नहीं गया। किसी भी जगह, कार्यालय या नंबर पर ☆ दबाएँ।',
      searchTitle: 'खोजें', searchPlaceholder: 'जगह, कार्यालय, हेल्पलाइन खोजें…', noResults: 'कोई परिणाम नहीं',
      aboutTitle: 'वन भीलवाड़ा के बारे में',
      aboutBody: 'भीलवाड़ा, राजस्थान के लिए एक स्वतंत्र सिटी ऐप। एक बार खोलने के बाद ऑफ़लाइन भी चलता है। हेल्पलाइन नंबर राष्ट्रीय या राज्य स्तरीय हैं; यात्रा से पहले स्थानीय जानकारी की पुष्टि करें।',
      install: 'वन भीलवाड़ा इंस्टॉल करें', installSub: 'होम स्क्रीन पर जोड़ें — ऑफ़लाइन भी चलेगा।', installBtn: 'इंस्टॉल',
      updateReady: 'नया संस्करण तैयार है।', reload: 'रीलोड', savedToast: 'सहेजा गया', removedToast: 'हटाया गया',
      weatherNow: 'भीलवाड़ा में अभी', weatherOff: 'मौसम की जानकारी अभी उपलब्ध नहीं', feels: 'नमी',
      version: 'संस्करण'
    }
  };

  let lang = store.get('lang', (navigator.language || '').toLowerCase().startsWith('hi') ? 'hi' : 'en');
  const t = (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k;
  const L = (obj, base) => (lang === 'hi' ? obj[base === 'd' ? 'dhi' : 'hi'] : obj[base === 'd' ? 'den' : 'en']) || obj.en;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mapsUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  const dirUrl = (q) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);

  function applyStaticI18n() {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
    $('#btn-lang').textContent = lang === 'hi' ? 'EN' : 'हि';
    $('#btn-lang').setAttribute('aria-label', lang === 'hi' ? 'Switch to English' : 'हिंदी में देखें');
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    const theme = store.get('theme', null);
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('#btn-theme').textContent = dark ? '☀️' : '🌙';
    $('#btn-theme').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* ---------- favourites ---------- */
  let favs = new Set(store.get('favs', []));
  const isFav = (id) => favs.has(id);
  function toggleFav(id) {
    if (favs.has(id)) { favs.delete(id); toast(t('removedToast')); } else { favs.add(id); toast(t('savedToast')); }
    store.set('favs', [...favs]);
  }
  const favBtn = (id, label) =>
    `<button class="fav" data-fav="${esc(id)}" aria-pressed="${isFav(id)}" aria-label="${esc(label)}">${isFav(id) ? '★' : '☆'}</button>`;

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = '';
    el.append(document.createTextNode(msg));
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = action.fn;
      el.append(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    if (!action) toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* ---------- lookups for search & saved ---------- */
  function allEntries() {
    const out = [];
    D.emergency.forEach((e) => out.push({ kind: 'num', id: e.id, icon: e.icon, title: L(e), sub: e.num, num: e.num, text: `${e.en} ${e.hi} ${e.num}` }));
    D.directory.forEach((cat) => cat.items.forEach((i) =>
      out.push({ kind: 'map', id: i.id, icon: cat.icon, title: L(i), sub: L(cat), q: i.q, text: `${i.en} ${i.hi} ${cat.en} ${cat.hi}` })));
    D.places.forEach((p) => out.push({ kind: 'place', id: p.id, icon: p.icon, title: L(p), sub: `~${p.km} ${t('km')} · ${t(p.tag)}`, q: p.q, text: `${p.en} ${p.hi} ${p.den} ${p.dhi}` }));
    D.transport.forEach((x) => out.push({ kind: 'map', id: x.id, icon: x.icon, title: L(x), sub: L(x, 'd'), q: x.q, text: `${x.en} ${x.hi} ${x.den}` }));
    D.services.forEach((s) => out.push({ kind: 'link', id: s.id, icon: s.icon, title: L(s), sub: L(s, 'd'), url: s.url, text: `${s.en} ${s.hi} ${s.den}` }));
    return out;
  }

  function entryRow(e) {
    let action = '';
    if (e.kind === 'num') action = `<a class="pill call" href="tel:${esc(e.num)}">📞 <span class="lbl">${esc(t('call'))}</span></a>`;
    else if (e.kind === 'link') action = `<a class="pill" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(t('open'))} ↗</a>`;
    else action = `<a class="pill" href="${esc(mapsUrl(e.q))}" target="_blank" rel="noopener">🗺️ <span class="lbl">${esc(t('map'))}</span></a>`;
    return `<li class="row"><span class="emoji" aria-hidden="true">${e.icon}</span>
      <div class="grow"><div class="title">${esc(e.title)}</div><div class="sub">${esc(e.sub)}</div></div>
      <div class="row-actions">${action}${favBtn(e.id, e.title)}</div></li>`;
  }

  /* ---------- views ---------- */
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? t('greetMorning') : h < 17 ? t('greetAfternoon') : t('greetEvening');
  }

  function numRow(e) {
    return entryRow({ kind: 'num', id: e.id, icon: e.icon, title: L(e), sub: e.num, num: e.num });
  }

  function placeCard(p) {
    return `<article class="card place">
      <div class="place-top"><span class="emoji" aria-hidden="true">${p.icon}</span>
        <div class="grow"><h3>${esc(L(p))}</h3><span class="badge">~${p.km} ${esc(t('km'))} · ${esc(t(p.tag))}</span></div>
        ${favBtn(p.id, L(p))}</div>
      <p class="muted small">${esc(L(p, 'd'))}</p>
      <div class="place-actions">
        <a class="pill primary" href="${esc(dirUrl(p.q))}" target="_blank" rel="noopener">🧭 ${esc(t('directions'))}</a>
        <a class="pill" href="${esc(mapsUrl(p.q))}" target="_blank" rel="noopener">🗺️ ${esc(t('map'))}</a>
      </div></article>`;
  }

  const views = {
    home() {
      const fact = D.facts[new Date().getDate() % D.facts.length];
      const featured = D.places.filter((p) => ['p-harni', 'p-pur', 'p-mandalgarh'].includes(p.id));
      return `<div class="page">
        <section class="hero">
          <div><h1>${esc(greeting())} 🙏</h1><p>${esc(t('heroSub'))}</p></div>
          <div class="weather" id="weather" aria-live="polite">${weatherHtml(store.get('weather', null))}</div>
        </section>
        <div id="install-slot"></div>
        <section class="section" aria-labelledby="h-quick">
          <h2 id="h-quick">${esc(t('quick'))}</h2>
          <div class="tiles">
            <a class="tile sos" href="#/sos"><span>🆘</span>${esc(t('tabSos'))}</a>
            <a class="tile" href="#/explore"><span>🧭</span>${esc(t('tabExplore'))}</a>
            <a class="tile" href="#/directory"><span>📇</span>${esc(t('tabDirectory'))}</a>
            <a class="tile" href="#/services"><span>🧾</span>${esc(t('tabServices'))}</a>
            <a class="tile" href="#/transport"><span>🚆</span>${esc(t('transport'))}</a>
            <a class="tile" href="#/saved"><span>⭐</span>${esc(t('saved'))}</a>
            <a class="tile" href="#/search"><span>🔍</span>${esc(t('search'))}</a>
            <a class="tile" href="#/about"><span>ℹ️</span>${esc(t('about'))}</a>
          </div>
        </section>
        <section class="section" aria-labelledby="h-em">
          <div class="section-head"><h2 id="h-em">${esc(t('emergencyNumbers'))}</h2><a href="#/sos">${esc(t('seeAll'))} →</a></div>
          <ul class="list card">${D.emergency.filter((e) => e.priority).map(numRow).join('')}</ul>
        </section>
        <section class="section" aria-labelledby="h-pl">
          <div class="section-head"><h2 id="h-pl">${esc(t('placesToVisit'))}</h2><a href="#/explore">${esc(t('seeAll'))} →</a></div>
          <div class="places">${featured.map(placeCard).join('')}</div>
        </section>
        <section class="section" aria-labelledby="h-fact">
          <h2 id="h-fact">${esc(t('didYouKnow'))}</h2>
          <div class="fact"><span aria-hidden="true">💡</span><p>${esc(L(fact))}</p></div>
        </section>
      </div>`;
    },

    sos() {
      return `<div class="page">
        <section class="sos-hero">
          <h1>${esc(t('sosTitle'))}</h1>
          <p class="muted">${esc(t('sosSub'))}</p>
          <a class="sos-big" href="tel:112" aria-label="Call 112">112<small>${esc(t('tapToCall'))}</small></a>
          <button class="pill share-loc" id="share-loc">${esc(t('shareLocation'))}</button>
        </section>
        <div class="sos-grid">${D.emergency.filter((e) => e.priority && e.num !== '112').map((e) =>
          `<a class="sos-btn" href="tel:${e.num}"><strong>${e.num}</strong><span>${e.icon} ${esc(L(e))}</span></a>`).join('')}</div>
        <section class="section"><h2>${esc(t('allHelplines'))}</h2>
          <ul class="list card">${D.emergency.filter((e) => !e.priority).map(numRow).join('')}</ul></section>
      </div>`;
    },

    explore(params) {
      const tag = params.get('tag') || 'all';
      const tags = ['all', 'temple', 'heritage', 'nature', 'culture'];
      const list = D.places.filter((p) => tag === 'all' || p.tag === tag).sort((a, b) => a.km - b.km);
      return `<div class="page">
        <div><h1>${esc(t('exploreTitle'))}</h1><p class="muted">${esc(t('exploreSub'))}</p></div>
        <div class="chips" role="group">${tags.map((x) =>
          `<button class="chip" data-tag="${x}" aria-pressed="${x === tag}">${esc(t(x))}</button>`).join('')}</div>
        <div class="places">${list.map(placeCard).join('')}</div>
      </div>`;
    },

    directory() {
      return `<div class="page">
        <div><h1>${esc(t('directoryTitle'))}</h1><p class="muted">${esc(t('directorySub'))}</p></div>
        ${D.directory.map((cat, i) => `<details class="card" ${i === 0 ? 'open' : ''}>
          <summary class="row"><span class="emoji" aria-hidden="true">${cat.icon}</span>
            <div class="grow"><div class="title">${esc(L(cat))}</div><div class="sub">${cat.items.length}</div></div>
            <span class="chev" aria-hidden="true">›</span></summary>
          <ul class="list">${cat.items.map((it) => entryRow({ kind: 'map', id: it.id, icon: '📍', title: L(it), sub: L(cat), q: it.q })).join('')}</ul>
        </details>`).join('')}
      </div>`;
    },

    services() {
      return `<div class="page">
        <div><h1>${esc(t('servicesTitle'))}</h1><p class="muted">${esc(t('servicesSub'))}</p></div>
        <ul class="list card">${D.services.map((s) => entryRow({ kind: 'link', id: s.id, icon: s.icon, title: L(s), sub: L(s, 'd'), url: s.url })).join('')}</ul>
      </div>`;
    },

    transport() {
      return `<div class="page">
        <div><h1>${esc(t('transportTitle'))}</h1><p class="muted">${esc(t('transportSub'))}</p></div>
        <div class="places">${D.transport.map((x) => `<article class="card place">
          <div class="place-top"><span class="emoji" aria-hidden="true">${x.icon}</span><div class="grow"><h3>${esc(L(x))}</h3></div>${favBtn(x.id, L(x))}</div>
          <p class="muted small">${esc(L(x, 'd'))}</p>
          <div class="place-actions">
            <a class="pill primary" href="${esc(dirUrl(x.q))}" target="_blank" rel="noopener">🧭 ${esc(t('directions'))}</a>
            ${x.link ? `<a class="pill" href="${esc(x.link)}" target="_blank" rel="noopener">${esc(t('open'))} ↗</a>` : ''}
          </div></article>`).join('')}</div>
      </div>`;
    },

    saved() {
      const items = allEntries().filter((e) => isFav(e.id));
      return `<div class="page">
        <h1>${esc(t('savedTitle'))}</h1>
        ${items.length ? `<ul class="list card">${items.map(entryRow).join('')}</ul>` : `<div class="empty card">⭐<br>${esc(t('savedEmpty'))}</div>`}
      </div>`;
    },

    search(params) {
      const q = params.get('q') || '';
      return `<div class="page">
        <h1>${esc(t('searchTitle'))}</h1>
        <form class="search-box" role="search" id="search-form">
          <input id="search-input" type="search" value="${esc(q)}" placeholder="${esc(t('searchPlaceholder'))}" aria-label="${esc(t('search'))}" autocomplete="off" enterkeyhint="search">
        </form>
        <div id="search-results">${searchResults(q)}</div>
      </div>`;
    },

    about() {
      return `<div class="page">
        <h1>${esc(t('aboutTitle'))}</h1>
        <div class="card place"><p>${esc(t('aboutBody'))}</p>
          <p class="muted small">${esc(t('version'))} 1.0.0</p></div>
      </div>`;
    }
  };

  function searchResults(q) {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return '';
    const hits = allEntries().filter((e) => { const hay = (e.text + ' ' + e.title).toLowerCase(); return terms.every((w) => hay.includes(w)); });
    return hits.length ? `<ul class="list card">${hits.slice(0, 40).map(entryRow).join('')}</ul>` : `<div class="empty">${esc(t('noResults'))}</div>`;
  }

  /* ---------- weather (Open-Meteo, no key; last value cached for offline) ---------- */
  const WX = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 80: '🌦️', 81: '🌧️', 82: '⛈️', 95: '⛈️', 96: '⛈️', 99: '⛈️' };
  function weatherHtml(w, failed) {
    if (!w) return `<span class="wx-icon">🌡️</span><span>${esc(failed || !navigator.onLine ? t('weatherOff') : '…')}</span>`;
    return `<span class="wx-icon" aria-hidden="true">${WX[w.code] || '🌡️'}</span>
      <div><div class="temp">${Math.round(w.temp)}°C</div><div class="small">${esc(t('weatherNow'))} · ${esc(t('feels'))} ${Math.round(w.rh)}%</div></div>`;
  }
  async function loadWeather() {
    const cached = store.get('weather', null);
    if (cached && Date.now() - cached.at < 20 * 60 * 1000) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${D.city.lat}&longitude=${D.city.lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FKolkata`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      const w = { temp: j.current.temperature_2m, rh: j.current.relative_humidity_2m, code: j.current.weather_code, at: Date.now() };
      store.set('weather', w);
      const el = $('#weather');
      if (el) el.innerHTML = weatherHtml(w);
    } catch (_) {
      const el = $('#weather');
      if (el && !cached) el.innerHTML = weatherHtml(null, true);
    }
  }

  /* ---------- install prompt ---------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; renderInstall(); });
  function renderInstall() {
    const slot = $('#install-slot');
    if (!slot) return;
    if (!deferredInstall || store.get('installDismissed', false)) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="card install-card"><img src="icons/icon-192.png" alt="" width="44" height="44" style="border-radius:10px">
      <div class="grow"><strong>${esc(t('install'))}</strong><div class="small muted">${esc(t('installSub'))}</div></div>
      <button class="pill primary" id="install-btn">${esc(t('installBtn'))}</button>
      <button class="fav" id="install-x" aria-label="Dismiss">✕</button></div>`;
    $('#install-btn').onclick = async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; renderInstall(); };
    $('#install-x').onclick = () => { store.set('installDismissed', true); renderInstall(); };
  }

  /* ---------- router ---------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '') || 'home';
    const [path, qs] = raw.split('?');
    return { route: views[path] ? path : 'home', params: new URLSearchParams(qs || '') };
  }

  function render(focus) {
    const { route, params } = parseHash();
    main.innerHTML = views[route](params);
    const tabRoute = ['transport', 'saved', 'search', 'about'].includes(route) ? 'home' : route;
    document.querySelectorAll('.tabbar a').forEach((a) => {
      if (a.dataset.route === tabRoute) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const titles = { sos: 'sosTitle', explore: 'exploreTitle', directory: 'directoryTitle', services: 'servicesTitle', transport: 'transportTitle', saved: 'savedTitle', search: 'searchTitle', about: 'aboutTitle' };
    document.title = route === 'home' ? t('appName') : `${t(titles[route])} · ${t('appName')}`;
    if (route === 'home') { renderInstall(); loadWeather(); }
    if (route === 'search') {
      const input = $('#search-input');
      input.addEventListener('input', () => {
        $('#search-results').innerHTML = searchResults(input.value);
        history.replaceState(null, '', '#/search?q=' + encodeURIComponent(input.value));
      });
      $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); input.blur(); });
      input.focus();
    } else if (focus) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
  }

  /* ---------- global events ---------- */
  main.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      toggleFav(fav.dataset.fav);
      if (parseHash().route === 'saved') { render(); return; }
      document.querySelectorAll(`[data-fav="${CSS.escape(fav.dataset.fav)}"]`).forEach((b) => {
        b.setAttribute('aria-pressed', isFav(b.dataset.fav)); b.textContent = isFav(b.dataset.fav) ? '★' : '☆';
      });
      return;
    }
    const chip = e.target.closest('[data-tag]');
    if (chip) { location.hash = chip.dataset.tag === 'all' ? '#/explore' : '#/explore?tag=' + chip.dataset.tag; return; }
    if (e.target.closest('#share-loc')) shareLocation();
  });

  function shareLocation() {
    if (!navigator.geolocation) { toast(t('locFail')); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const link = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      const text = lang === 'hi' ? `मुझे मदद चाहिए। मेरी लोकेशन: ${link}` : `I need help. My location: ${link}`;
      try {
        if (navigator.share) { await navigator.share({ title: 'SOS', text }); return; }
        await navigator.clipboard.writeText(text);
        toast(t('locShared'));
      } catch (_) {
        location.href = 'sms:?&body=' + encodeURIComponent(text);
      }
    }, () => toast(t('locFail')), { enableHighAccuracy: true, timeout: 10000 });
  }

  $('#btn-search').addEventListener('click', () => { location.hash = '#/search'; });
  $('#btn-lang').addEventListener('click', () => { lang = lang === 'hi' ? 'en' : 'hi'; store.set('lang', lang); applyStaticI18n(); render(); });
  $('#btn-theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    store.set('theme', dark ? 'light' : 'dark');
    applyTheme();
  });

  function updateOnline() { $('#offline-banner').hidden = navigator.onLine; }
  window.addEventListener('online', () => { updateOnline(); if (parseHash().route === 'home') loadWeather(); });
  window.addEventListener('offline', updateOnline);
  window.addEventListener('hashchange', () => render(true));

  /* ---------- service worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
        const offer = (w) => toast(t('updateReady'), { label: t('reload'), fn: () => w.postMessage('skip-waiting') });
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
          });
        });
      }).catch(() => {});
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    });
  }

  applyTheme();
  applyStaticI18n();
  updateOnline();
  render();
})();
