// Starts only the Unani domain + gateway and verifies integration with the already-running Ayurveda shared stack.
// Start Ayurveda first; this test must never launch duplicate shared databases/services.
try { require('dotenv').config(); } catch (e) {}
const { spawn } = require('child_process');
const { ROOT, PROCESSES } = require('./services');
const kids = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${Number(process.env.PORT_BASE || 5300)}`;
const request = async (p) => fetch(`${base}${p}`);
(async () => {
  try {
    for (const [name, file] of PROCESSES) {
      const child = spawn(process.execPath, [file], { cwd: ROOT, env: { ...process.env, OTP_CODE: process.env.OTP_CODE || '123456' }, stdio: 'ignore' });
      kids.push(child);
    }
    let health;
    for (let i = 0; i < 40; i++) {
      try { const r = await request('/v1/health'); if (r.ok) { health = await r.json(); if (health.ok) break; } } catch {}
      await sleep(500);
    }
    if (!health?.ok) throw new Error('One or more required Unani support services did not become healthy.');
    const expected = ['unani','bus','clinical','gateway','integrations','longitudinal','platform'].sort();
    const actual = Object.keys(health.services).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Unexpected services: ${actual.join(', ')}`);
    const forms = await request('/v1/unani/forms');
    if (forms.status !== 401) throw new Error(`Expected protected Unani forms to return 401 before login; got ${forms.status}`);
    const removed = await request('/v1/ayurveda/forms');
    if (removed.status !== 404) throw new Error(`Expected Ayurveda route to be unavailable (404); got ${removed.status}`);
    console.log('Unani integration smoke test passed: shared AYUSH services healthy, Unani route protected, and domain gateway isolated.');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { kids.forEach((p) => p.kill()); }
})();
