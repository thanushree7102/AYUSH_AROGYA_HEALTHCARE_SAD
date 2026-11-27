# Ayurveda-only architecture

## Services and ownership

| Service | Port | Responsibility |
|---|---:|---|
| API Gateway | 5000 | Browser entry point, routing, authentication checks and health aggregation |
| Shared Platform | 5001 | Patient/doctor/clinic registration, login, OTP, face verification, identity, consent and audit |
| Ayurveda Service | 5002 | Ayurveda-specific assessment forms, versioned consultation data and assessment summaries |
| Common Clinical | 5007 | Patient encounters, prescription records and uploaded documents |
| Longitudinal Records | 5008 | Patient timeline and summary read model |
| Integrations | 5009 | OCR, voice and translation |
| Event Bus | 5010 | Internal event delivery between services |

The only AYUSH domain service included in this deployment is Ayurveda. The other AYUSH domain services and frontends are not present.

## Data flow

1. A patient or practitioner registers and signs in through the Shared Platform.
2. Patient uploads and common prescription records are handled by Common Clinical.
3. The practitioner opens an encounter and completes Ayurveda-specific forms in the Ayurveda workspace.
4. Ayurveda form submissions are saved as versioned records in the Ayurveda service's own database (`services/ayurveda-service/database/ayurveda.db`).
5. The Ayurveda service checks encounter ownership and patient consent through the internal service APIs, then publishes assessment events for the Longitudinal Records service.

## Run

From the project root:

```cmd
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5171`. The API Gateway listens on port 5000. Keep the terminal open while using the application and press Ctrl+C to stop all processes.

## Health and verification

```cmd
npm run health
npm run check
npm test
```

`npm test` starts the required backend services and checks service health, protected Ayurveda form access, and that removed AYUSH routes return 404.
