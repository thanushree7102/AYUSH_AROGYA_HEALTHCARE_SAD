try { require('dotenv').config(); } catch (e) {}
require('./prepare-shared-data');
// Starts the Unani domain service and its gateway/frontend; shared AYUSH services are hosted by Ayurveda.
//   node scripts/dev-all.js               Unani domain + gateway + frontend (npm run dev)
//   node scripts/dev-all.js --no-frontend Unani backend only (npm start)
const { spawn } = require('child_process');
const { ROOT, PROCESSES } = require('./services');
const kids = [];
const colors = [36, 32, 33, 35, 34, 31, 96, 92, 93, 95, 94, 91];
const run = (name, cmd, args, i) => {
  const p = spawn(cmd, args, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${colors[i % colors.length]}m[${name}]\x1b[0m `;
  const out = (d) => String(d).split('\n').filter(Boolean).forEach((l) => console.log(tag + l));
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('exit', (c) => console.log(`${tag}exited (${c})`));
  kids.push(p);
};
PROCESSES.forEach(([n, f], i) => run(n, process.execPath, [f], i));
if (!process.argv.includes('--no-frontend')) {
  ['unani'].forEach((name, i) =>
    run(`frontend-${name}`, process.execPath, [require('path').join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', `frontend-apps/${name}/vite.config.js`], 11 + i));
}
const stop = () => { kids.forEach((k) => k.kill()); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
