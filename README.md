# AYUSH Siddha Health Record (standalone)

Siddha doctor workspace + patient app. Runs on its own: it starts the shared identity, clinical, timeline, integrations, event-bus and AI services itself, plus the Siddha domain service and the API gateway.

## Run (Windows CMD)

```cmd
npm install
copy .env.example .env
npm run dev
```

Open **http://localhost:5176**. Gateway: http://127.0.0.1:5400. Keep `AYUSH_SECRET` blank (a secret is created once in `AYUSH_SHARED_DATA`).

Production-style: `npm run build` then `npm start`, and open http://localhost:5400.

## Demo sign-in (OTP is shown by the server, or `OTP_CODE` from `.env`)

| Role | Mobile |
|---|---|
| Siddha doctor | 9000000003 |
| Clinic | 9000000005 |
| Auditor / Admin | 9000000008 / 9000000009 |

Patients register themselves (OTP + face). The patient must share the record with the doctor (Privacy page) before the doctor can open it.

## What the Siddha doctor sees

1. **Mukkutram & Udal Thegi** – Udal Thegi, dominant Mukkutram, Vatham/Pitham/Kabam state (Thannilai / Valarchi / Thaazhchi), Udal Thathukkal
2. **Envagai Thervu** – presenting complaint, Naadi, Sparisam, Naa, Niram, Mozhi, Vizhi, Malam, Neer Kuri, Nei Kuri
3. **Noi Naadal** – diagnosis (doctor only)
4. **Maruthuvam** – Ul Marunthu, Marunthu Vagai, Pura Maruthuvam / Varmam, Pathiyam, Apathiyam, Yogam (doctor only)
5. **Follow-up**
6. **Marunthu (Prescription)** – issue/update prescriptions, PDF download

Forms live in `services/siddha-service/backend/server.js`; the screen is `services/siddha-service/frontend/SiddhaDoctorLayout.jsx`. Every save is a new version. Internally the constitution field is still stored in a column named `prakriti`; the UI shows it as Udal Thegi.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | all services + UI |
| `npm start` | services only (serves a built UI) |
| `npm test` | end-to-end Siddha test on temporary data |
| `npm run test:reader` | prescription reader checks |
| `npm run check` | syntax check |
| `npm run health` | service health |

Optional: set `ANTHROPIC_API_KEY` in `.env` for handwriting/Tamil prescription reading.

Local demo only: fixed OTP and demo secrets must not be exposed publicly. AI text is informational; a qualified Siddha practitioner makes clinical decisions. See `docs/LIMITATIONS.md`.
