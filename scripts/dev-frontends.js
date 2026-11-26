// Starts the single Ayurveda frontend. Ctrl+C stops it.
const { spawn } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const p = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', 'frontend-apps/ayurveda/vite.config.js'], { cwd: root, stdio: 'inherit' });
const stop = () => { p.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
