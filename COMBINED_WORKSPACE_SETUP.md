# AYUSH Combined Workspace — Unani integration

Unani is a third independent AYUSH application connected to the same shared patient-data infrastructure used by Ayurveda and Yoga. It must NOT start a second Shared Platform, Common Clinical, Longitudinal Record Service, Integrations service or Event Bus.

## Required folder layout (Windows)

```text
AYUSH-WORKSPACE/
  AYUSH-AYURVEDA/AYUSH-DIGITAL-HEALTH-PLATFORM/
  AYUSH-YOGA/AYUSH-DIGITAL-HEALTH-PLATFORM/
  AYUSH-UNANI/AYUSH-UNANI-FOUR-SERVICES-FINAL/
  AYUSH_SHARED_DATA/
```

The Unani project folder may have a different name; keep it at the same directory depth as the Ayurveda and Yoga project folders.

## One-time setup

1. Extract Ayurveda, Yoga and Unani as sibling project folders using the layout above.
2. In each project folder, run `npm install`.
3. Copy `.env.example` to `.env` in all three projects (Windows: `copy .env.example .env`).
4. Keep the same `DATA_ROOT=../../AYUSH_SHARED_DATA` in all three `.env` files.
5. Keep the same `AYUSH_SECRET` in all three projects. Recommended for local setup: leave it blank in all three so each resolves the same `AYUSH_SHARED_DATA/ayush.secret`. Do not set different secrets.
6. Keep the service port bases: Ayurveda `5100`, Yoga `5200`, Unani `5300`.
7. Unani `.env` must point to the Ayurveda-hosted shared services:
   - `PLATFORM_URL=http://127.0.0.1:5101`
   - `CLINICAL_URL=http://127.0.0.1:5107`
   - `LONGITUDINAL_URL=http://127.0.0.1:5108`
   - `INTEGRATIONS_URL=http://127.0.0.1:5109`
   - `BUS_URL=http://127.0.0.1:5110`

## Startup order

Open three terminals:

1. Ayurveda: `npm run dev` — starts the shared platform, common clinical, longitudinal, integrations, event bus, Ayurveda service, gateway and Ayurveda frontend.
2. Yoga: `npm run dev` — starts only Yoga domain service, Yoga gateway and Yoga frontend.
3. Unani: `npm run dev` — starts only Unani domain service, Unani gateway and Unani frontend.

Open:
- Ayurveda: `http://localhost:5171`
- Yoga: `http://localhost:5172`
- Unani: `http://localhost:5173`

Do not start Unani before Ayurveda's shared services are healthy. Do not run duplicate shared infrastructure from Yoga or Unani.

## What is shared

- One patient identity / Health ID registry.
- One Shared Platform account, role, consent and access-control database.
- One Common Clinical database for encounters, appointments, prescriptions, uploads and clinical records.
- One Longitudinal Record Service and patient timeline.
- One Event Bus, allowing Unani clinical events to reach the shared longitudinal service.
- One integrations service for OCR, voice and translation.
- Separate domain databases: Ayurveda, Yoga and Unani assessments remain in their own domain database.

Cross-system access is consent-aware. A patient's Unani records are not automatically visible to every doctor: the patient must grant the relevant system-specific consent and the doctor must pass the shared access checks. Shared patient identity does not mean unrestricted clinical-data access.

## Data safety

- The shared `AYUSH_SHARED_DATA` directory must be identical in all three `.env` files.
- Never run multiple copies of Shared Platform / Common Clinical / Longitudinal / Event Bus against the same SQLite files.
- Existing databases are never overwritten by `npm run prepare:data`.
- Back up `AYUSH_SHARED_DATA` before changing database or deployment configuration.
- OTP demo settings are for local development only; use secure production configuration before internet exposure.

## Verification

Run `npm run check` and `npm test` in the Unani project. Start Ayurveda first, then Yoga and Unani. Run `npm run health` in Unani and check `http://127.0.0.1:5300/v1/health`. Its health response should show the Unani service and all shared Ayurveda-hosted services as healthy.
