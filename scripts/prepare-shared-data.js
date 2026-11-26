// Prepare only Unani's domain database inside the shared AYUSH data root.
// Shared Platform, Common Clinical, Longitudinal, Event Bus and Integrations databases
// are owned and initialized by the Ayurveda host. Never create parallel copies here.
try { require('dotenv').config(); } catch (e) {}
const fs = require('fs');
const path = require('path');
const configured = process.env.DATA_ROOT || '../../AYUSH_SHARED_DATA';
const root = path.resolve(process.cwd(), configured);
const folder = 'unani-service';
const file = 'unani.db';
const destDir = path.join(root, folder);
const dest = path.join(destDir, file);
const src = path.resolve(__dirname, '..', 'shared-database-template', folder, file);
fs.mkdirSync(destDir, { recursive: true });
if (!fs.existsSync(dest)) {
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  else {
    const Database = require('better-sqlite3');
    const db = new Database(dest);
    db.exec('CREATE TABLE IF NOT EXISTS _ayush_bootstrap (created_at TEXT NOT NULL)');
    db.close();
  }
}
console.log(`[database] Unani domain database ready: ${dest}`);
console.log(`[database] Shared AYUSH root: ${root}`);
console.log('[database] Shared platform/clinical/longitudinal/event databases are managed by Ayurveda.');
