# AYUSH Combined Workspace — deployment notes

## Shared local development topology

This workspace uses one central shared infrastructure stack from the Ayurveda project and a separate Yoga domain service + Yoga API gateway. This avoids launching two copies of Shared Platform, Common Clinical, Longitudinal, Integrations and Event Bus against the same SQLite files.

### Folder layout

```text
AYUSH-WORKSPACE/
  AYUSH-AYURVEDA/AYUSH-DIGITAL-HEALTH-PLATFORM/
  AYUSH-YOGA/AYUSH-DIGITAL-HEALTH-PLATFORM/
  AYUSH_SHARED_DATA/
```

### Setup (Windows)

1. Extract the Ayurveda ZIP under `AYUSH-AYURVEDA` and Yoga ZIP under `AYUSH-YOGA`.
2. In each project folder run `copy .env.example .env`.
3. Keep Ayurveda `PORT_BASE=5100` and `DATA_ROOT=../../AYUSH_SHARED_DATA`.
4. Keep Yoga `PORT_BASE=5200` and `DATA_ROOT=../../AYUSH_SHARED_DATA`. Its `.env.example` maps the shared service URLs to Ayurveda's ports.
5. Install dependencies in both project folders using `npm install`.
6. Start Ayurveda first (`npm run dev`). Start Yoga second (`npm run dev`).

Ayurveda owns the shared service processes. Yoga starts only its own domain service and API gateway. Stop both terminal processes with Ctrl+C.

## Important scope and safety notes

- The shared database directory must be identical in both `.env` files. Do not run a second copy of shared services against the same SQLite files.
- The OTP-unlimited setting is for local demonstration only. Never expose it to the public internet.
- AI summaries are informational and must not diagnose conditions or prescribe treatment. A qualified practitioner must review clinical decisions.
- This packaging update fixes the local shared-service startup topology. It does not mean every proposed product feature (appointments, trackers, reports, AI assistant, reminders) has been fully implemented or clinically validated. Those require feature-by-feature implementation and acceptance testing.

## Verification

Run `npm run check` in each project. Then run `npm run health` after startup. Verify the gateway health endpoints at `http://127.0.0.1:5100/health` (Ayurveda) and `http://127.0.0.1:5200/health` (Yoga).
