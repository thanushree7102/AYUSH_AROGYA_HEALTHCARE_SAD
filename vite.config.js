import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// One React app, built from the frontend/ folder of each service. The aliases below point at those folders.
// Dev: the app runs on :5176 and the dev server forwards /v1 calls to the API GATEWAY (PORT_BASE from .env, default 5400),
// so the browser always talks to one origin and no gateway address is baked into the build.
// Production: `npm run build` then `npm start`; the gateway serves the build and the API from the same origin.
const r = (p) => path.resolve(__dirname, p);
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const GATEWAY = `http://127.0.0.1:${env.PORT_BASE || process.env.PORT_BASE || 5400}`;
  return {
    server: {
      host: '0.0.0.0', port: 5176, strictPort: true,
      proxy: { '/v1': GATEWAY, '/api': GATEWAY },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': r('shared-platform/frontend'),
        '@yoga': r('services/yoga-naturopathy-service/frontend'),
        '@unani': r('services/unani-service/frontend'),
        '@siddha': r('services/siddha-service/frontend'),
        '@homoeopathy': r('services/homoeopathy-service/frontend'),
        '@clinical': r('services/common-clinical-service/frontend'),
        '@longitudinal': r('longitudinal-record-service/frontend'),
      },
    },
  };
});
