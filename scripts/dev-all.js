try { require('dotenv').config(); } catch (e) {}
require('./prepare-shared-data');

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { ROOT, PROCESSES } = require('./services');
const kids = [];
const colors = [36, 32, 33, 35, 34, 31, 96, 92, 93, 95, 94, 91];

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(Number(port), process.env.SERVICE_HOST || '127.0.0.1');
  });
}

const run = (name, cmd, args, i) => {
  const p = spawn(cmd, args, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${colors[i % colors.length]}m[${name}]\x1b[0m `;
  const out = (d) => String(d).split('\n').filter(Boolean).forEach((l) => console.log(tag + l));
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('exit', (c) => console.log(`${tag}exited (${c})`));
  kids.push(p);
};

async function main() {
  for (let i = 0; i < PROCESSES.length; i++) {
    const [name, file, portEnv] = PROCESSES[i];
    if (portEnv) {
      const port = Number(process.env[portEnv] || 0);
      if (!port) {
        console.error(`[startup] ${portEnv} is missing from .env; cannot start ${name}.`);
        continue;
      }
      if (!(await portIsFree(port))) {
        console.log(`[shared] ${name} already running on ${port}; reusing it.`);
        continue;
      }
      console.log(`[shared] ${name} is not running; starting on ${port}`);
    }
    run(name, process.execPath, [path.join(ROOT, file)], i);
  }

  if (!process.argv.includes('--no-frontend')) {
    const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
    run('frontend', process.execPath, [viteBin, '--host', '0.0.0.0'], 11);
  }
}
main().catch((e) => { console.error('[startup] failed:', e); process.exitCode = 1; });

const stop = () => { kids.forEach((k) => k.kill()); };
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
