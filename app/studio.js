'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { fitMenuBoard } from '../public/menu-board-fit';

const sections = ['Schermen', 'Voorbeelden', 'Media', 'Menukaarten', 'Playlists'];
const blankMenu = () => ({ name: '', rows: [{ name: '', price: '' }] });
const blankPlaylist = () => ({ name: '', items: [] });
const date = time => new Intl.DateTimeFormat('nl-BE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Brussels' }).format(time);

async function request(url, options) {
  const res = await fetch(url, { cache: 'no-store', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'De server kon de aanvraag niet verwerken.');
  return data;
}

const post = (url, data) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const api = '/api/signage';

export default function Studio() {
  const [data, setData] = useState();
  const [locked, setLocked] = useState(false);
  const [section, setSection] = useState(sections[0]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(blankMenu);
  const [playlist, setPlaylist] = useState(blankPlaylist);
  const [selected, setSelected] = useState('');

  async function refresh() {
    const res = await fetch(api, { cache: 'no-store' });
    if (res.status === 401) { setLocked(true); setData(undefined); return; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Dashboard niet beschikbaar.');
    setData(body);
    setLocked(false);
  }

  useEffect(() => {
    const run = () => refresh().catch(err => setError(err.message));
    run();
    const interval = setInterval(run, 15000);
    return () => clearInterval(interval);
  }, []);

  async function act(work, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(message);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function uploadFile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = body.get('file');
    void act(async () => {
      if (file.size > 64 * 1024 * 1024) throw new Error('Kies een bestand van maximaal 64 MB.');
      if (data.cloud) {
        const id = crypto.randomUUID();
        await upload('media/' + id, file, { access: 'private', handleUploadUrl: '/api/upload', multipart: file.size > 8 * 1024 * 1024 });
        await post('/api/upload', { id, name: file.name });
      } else await request('/api/upload', { method: 'POST', body });
      form.reset();
    }, 'Media toegevoegd.');
  }

  if (!data) return <main className="gate">
    <div className="brand"><span className="brand-icon">▰</span> Signage Studio</div>
    <h1>Schermbeheer</h1>
    {locked && <form onSubmit={event => {
      event.preventDefault();
      const password = new FormData(event.currentTarget).get('password');
      void act(() => post(api, { action: 'login', password }), '');
    }}>
      <label>Beheerderswachtwoord<input name="password" type="password" autoComplete="current-password" required /></label>
      <button disabled={busy}>Inloggen</button>
    </form>}
    {!locked && !error && <p>Dashboard laden…</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </main>;

  const assets = [...data.media, ...data.menus];
  return <div className="app">
    <aside>
      <div className="brand"><span className="brand-icon">▰</span> Signage Studio</div>
      <nav aria-label="Dashboard">
        {sections.map((name, index) => <button key={name} aria-current={section === name ? 'page' : undefined} onClick={() => setSection(name)}>
          <span aria-hidden="true">{['▣', '▥', '▧', '≡', '▷'][index]}</span>{name}
        </button>)}
      </nav>
      <button className="signout" disabled={busy} onClick={() => void act(() => post(api, { action: 'logout' }), '')}>Uitloggen</button>
    </aside>
    <main className="content">
      <header><div><p className="eyebrow">DIGITAL SIGNAGE</p><h1>{section}</h1></div><button className="secondary" onClick={() => void act(async () => {}, 'Bijgewerkt.')} disabled={busy}>Vernieuwen</button></header>
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}

      {section === 'Schermen' && <div className="screen-grid">{data.devices.map(device => {
        const status = data.status[device.id];
        const online = status && Date.now() - status.time < 125000;
        return <article className="screen" key={device.id}>
          <div className="screen-head"><span className="display-icon">▣</span><span className={online ? 'pill online' : 'pill'}>{online ? 'Online' : status ? 'Geen signaal' : 'Nog niet verbonden'}</span></div>
          <h2>{device.id}</h2><p className="muted">{device.id.startsWith('pi') ? 'Raspberry Pi 4' : 'Dell Wyse 5070'} · 1920 × 1080</p>
          <label>Schermoriëntatie<select disabled={busy} value={device.orientation} onChange={event => {
            const orientation = event.target.value;
            void act(() => post(api, { action: 'orientation', id: device.id, orientation }), 'Schermoriëntatie opgeslagen.');
          }}>
            <option value="auto">Automatisch</option>
            <option value="portrait">Portret · 9:16</option>
            <option value="landscape">Landschap · 16:9</option>
          </select></label>
          <label>Toegewezen playlist<select disabled={busy} value={data.assignments[device.id] || ''} onChange={event => {
            const value = event.target.value;
            void act(() => post(api, { action: 'assign', id: device.id, playlist: value }), 'Playlist toegewezen.');
          }}><option value="" disabled>Kies een playlist</option>{data.playlists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <dl><dt>Gepubliceerd</dt><dd>{device.release ? device.release.name + ' · ' + date(device.release.time) : 'Nog niets gepubliceerd'}</dd>
          {device.unpublished && <><dt>Playlist</dt><dd className="pending">Opgeslagen wijzigingen wachten op publicatie</dd></>}
          <dt>Laatste signaal</dt><dd>{status ? date(status.time) : '—'}</dd>
          {online && device.release && <><dt>Speler</dt><dd>{status.version === device.release.version ? 'Publicatie geladen' : 'Publicatie wordt nog opgehaald'}</dd></>}
          {status?.issue && <><dt>Melding</dt><dd>{status.issue}</dd></>}</dl>
          <div className="actions"><button disabled={busy || !data.assignments[device.id]} onClick={() => void act(() => post(api, { action: 'publish', id: device.id }), 'Gepubliceerd op ' + device.id + '.')}>Publiceren</button>
          <a className="secondary" href={device.url} target="_blank" rel="noreferrer">Open speler ↗</a>
          <button className="secondary" disabled={busy} onClick={() => void act(() => navigator.clipboard.writeText(location.origin + device.url), 'Schermlink gekopieerd.')}>Kopieer link</button></div>
        </article>;
      })}</div>}

      {section === 'Voorbeelden' && <div className="preview-grid">
        {data.devices.map(device => <ScreenPreview key={device.id} device={device} status={data.status[device.id]} />)}
      </div>}

      {section === 'Media' && <>
        <form className="panel" onSubmit={uploadFile}><h2>Bestand toevoegen</h2>
          <label>Afbeelding of video<input name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required /></label>
          <p className="muted">JPG, PNG, WebP, MP4 of WebM · maximaal 64 MB</p><button disabled={busy}>{busy ? 'Uploaden…' : 'Uploaden'}</button>
        </form>
        <div className="media-grid">{data.media.map(item => <article className="media-card" key={item.id}>
          {item.type.startsWith('image/') ? <img src={'/api/upload?id=' + item.id} alt="" loading="lazy" /> : <div className="video-preview" aria-hidden="true">▷</div>}
          <div><strong>{item.name}</strong><p className="muted">{item.type} · {(item.size / 1024 / 1024).toFixed(1)} MB</p></div>
        </article>)}</div>
        {!data.media.length && <p className="muted">Je mediabibliotheek is leeg.</p>}
      </>}

      {section === 'Menukaarten' && <div className="split">
        <section className="panel collection"><h2>Menukaarten</h2>{data.menus.map(item => <button className="secondary" key={item.id} onClick={() => setMenu(item)}>{item.name}</button>)}<button className="secondary" onClick={() => setMenu(blankMenu())}>+ Nieuwe menukaart</button></section>
        <form className="panel" onSubmit={event => {
          event.preventDefault();
          void act(() => post(api, { ...menu, action: 'menu' }), 'Menukaart opgeslagen.');
        }}>
          <h2>{menu.id ? 'Menukaart bewerken' : 'Nieuwe menukaart'}</h2>
          <label>Titel<input required maxLength={100} value={menu.name} onChange={event => setMenu({ ...menu, name: event.target.value })} /></label>
          {menu.rows.map((row, index) => <div className="menu-edit-item" key={index}><div className="row">
            <label>Gerecht<input maxLength={80} value={row.name} onChange={event => setMenu({ ...menu, rows: menu.rows.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} /></label>
            <label>Prijs<input maxLength={30} value={row.price} onChange={event => setMenu({ ...menu, rows: menu.rows.map((item, i) => i === index ? { ...item, price: event.target.value } : item) })} /></label>
            <button type="button" className="secondary" aria-label={'Verwijder gerecht ' + (index + 1)} disabled={menu.rows.length === 1} onClick={() => setMenu({ ...menu, rows: menu.rows.filter((_, i) => i !== index) })}>×</button>
          </div>
            <label>Ingrediënten<input maxLength={240} value={row.ingredients || ''} onChange={event => setMenu({ ...menu, rows: menu.rows.map((item, i) => i === index ? { ...item, ingredients: event.target.value } : item) })} /></label>
          </div>)}
          <div className="actions"><button type="button" className="secondary" disabled={menu.rows.length >= 12} onClick={() => setMenu({ ...menu, rows: [...menu.rows, { name: '', price: '' }] })}>+ Gerecht</button><button disabled={busy}>Opslaan</button></div>
        </form>
      </div>}

      {section === 'Playlists' && <div className="split">
        <section className="panel collection"><h2>Playlists</h2>{data.playlists.map(item => <button className="secondary" key={item.id} onClick={() => setPlaylist(item)}>{item.name}</button>)}<button className="secondary" onClick={() => setPlaylist(blankPlaylist())}>+ Nieuwe playlist</button></section>
        <form className="panel" onSubmit={event => {
          event.preventDefault();
          const publishTo = event.nativeEvent.submitter?.value || undefined;
          void act(async () => {
            const result = await post(api, { ...playlist, action: 'playlist', publishTo });
            setPlaylist({ ...playlist, id: result.playlistId });
          }, publishTo ? 'Gepubliceerd op ' + publishTo + '.' : 'Concept opgeslagen.');
        }}>
          <h2>{playlist.id ? 'Playlist bewerken' : 'Nieuwe playlist'}</h2>
          <label>Naam<input maxLength={100} required value={playlist.name} onChange={event => setPlaylist({ ...playlist, name: event.target.value })} /></label>
          <div className="row"><label>Media of menukaart<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Kies een item</option>{assets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button type="button" className="secondary" disabled={!selected || playlist.items.length >= 30} onClick={() => setPlaylist({ ...playlist, items: [...playlist.items, { id: selected, seconds: 10 }] })}>Toevoegen</button></div>
          <ol className="sequence">{playlist.items.map((item, index) => <li key={index}>
            <strong>{assets.find(asset => asset.id === item.id)?.name}</strong>
            {assets.find(asset => asset.id === item.id)?.type?.startsWith('video/') ?
              <p className="muted">Speelt volledig af</p> :
              <label>Seconden<input type="number" min="2" max="300" required value={item.seconds} onChange={event => setPlaylist({ ...playlist, items: playlist.items.map((entry, i) => i === index ? { ...entry, seconds: Number(event.target.value) } : entry) })} /></label>}
            <button type="button" className="secondary" disabled={index === 0} aria-label="Omhoog" onClick={() => {
              const items = [...playlist.items];
              [items[index - 1], items[index]] = [items[index], items[index - 1]];
              setPlaylist({ ...playlist, items });
            }}>↑</button>
            <button type="button" className="secondary" aria-label="Verwijderen" onClick={() => setPlaylist({ ...playlist, items: playlist.items.filter((_, i) => i !== index) })}>×</button>
          </li>)}</ol>
          <div className="actions">
            <button className="secondary" disabled={busy || !playlist.items.length}>Opslaan</button>
            {playlist.id && data.devices.filter(device => data.assignments[device.id] === playlist.id).map(device =>
              <button key={device.id} value={device.id} disabled={busy || !playlist.items.length}>
                Opslaan en publiceren op {device.id}
              </button>)}
          </div>
        </form>
      </div>}
    </main>
  </div>;
}

function ScreenPreview({ device, status }) {
  const online = status && Date.now() - status.time < 125000;
  const release = device.release;
  const reported = online && status.version === release?.version && Number.isInteger(status.itemIndex)
    ? release?.items[status.itemIndex] : undefined;
  const item = reported || release?.items[0];
  const source = item && '/api/upload?id=' + item.id;

  return <article className="preview-card">
    <div className="preview-header">
      <h2>{device.id}</h2>
      <span className={online ? 'pill online' : 'pill'}>{online ? 'Online' : status ? 'Geen signaal' : 'Nog niet verbonden'}</span>
    </div>
    <div className="preview-frame" data-orientation={device.orientation === 'landscape' ? 'landscape' : 'portrait'}>
      {!item && <p>Nog niets gepubliceerd</p>}
      {item?.type === 'menu' && <MenuBoardPreview item={item} />}
      {item?.type.startsWith('image/') && <img src={source} alt={'Gepubliceerde afbeelding op ' + device.id} />}
      {item?.type.startsWith('video/') && <video src={source + '#t=0.1'} muted playsInline preload="metadata" aria-label={'Videobeeld op ' + device.id} />}
    </div>
    {release && <p className="preview-caption">
      <strong>{release.name}</strong>
      <span>{reported ? 'Laatste gemelde item · ' + date(status.time) : 'Voorbeeld van de publicatie'}</span>
    </p>}
  </article>;
}

function MenuBoardPreview({ item }) {
  const board = useRef(null);
  useEffect(() => fitMenuBoard(board.current), [item]);
  return <div className="menu-board" ref={board}>
    <div className="menu-board-panel">
      <h3>{item.name}</h3>
      <ul>{item.rows.map(({ name, price, ingredients }, index) => <li key={index}>
        <div className="menu-board-dish"><span>{name}</span>{ingredients && <small>{ingredients}</small>}</div>
        <span className="menu-board-price">{price}</span>
      </li>)}</ul>
    </div>
  </div>;
}
