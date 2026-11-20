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
let visibleIndex = null;

function message(text) {
  const p = document.createElement('p');
  p.textContent = text;
  stage.replaceChildren(p);
}

function renderMenu(item) {
  const section = document.createElement('section');
  section.className = 'menu';
  const title = document.createElement('h1');
  title.textContent = item.name;
  const list = document.createElement('ul');
  for (const { name, price } of item.rows) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    const amount = document.createElement('span');
    label.textContent = name;
    amount.textContent = price;
    row.append(label, amount);
    list.append(row);
  }
  section.append(title, list);
  return section;
}

async function render(cache) {
  const frame = ++revision;
  clearTimeout(timer);
  if (!items.length) { message('Wachten op een gepubliceerde playlist…'); return; }
  const item = items[index];
  const next = () => {
    if (frame !== revision) return;
    clearTimeout(timer);
    index = (index + 1) % items.length;
    void render(cache);
  };
  try {
    let element;
    let url;
    if (item.type === 'menu') element = renderMenu(item);
    else {
      const response = await cache.match(mediaUrl(item));
      if (!response) throw new Error('Bestand ontbreekt in de offline opslag.');
      const blob = await response.blob();
      if (frame !== revision) return;
      url = URL.createObjectURL(blob);
      const video = item.type.startsWith('video/');
      element = document.createElement(video ? 'video' : 'img');
      if (video) {
        element.muted = true;
        element.autoplay = true;
        element.playsInline = true;
        element.onended = next;
      }
      element.onerror = () => {
        if (frame !== revision) return;
        visibleIndex = null;
        issue = 'Een mediabestand kan niet worden afgespeeld.';
        message(issue);
        clearTimeout(timer);
        timer = setTimeout(next, 2500);
      };
      element.src = url;
    }
    stage.replaceChildren(element);
    visibleIndex = index;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = url;
    timer = setTimeout(next, item.seconds * 1000);
  } catch (error) {
    if (frame !== revision) return;
    visibleIndex = null;
    issue = error.message;
    message(issue);
    timer = setTimeout(next, 2500);
  }
}

function activate(release, cache) {
  active = release;
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
        body: JSON.stringify({ action: 'heartbeat', id, version: active?.version, itemIndex: visibleIndex, issue }),
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
      if (release.version && active?.version !== release.version) {
        const files = [...new Set(release.items.filter(item => item.type !== 'menu').map(mediaUrl))];
        for (const url of files) {
          if (await cache.match(url)) continue;
          const file = await fetch(url, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(120000) });
          if (!file.ok) throw new Error('Een nieuw mediabestand kon niet worden opgehaald.');
          await cache.put(url, file);
        }
        await cache.put(manifest, new Response(JSON.stringify(release)));
        activate(release, cache);
        const keep = new Set([new URL(manifest, location.origin).href, ...files.map(url => new URL(url, location.origin).href)]);
        for (const entry of await cache.keys()) {
          if (!keep.has(entry.url)) await cache.delete(entry);
        }
      }
    } catch (error) {
      if (navigator.onLine) issue = error.message;
    } finally {
      setTimeout(sync, 30000);
    }
  }
  void sync();
  void heartbeat();
  setInterval(heartbeat, 30000);
}

start().catch(() => message('De speler kon de offline opslag niet openen.'));
