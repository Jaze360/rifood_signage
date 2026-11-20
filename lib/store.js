import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

export const screens = ['pi-1', 'pi-2', 'wyse-1', 'wyse-2', 'wyse-3'];
export const folder = join(process.cwd(), '.signage');
export const cloud = Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN);
const empty = () => ({ media: [], menus: [], playlists: [], assignments: {}, releases: {}, status: {} });
const filename = join(folder, 'state.json');
let queue = Promise.resolve();
let pool;
let initialized;

async function database() {
  if (!process.env.DATABASE_URL) {
    if (cloud) throw new Error('DATABASE_URL ontbreekt');
    return null;
  }
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  initialized ??= pool.query('CREATE TABLE IF NOT EXISTS signage_state (id integer PRIMARY KEY, data jsonb NOT NULL)')
    .then(() => pool.query('INSERT INTO signage_state VALUES (1, $1) ON CONFLICT DO NOTHING', [empty()]))
    .catch(error => { initialized = undefined; throw error; });
  await initialized;
  return pool;
}

export async function readState() {
  const db = await database();
  if (db) return (await db.query('SELECT data FROM signage_state WHERE id = 1')).rows[0].data;
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return empty();
    throw error;
  }
}

export async function updateState(change) {
  const db = await database();
  if (db) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [{ data }] } = await client.query('SELECT data FROM signage_state WHERE id = 1 FOR UPDATE');
      const result = change(data);
      await client.query('UPDATE signage_state SET data = $1 WHERE id = 1', [data]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  const operation = queue.then(async () => {
    const data = await readState();
    const result = change(data);
    await mkdir(folder, { recursive: true });
    const temporary = join(folder, randomUUID());
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await rename(temporary, filename);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}
