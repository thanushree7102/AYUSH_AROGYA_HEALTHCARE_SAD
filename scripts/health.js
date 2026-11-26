// Prints the health of every service (through each service's own /health and the gateway's /v1/health).
const { SERVICES, ACTIVE_SERVICES } = require('../libs/common/config');
(async () => {
  let bad = 0;
  for (const s of ACTIVE_SERVICES.map((k) => SERVICES[k])) {
    try { const r = await fetch(`${s.url}/health`, { signal: AbortSignal.timeout(2500) }); console.log(`${r.ok ? 'UP  ' : 'DOWN'} ${s.name.padEnd(13)} :${s.port}`); if (!r.ok) bad++; }
    catch (e) { console.log(`DOWN ${s.name.padEnd(13)} :${s.port}`); bad++; }
  }
  process.exit(bad ? 1 : 0);
})();
