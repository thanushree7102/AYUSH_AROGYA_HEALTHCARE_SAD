// Additive PostgreSQL connection helper. Existing SQLite helpers are intentionally untouched.
const { Pool } = require('pg');

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set SUPABASE_DATABASE_URL (or DATABASE_URL) before using PostgreSQL.');

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  application_name: 'ayush-platform'
});
pool.on('error', (err) => console.error('[postgres] idle client error:', err.message));

async function healthcheck() {
  const { rows } = await pool.query('SELECT current_database() AS database, current_schema() AS schema, NOW() AS server_time');
  return rows[0];
}
async function close() { await pool.end(); }
module.exports = { pool, healthcheck, close };
