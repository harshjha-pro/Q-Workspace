# One Bhilwara

A standalone, offline-first PWA city companion for Bhilwara, Rajasthan. Plain HTML/CSS/JS, no build step, no dependencies.

Fully independent of the other apps in this repo: own `manifest.json` (id `/?app=one-bhilwara`, scope `./`), own service worker `sw.js` (cache `one-bhilwara-v1`, only ever deletes caches prefixed `one-bhilwara-`), own icons and `ob:`-prefixed localStorage keys.

## Features
- **SOS**: one-tap 112 and other national / Rajasthan helplines, plus "share my location".
- **Explore**: temples, forts, lakes and culture around the district, filterable, with directions.
- **Directory**: hospitals, government offices, police, education, textile/business, daily needs — opens live Maps listings.
- **e-Services**: SSO, e-Mitra, Jan Aadhaar, Rajasthan Sampark, AVVNL, Parivahan and more.
- **Transport**: rail, bus, air and road connections.
- Search across everything, ★ saved items, Hindi / English, light / dark mode, live weather (Open-Meteo), install prompt and update toast.

## Run locally
```sh
cd one-bhilwara
python3 -m http.server 8080   # then open http://localhost:8080
```

## Deploy
- **Vercel**: New Project → this repo → Root Directory `one-bhilwara`, Framework preset "Other", no build command. `vercel.json` sets no-cache headers on `sw.js`.
- **Netlify**: Base directory `one-bhilwara`, publish directory `.` (see `netlify.toml`), no build command.

## Content
All content lives in `data.js`. When you change any shipped file, bump `CACHE` in `sw.js` (e.g. `one-bhilwara-v2`) so installed users get the update.
