// scripts/backup.js — consistent hot backup of the SQLite database.
// Uses VACUUM INTO (safe while the server is running under WAL mode).
// Cron this hourly; ship the file to object storage; see docs/OPERATIONS.md §6.
//
//   node scripts/backup.js [outDir]
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.RYDER_DATA_DIR || path.join(process.cwd(), 'data');
const outDir = process.argv[2] || path.join(DATA_DIR, 'backups');
mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(outDir, `ryder-${stamp}.db`);

const db = new DatabaseSync(path.join(DATA_DIR, 'ryder.db'));
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();

const size = statSync(dest).size;
console.log(JSON.stringify({ ok: true, dest, bytes: size }));
