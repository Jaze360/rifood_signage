import { fitMenuBoard } from './menu-board-fit.js';

const stage = document.getElementById('stage');
const id = location.pathname.split('/')[2];
const key = new URLSearchParams(location.hash.slice(1)).get('k');
const api = '/api/signage';
const auth = { Authorization: 'Bearer ' + key };
const namespace = 'signage-content-' + id + '-' + key;
const manifest = '/player-cache/' + id + '/manifest';
const mediaUrl = item => '/api/upload?id=' + item.id + '&screen=' + id;
let active;
let items = [];
let index = 0;
let timer;
let currentUrl;
let revision = 0;
let issue = '';
let syncIssue = '';
let visibleIndex = null;
let stopFitting = () => {};

function show(element) {
  stopFitting();
  stage.replaceChildren(element);
  stopFitting = element.classList.contains('menu-board') ? fitMenuBoard(element) : () => {};
}

function message(text) {
  const p = document.createElement('p');
  p.textContent = text;
  show(p);
}

function renderMenu(item) {
  const section = document.createElement('section');
  section.className = 'menu menu-board';
  const title = document.createElement('h1');
  title.textContent = item.name;
  const list = document.createElement('ul');
  for (const { name, price, ingredients } of item.rows) {
    const row = document.createElement('li');
    const dish = document.createElement('div');
    dish.className = 'menu-board-dish';
    const label = document.createElement('span');
    const amount = document.createElement('span');
    label.textContent = name;
    amount.textContent = price;
    amount.className = 'menu-board-price';
    dish.append(label);
    if (ingredients) {
      const details = document.createElement('small');
      details.textContent = ingredients;
      dish.append(details);
    }
    row.append(dish, amount);
    list.append(row);
  }
  const photo = document.createElement('div');
  photo.className = 'menu-board-photo';
  const panel = document.createElement('div');
  panel.className = 'menu-board-panel';
  panel.append(title, list);
  section.append(photo, panel);
  return section;
}

async function render(cache) {
  const frame = ++revision;
  clearTimeout(timer);
  if (!items.length) { message('Wachten op een gepubliceerde playlist…'); return; }
  const item = items[index];
  let failed = false;
  const next = () => {
    if (frame !== revision) return;
    clearTimeout(timer);
    index = (index + 1) % items.length;
    void render(cache);
  };
  const fail = () => {
    if (frame !== revision || failed) return;
    failed = true;
    visibleIndex = null;
    issue = 'Een mediabestand kan niet worden afgespeeld.';
    message(issue);
    clearTimeout(timer);
    timer = setTimeout(next, 2500);
  };
  const playing = () => {
    if (frame !== revision || failed) return;
    visibleIndex = index;
    issue = '';
    clearTimeout(timer);
    if (!item.type.startsWith('video/')) timer = setTimeout(next, item.seconds * 1000);
  };
  let url;
  try {
    let element;
    const video = item.type.startsWith('video/');
    if (item.type === 'menu') element = renderMenu(item);
    else {
      const response = await cache.match(mediaUrl(item));
      if (!response) throw new Error('Bestand ontbreekt in de offline opslag.');
      const blob = await response.blob();
      if (frame !== revision) return;
      url = URL.createObjectURL(blob);
      element = document.createElement(video ? 'video' : 'img');
      if (video) {
        element.muted = true;
        element.playsInline = true;
        element.onended = next;
      }
      element.src = url;
      if (!video) await element.decode();
    }
    if (frame !== revision) {
      if (url) URL.revokeObjectURL(url);
      return;
    }
    show(element);
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = url;
    if (video) {
      visibleIndex = null;
      element.onerror = fail;
      timer = setTimeout(fail, 12000);
      void element.play().then(() => {
        if (frame !== revision || failed) return;
        playing();
        let lastTime = element.currentTime;
        const watchProgress = () => {
          clearTimeout(timer);
          timer = setTimeout(fail, 20000);
        };
        watchProgress();
        element.ontimeupdate = () => {
          if (frame !== revision || failed || element.currentTime <= lastTime) return;
          lastTime = element.currentTime;
          watchProgress();
        };
      }, fail);
    } else playing();
  } catch {
    if (url) URL.revokeObjectURL(url);
    fail();
  }
}

function activate(release, cache) {
  active = release;
  stage.dataset.orientation = release.orientation || 'auto';
  items = release.items;
  index = 0;
  visibleIndex = null;
  issue = '';
  void render(cache);
}

async function start() {
  if (!key || !/^(pi-[12]|wyse-[123])$/.test(id)) {
    message('Open de schermlink vanuit het dashboard.');
    return;
  }
  if (!('caches' in window)) { message('Open deze speler via HTTPS of localhost.'); return; }
  navigator.serviceWorker?.register('/player-sw.js').catch(() => {});
  const cache = await caches.open(namespace);
  const saved = await cache.match(manifest);
  if (saved) activate(await saved.json(), cache);
  else message('Wachten op een gepubliceerde playlist…');

  async function heartbeat() {
    try {
      await fetch(api, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat', id, version: active?.version, itemIndex: visibleIndex, issue: issue || syncIssue }),
        signal: AbortSignal.timeout(10000)
      });
    } catch {}
  }

  async function sync() {
    try {
      const response = await fetch(api + '?screen=' + id, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (response.status === 403 && !active) message('Deze schermlink is ongeldig.');
      if (!response.ok) throw new Error('Publicatie ophalen mislukt.');
      const release = await response.json();
      const orientation = release.orientation || 'auto';
      if (!active || active.version === release.version) {
        stage.dataset.orientation = orientation;
        if (active && active.orientation !== orientation) {
          active = { ...active, orientation };
          await cache.put(manifest, new Response(JSON.stringify(active)));
        }
      }
      if (release.version && active?.version !== release.version) {
        const files = new Map(release.items.filter(item => item.type !== 'menu').map(item => [mediaUrl(item), item.type]));
        for (const [url, type] of files) {
          const cached = await cache.match(url);
          if (cached?.headers.get('content-type') === type) continue;
          const file = await fetch(url, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(120000) });
          if (!file.ok || file.headers.get('content-type') !== type) {
            throw new Error('Een nieuw mediabestand kon niet worden opgehaald (HTTP ' + file.status + ').');
          }
          await cache.put(url, file);
        }
        await cache.put(manifest, new Response(JSON.stringify(release)));
        activate(release, cache);
        const keep = new Set([new URL(manifest, location.origin).href, ...Array.from(files.keys(), url => new URL(url, location.origin).href)]);
        for (const entry of await cache.keys()) {
          if (!keep.has(entry.url)) await cache.delete(entry);
        }
      }
      syncIssue = '';
    } catch (error) {
      if (navigator.onLine) syncIssue = error.message;
    } finally {
      setTimeout(sync, 30000);
    }
  }
  void sync();
  void heartbeat();
  setInterval(heartbeat, 30000);
}

start().catch(() => message('De speler kon de offline opslag niet openen.'));

