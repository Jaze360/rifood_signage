import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminAllowed, adminToken, configured, cookieName, equals, playerAllowed, sameOrigin, screenKey } from '../../../lib/auth';
import { cloud, readState, screens, updateState } from '../../../lib/store';

export const dynamic = 'force-dynamic';
const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const clean = (value, size = 100) => typeof value === 'string' ? value.trim().slice(0, size) : '';
const invalid = message => { throw new RangeError(message); };

export async function GET(req) {
  if (!configured()) return json({ error: 'Stel eerst het wachtwoord en de geheime sleutel in.' }, 503);
  const id = new URL(req.url).searchParams.get('screen');
  if (id !== null) {
    if (!screens.includes(id) || !playerAllowed(req, id)) return json({ error: 'Ongeldige schermkoppeling.' }, 403);
    const state = await readState();
    return json({
      ...(state.releases[id] || { items: [], version: null }),
      orientation: state.orientations?.[id] || 'auto'
    });
  }
  if (!(await adminAllowed())) return json({ error: 'Log in om verder te gaan.' }, 401);
  const { releases, ...state } = await readState();


  const devices = screens.map(id => ({
    id, url: '/scherm/' + id + '#k=' + screenKey(id),
    release: releases[id],
    orientation: state.orientations?.[id] || 'auto'
  }));
  return json({ ...state, devices, cloud });
}

export async function POST(req) {
  if (!configured()) return json({ error: 'Configuratie ontbreekt.' }, 503);
  if (!sameOrigin(req)) return json({ error: 'Ongeldige herkomst.' }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 65536) return json({ error: 'Invoer is te groot.' }, 413);
    const body = JSON.parse(raw);
    if (body.action === 'login') {
      if (!equals(body.password, process.env.SIGNAGE_PASSWORD)) return json({ error: 'Ongeldig wachtwoord.' }, 401);
      const res = json({ ok: true });
      res.cookies.set(cookieName, await adminToken(), {
        httpOnly: true, secure: process.env.VERCEL === '1' || new URL(req.url).protocol === 'https:',
        sameSite: 'strict', path: '/', maxAge: 28800
      });
      return res;
    }
    if (body.action === 'heartbeat') {
      if (!screens.includes(body.id) || !playerAllowed(req, body.id)) return json({ error: 'Ongeldige schermkoppeling.' }, 403);
      await updateState(data => {
        data.status[body.id] = {
          time: Date.now(), version: clean(body.version), issue: clean(body.issue, 140),
          itemIndex: Number.isInteger(body.itemIndex) && body.itemIndex >= 0 && body.itemIndex < 30 ? body.itemIndex : null
        };
      });
      return json({ ok: true });
    }
    if (!(await adminAllowed())) return json({ error: 'Log in om verder te gaan.' }, 401);
    if (body.action === 'logout') {
      const res = json({ ok: true });
      res.cookies.delete(cookieName);
      return res;
    }

    await updateState(data => {
      switch (body.action) {
        case 'menu': {
          const name = clean(body.name);
          const rows = Array.isArray(body.rows) ? body.rows.slice(0, 12).map(row => ({
            name: clean(row.name, 80), price: clean(row.price, 30)
          })).filter(row => row.name) : [];
          if (!name || !rows.length) invalid('Voeg een titel en minstens één gerecht toe.');
          if (body.id) {
            const menu = data.menus.find(item => item.id === body.id);
            if (!menu) invalid('Menukaart niet gevonden.');
            Object.assign(menu, { name, rows });
          } else data.menus.push({ id: randomUUID(), name, rows });
          break;
        }
        case 'playlist': {
          const name = clean(body.name);
          if (!name || !Array.isArray(body.items) || !body.items.length || body.items.length > 30) invalid('Geef de playlist een naam en kies 1 tot 30 items.');
          const items = body.items.map(({ id, seconds }) => {
            if (![...data.media, ...data.menus].some(item => item.id === id)) invalid('Een item bestaat niet meer.');
            if (!Number.isInteger(seconds) || seconds < 2 || seconds > 300) invalid('Kies 2 tot 300 seconden per item.');
            return { id, seconds };
          });
          if (body.id) {
            const playlist = data.playlists.find(item => item.id === body.id);
            if (!playlist) invalid('Playlist niet gevonden.');
            Object.assign(playlist, { name, items });
          } else data.playlists.push({ id: randomUUID(), name, items });
          break;
        }
        case 'orientation': {
          if (!screens.includes(body.id) || !['auto', 'portrait', 'landscape'].includes(body.orientation)) {
            invalid('Kies een geldige schermoriëntatie.');
          }
          data.orientations ??= {};
          data.orientations[body.id] = body.orientation;
          break;
        }
        case 'assign': {
          if (!screens.includes(body.id) || !data.playlists.some(item => item.id === body.playlist)) invalid('Kies een bestaand scherm en een playlist.');
          data.assignments[body.id] = body.playlist;
          break;
        }
        case 'publish': {
          if (!screens.includes(body.id)) invalid('Onbekend scherm.');
          const playlist = data.playlists.find(item => item.id === data.assignments[body.id]);
          if (!playlist) invalid('Wijs eerst een playlist toe.');
          const items = playlist.items.map(({ id, seconds }) => {
            const media = data.media.find(item => item.id === id);
            if (media) return { id, type: media.type, seconds };
            const menu = data.menus.find(item => item.id === id);
            return { ...menu, type: 'menu', seconds };
          });
          const total = new Set(items.filter(item => item.type !== 'menu').map(item => item.id));
          if (data.media.filter(item => total.has(item.id)).reduce((sum, item) => sum + item.size, 0) > 160 * 1024 * 1024) {
            invalid('De media van één publicatie mogen samen maximaal 160 MB groot zijn.');
          }
          data.releases[body.id] = { version: randomUUID(), time: Date.now(), name: playlist.name, items };
          break;
        }
        default: invalid('Onbekende opdracht.');
      }
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof RangeError || error instanceof SyntaxError) return json({ error: error.message }, 400);
    console.error(error);
    return json({ error: 'De opdracht kon niet opgeslagen worden.' }, 500);
  }
}
