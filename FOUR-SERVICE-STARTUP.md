# Unani startup in the combined AYUSH workspace

1. Install Node.js 20+ and npm.
2. Extract Unani beside the Ayurveda and Yoga project folders.
3. Run `npm install` in the Unani folder.
4. Copy `.env.example` to `.env`; retain `DATA_ROOT=../../AYUSH_SHARED_DATA` and the shared-service URLs provided in the example.
5. Start Ayurveda first. It hosts the one shared platform, common clinical, longitudinal, integrations and event bus stack.
6. Start Yoga, then start Unani with `npm run dev`.
7. Open `http://localhost:5173`.

Unani starts only its Unani domain service (port 5302), API Gateway (port 5300) and frontend (port 5173). It does not start duplicate shared services. Backend only: `npm start`. Health check: `npm run health`; gateway health: `http://127.0.0.1:5300/v1/health`.
