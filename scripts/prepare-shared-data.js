// Prepare one shared AYUSH SQLite data root. Existing databases are NEVER overwritten.
try { require('dotenv').config(); } catch (e) {}
const fs = require('fs');
const path = require('path');
const configured = process.env.DATA_ROOT || '../../AYUSH_SHARED_DATA';
const root = path.resolve(process.cwd(), configured);
const template = path.resolve(__dirname, '..', 'shared-database-template');
const entries = [
  ['shared-platform', 'platform.db'],
  ['common-clinical-service', 'clinical.db'],
  ['longitudinal-record-service', 'longitudinal.db'],
  ['event-bus', 'event-bus.db'],
  ['ayurveda-service', 'ayurveda.db'],
  ['yoga-naturopathy-service', 'yoga-naturopathy.db'],
  ['unani-service', 'unani.db'],
  ['siddha-service', 'siddha.db'],
  ['homoeopathy-service', 'homoeopathy.db'],
  ['ai-service', 'ai.db'],
];
fs.mkdirSync(root, { recursive: true });
for (const [folder, file] of entries) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, file);
  const src = path.join(template, folder, file);
  if (!fs.existsSync(dest)) {
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
    else {
      const Database = require('better-sqlite3');
      const db = new Database(dest);
      db.exec('CREATE TABLE IF NOT EXISTS _ayush_bootstrap (created_at TEXT NOT NULL)');
      db.close();
    }
  }
}
console.log(`[database] Shared AYUSH database directory ready: ${root}`);
for (const [folder, file] of entries) console.log(`[database] ${path.join(root, folder, file)}`);
