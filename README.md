# AYUSH Unani Healthcare System

A separate Unani application integrated with the same AYUSH shared healthcare infrastructure used by Ayurveda and Yoga. It retains shared registration, authentication, patient/doctor/admin portals, appointments, common clinical records, prescriptions/medicines, document upload/OCR, consent, notifications, audit and longitudinal records. Unani owns its domain-specific clinical forms and its own SQLite domain database.

## Unani Doctor Panel
1. Case Taking (Ahwal)
2. Mizaj Assessment
3. Diagnosis (Tashkhees)
4. Treatment (Ilaj)
5. Follow-up
6. Common Clinical
7. Medicines (Prescription) — provided through the shared Common Clinical service.

## Requirements
- Node.js 20 or newer (recommended)
- npm

## Combined AYUSH workspace setup
This ZIP is designed to run beside the Ayurveda and Yoga projects, not as a second independent identity/clinical platform.

1. Extract Unani as a sibling folder beside Ayurveda and Yoga (see `COMBINED_WORKSPACE_SETUP.md`).
2. Run `npm install` in the Unani folder.
3. Copy `.env.example` to `.env` (`copy .env.example .env` on Windows).
4. Keep `DATA_ROOT=../../AYUSH_SHARED_DATA` and the same `AYUSH_SECRET` as Ayurveda and Yoga.
5. Start Ayurveda first with `npm run dev` so the shared platform, Common Clinical, Longitudinal, Integrations and Event Bus are available.
6. Start Yoga with `npm run dev`, then Unani with `npm run dev`.
7. Open Unani at `http://localhost:5173`.

Unani starts only its own domain service, API Gateway and frontend. It does not start duplicate shared services. Do not run Unani before the Ayurveda shared services are healthy.

Backend only: `npm start`
Frontend only (backend must already be running): `npm run dev:frontend`
Production frontend build: `npm run build`
Syntax check: `npm run check`
Smoke test: `npm test`

## Ports
Unani gateway 5300; Unani domain service 5302; Unani frontend 5173. Shared services are hosted by Ayurveda: platform 5101, common clinical 5107, longitudinal 5108, integrations 5109 and event bus 5110.

## Database and data sharing
All three applications must use the exact same `DATA_ROOT=../../AYUSH_SHARED_DATA`. The Shared Platform owns one patient identity/Health ID, account, role and consent registry. Common Clinical owns shared encounters, appointments, prescriptions, uploads and clinical records. Longitudinal Record aggregates events from all AYUSH domain services. Event Bus distributes Unani assessment events to the shared longitudinal service. Unani-specific Ahwal, Mizaj, Tashkhees, Ilaj and follow-up submissions remain in `AYUSH_SHARED_DATA/unani-service/unani.db`; Ayurveda and Yoga domain records remain in their own databases.

Cross-system visibility is consent-aware. A shared patient identity does not grant every practitioner unrestricted access to every system's clinical history. The patient must grant the relevant system-specific consent and the practitioner must pass the shared access checks.

## Important implementation notes
- Existing shared databases are never overwritten by `npm run prepare:data`; that script initializes only the Unani domain database.
- Unani assessment fields are configurable form definitions and should be clinically reviewed by qualified Unani practitioners before real-world use.
- OTP, Aadhaar/ABHA, face recognition, OCR, voice and translation integrations retain the demo/configuration limitations described in `docs/LIMITATIONS.md`.
- This project is a software record-management workflow, not an autonomous diagnostic or prescribing system.
