# Unani & Siddha feature implementation

This package merges the AYUSH frontend, backend, API integration and database source packages into one runnable project.

## Included workflows
- Shared patient identity and consent-aware longitudinal records across Ayurveda, Yoga & Naturopathy, Unani, Siddha and Homoeopathy.
- Patient appointment booking with AYUSH system selection, doctor, date/time, duration, mode and reason.
- Doctor appointment inbox with patient identity, requested service and booking details; accept, decline and complete actions.
- Existing common clinical prescription/report workflows: upload, original file download, doctor editing, immutable prescription versions, doctor name/timestamp, PDF export and patient-side version history.
- Unani-specific forms: Case taking (Ahwal), Mizaj assessment, Diagnosis (Tashkhees), Treatment (Ilaj), Follow-up.
- Siddha-specific forms: Envagai Thervu, Mukkutram, Diagnosis (Noi Naadal), Treatment plan, Follow-up.
- Generic domain form reload/edit: previously saved values are loaded when reopening a consultation; saving a correction creates the next version. Version metadata is shown in the form.
- AI Q&A, OCR, voice and translation modules are retained.
- WhatsApp QR, bot, webhook and delivery code are removed. Demo OTP is displayed locally.

## Run
1. Extract the project root.
2. Copy `.env.example` to `.env` (a local demo `.env` is also included).
3. Keep `PORT_BASE=5000` unless you have a port conflict.
4. Run `npm install`, then `npm run dev`.
5. Open the Vite URL printed by the terminal.
6. Start patient appointment booking by selecting Unani or Siddha in the AYUSH service dropdown.
7. Doctors use `/doctor/appointments` to review requests.

## Data and safety
All services use the same configured DATA_ROOT for shared identity and local service databases. Keep backups before replacing an existing project. Cross-service clinical access remains controlled by patient consent; appointment booking metadata is visible to the assigned doctor only to manage the booking. Prescription PDF generation uses the existing PDFKit implementation. This is a local academic/demo package and is not certified for production clinical use.
