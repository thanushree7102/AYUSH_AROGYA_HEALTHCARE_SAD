# Ayurveda Healthcare Platform — Ayurveda Only

This package contains the **Ayurveda frontend and its required backend support services only**. Yoga & Naturopathy, Unani, Siddha and Homoeopathy service code and frontends have been removed.

## Run on Windows CMD

1. Extract the ZIP.
2. Open CMD inside the `AYUSH-DIGITAL-HEALTH-PLATFORM` folder.
3. Install dependencies:

```cmd
npm install
```

4. Create the environment file:

```cmd
copy .env.example .env
```

5. Start the Ayurveda frontend and required backend services:

```cmd
npm run dev
```

6. Open **http://localhost:5171**.

## Included services

- Ayurveda domain service (port 5002)
- Shared Platform: registration, login, identity and consent (port 5001)
- Common Clinical: patient encounters, prescriptions and uploads (port 5007)
- Longitudinal Records: patient timeline and summary (port 5008)
- Integrations: OCR, voice and translation endpoints (port 5009)
- Event Bus (port 5010)
- API Gateway (port 5000)

These supporting services are retained because the Ayurveda application depends on them. They are not additional AYUSH systems.

## Useful commands

```cmd
npm run dev          :: start backend services + Ayurveda frontend
npm start            :: start backend services only
npm run dev:ayurveda :: start only the Ayurveda frontend (backend must already be running)
npm run build        :: build the Ayurveda frontend only
npm run check        :: check JavaScript syntax
npm test             :: run the Ayurveda deployment smoke test
npm run health       :: check required backend services
```

Keep the terminal open while using the application. Press Ctrl+C to stop the processes.
