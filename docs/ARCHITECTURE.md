# Unani System Architecture — Shared AYUSH Deployment

Unani is an independent domain application connected to the existing Ayurveda-hosted shared AYUSH infrastructure. Ayurveda runs the single Shared Platform, Common Clinical, Longitudinal Record Service, Integrations service and Event Bus. Yoga and Unani each run only their own domain service and API Gateway/frontend.

## Doctor panel modules
1. Case Taking (Ahwal)
2. Mizaj Assessment
3. Diagnosis (Tashkhees)
4. Treatment (Ilaj)
5. Follow-up
6. Common Clinical
7. Medicines (Prescription)

## Data ownership
- Shared Platform (hosted by Ayurveda): one patient identity/Health ID, accounts, roles, patient profile, consent, access control and administration.
- Unani Service: versioned Ahwal, Mizaj, Tashkhees, Ilaj and follow-up submissions in `AYUSH_SHARED_DATA/unani-service/unani.db`.
- Common Clinical (hosted by Ayurveda): shared encounters, appointments, clinical records, prescriptions/medicines and uploaded documents.
- Longitudinal Record (hosted by Ayurveda): consent-aware patient timeline and summary across Ayurveda, Yoga and Unani.
- Integrations (hosted by Ayurveda): OCR, voice and translation.
- Event Bus (hosted by Ayurveda): receives Unani assessment events and distributes them to subscribed shared services.

## Request and data flow
Browser -> Unani API Gateway (5300) -> Unani domain service (5302). The gateway validates the signed user token with the Shared Platform (5101). For an assessment read/write, Unani resolves the encounter from Common Clinical (5107), checks system-specific patient consent with Shared Platform, stores a new version in its own Unani database and publishes an assessment event to Event Bus (5110). The shared Longitudinal Record Service (5108) consumes the event and updates the patient's cross-system timeline. Common clinical records and patient identity are shared; domain assessment data remains separated by system.

## Ports
- Unani gateway: 5300
- Unani domain service: 5302
- Unani frontend: 5173
- Shared Platform: 5101 (Ayurveda host)
- Common Clinical: 5107 (Ayurveda host)
- Longitudinal: 5108 (Ayurveda host)
- Integrations: 5109 (Ayurveda host)
- Event Bus: 5110 (Ayurveda host)

See `COMBINED_WORKSPACE_SETUP.md` for exact folder layout, environment variables and startup order.
