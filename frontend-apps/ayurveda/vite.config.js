import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, '');
  const gatewayPort = Number(env.PORT_BASE || '5100');
  return {
    root: HERE,
    plugins: [react()],
    define: { 'import.meta.env.VITE_AYUSH_SYSTEM': JSON.stringify('ayurveda') },
    resolve: {
      alias: {
        '@shared': path.resolve(ROOT, 'shared-platform/frontend'),
        '@ayurveda': path.resolve(ROOT, 'services/ayurveda-service/frontend'),
        '@clinical': path.resolve(ROOT, 'services/common-clinical-service/frontend'),
        '@longitudinal': path.resolve(ROOT, 'longitudinal-record-service/frontend'),
      },
    },
    publicDir: path.resolve(ROOT, 'public'),
    server: {
      host: '0.0.0.0',
      port: 5171,
      strictPort: true,
      fs: { allow: [ROOT] },
      proxy: {
        '/v1': `http://localhost:${gatewayPort}`,
        '/api': `http://localhost:${gatewayPort}`,
        '/health': `http://localhost:${gatewayPort}`,
      },
    },
    build: { outDir: path.resolve(ROOT, 'dist/frontends/ayurveda'), emptyOutDir: true },
  };
});