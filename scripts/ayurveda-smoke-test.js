// Starts the Ayurveda deployment, verifies essential services and checks gateway routing.
const { spawn } = require('child_process');
const { ROOT, PROCESSES } = require('./services');
const kids = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://127.0.0.1:${Number(process.env.PORT_BASE || 5000)}`;
const request = async (path, options) => fetch(`${base}${path}`, options);
(async () => {
  try {
    for (const [name, file] of PROCESSES) {
      const child = spawn(process.execPath, [file], { cwd: ROOT, env: { ...process.env, AYUSH_SECRET: 'ayurveda-smoke-test-secret', OTP_CODE: '123456' }, stdio: 'ignore' });
      kids.push(child);
    }
    let health;
    for (let i = 0; i < 40; i++) {
      try { const r = await request('/v1/health'); if (r.ok) { health = await r.json(); if (health.ok) break; } } catch {}
      await sleep(500);
    }
    if (!health?.ok) throw new Error('One or more required Ayurveda support services did not become healthy.');
    const serviceNames = Object.keys(health.services).sort();
    const expected = ['ayurveda','bus','clinical','gateway','integrations','longitudinal','platform'].sort();
    if (JSON.stringify(serviceNames) !== JSON.stringify(expected)) throw new Error(`Unexpected services: ${serviceNames.join(', ')}`);
    const forms = await request('/v1/ayurveda/forms');
    if (forms.status !== 401) throw new Error(`Expected protected Ayurveda forms to return 401 before login; got ${forms.status}`);
    const removed = await request('/v1/yoga/forms');
    if (removed.status !== 404) throw new Error(`Expected Yoga route to be removed (404); got ${removed.status}`);
    console.log('Ayurveda smoke test passed: required services healthy, Ayurveda route protected, other AYUSH route removed.');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { kids.forEach((p) => p.kill()); }
})();
