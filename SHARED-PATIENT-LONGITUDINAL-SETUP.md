# Shared Patient Identity & Longitudinal Records — Unani deployment

The Unani deployment runs one shared identity and clinical platform alongside a dedicated Unani domain service.

## Service responsibilities
- Shared Platform: patient, doctor, clinic and admin identity; registration; authentication; roles; consent; verification.
- Common Clinical: encounters, appointments, prescriptions, medicines, clinical records and uploaded documents.
- Unani Service: Ahwal, Mizaj, Tashkhees, Ilaj and follow-up forms in its own database.
- Longitudinal Record: consent-aware patient summary and timeline.
- Integrations: OCR, voice and translation endpoints.
- Event Bus: internal event delivery.
- API Gateway: authenticated browser-facing API.

## Data separation
Patient identity and consent are stored in Shared Platform. Common clinical information is stored in Common Clinical. Unani assessment forms are stored in `services/unani-service/database/unani.db`. The longitudinal service reads shared clinical events and presents a patient history subject to consent checks.

## Local startup
Use `npm install`, copy `.env.example` to `.env`, then run `npm run dev`. Open `http://localhost:5171`. See `README.md` for ports and commands.
