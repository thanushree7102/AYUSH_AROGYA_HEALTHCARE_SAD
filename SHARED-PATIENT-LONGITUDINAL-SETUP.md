# Shared Patient Identity & Longitudinal Records — Ayurveda package

This package remains a separately deployable domain application. To link patient identity and longitudinal history with the Yoga & Naturopathy package on the **same development computer**, both packages must use the same shared data folder.

## One-time folder layout (keep both extracted project folders side by side)

```text
AYUSH-Workspace/
  AYUSH-AYURVEDA/
    AYUSH-DIGITAL-HEALTH-PLATFORM/
  AYUSH-YOGA/
    AYUSH-DIGITAL-HEALTH-PLATFORM/
  AYUSH_SHARED_DATA/          <-- common platform, clinical and longitudinal databases
```

## Configure this package

1. Open `AYUSH-DIGITAL-HEALTH-PLATFORM`.
2. Copy `.env.example` to `.env`.
3. Keep these values exactly as shown:

```env
PORT_BASE=5100
DATA_ROOT=../../AYUSH_SHARED_DATA
EVENT_BUS_DATA_ROOT=./local-data/event-bus
INTEGRATIONS_DATA_ROOT=./local-data/integrations
SEED_DEMO=1
```

4. Configure the other package with its own `PORT_BASE`, but the **same** `DATA_ROOT=../../AYUSH_SHARED_DATA`.
5. Do not point `EVENT_BUS_DATA_ROOT` or `INTEGRATIONS_DATA_ROOT` to the shared folder. Those are intentionally local to each app so their event-bus subscriptions and integrations remain isolated.

## Run both apps

Open two separate CMD windows.

**Ayurveda window**
```cmd
cd AYUSH-Workspace\AYUSH-AYURVEDA\AYUSH-DIGITAL-HEALTH-PLATFORM
npm install
npm run dev
```

**Yoga & Naturopathy window**
```cmd
cd AYUSH-Workspace\AYUSH-YOGA\AYUSH-DIGITAL-HEALTH-PLATFORM
npm install
npm run dev
```

Frontend: `http://localhost:5171`

## Expected behaviour

- A patient registers once with a verified mobile number in either app.
- The Shared Platform database enforces one patient account for that mobile number.
- The same Health Record ID / Patient ID is used when the patient signs in to the other app. If the patient already exists, sign in; do not register a duplicate.
- Ayurveda and Yoga clinical records are stored in the shared clinical database with their own `ayush_system` labels.
- Both apps' longitudinal timelines read from the shared longitudinal database.
- In Patient → Privacy, the patient selects which doctors can access the connected records. A saved grant covers both connected systems; unselected doctors remain blocked.

## Important boundaries

- This local shared-folder setup is for both apps running on the **same computer**. It is not a multi-computer production database. For deployment across different machines, host the shared identity/clinical/longitudinal databases behind a central authenticated API or use a central database server.
- The two domain services and their domain-specific assessment databases remain separate.
- Patient identity and common clinical records are shared. The doctor must be explicitly selected by the patient before reading the connected record.
- Existing databases from two separate previous runs are not automatically merged. For a clean test, start with a new shared folder and register a test patient once. Back up existing databases before any migration.


## Local demo OTP behaviour

The local demo has no OTP resend cooldown and no per-hour OTP request cap, to support repeated classroom testing. Each new OTP replaces the previous code. OTPs remain random, expire after 5 minutes, are single-use, and are invalidated after 5 incorrect attempts. This relaxed request policy is for localhost testing only. Do not expose it to the public internet or use it in production; production must use rate limiting and abuse monitoring.
