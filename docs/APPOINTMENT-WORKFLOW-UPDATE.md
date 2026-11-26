# Appointment workflow update

## Patient flow
- Patients book an appointment against a verified doctor code.
- The server resolves the authenticated patient's identity and stores the verified patient name and Health ID with the appointment.
- Patients can see their appointment status and cancel their own booking.

## Doctor flow
- Doctor home (`/doctor`) includes a link to the appointment dashboard (`/doctor/appointments`).
- The signed-in doctor's own code is used to fetch assigned appointment requests.
- The doctor can confirm or decline a pending request and mark a confirmed appointment completed.
- Appointment management is separate from clinical-record consent. The doctor sees only booking details; clinical records continue to require the existing patient consent checks.

## WhatsApp removal
- Removed WhatsApp QR UI and gateway routes.
- Removed WhatsApp bot, transports, webhook routes and WhatsApp-only source directory.
- OTP remains local demo-only: shown on screen and in the Shared Platform terminal. A production SMS provider must be configured before public deployment.
- Kept OCR, voice transcription and translation integrations.

## Database migration
The Common Clinical Service adds `patient_name` to the existing appointments table with a backward-compatible `ALTER TABLE` migration. Existing appointments remain in place; older rows may show `Patient name unavailable`.


## Prescription and report management update

- Doctors can review all prior encounters, consultation records, patient-uploaded source documents and saved prescriptions from the Common Clinical panel.
- Original patient-uploaded PDF/JPG/PNG files can be opened inline or downloaded through an authenticated endpoint; files remain in private storage.
- Doctors can edit problem, diagnosis, advice and medicine rows. Every save creates a new immutable prescription version with doctor identity and timestamp.
- Patients can see in-app prescription-update notifications, the latest prescription, earlier versions, and download version-specific PDFs using the browser print/save-to-PDF dialog.
- Patients and doctors can open/download the original uploaded report files, subject to the existing identity and patient-consent checks.
- Existing prescriptions receive a version-1 snapshot on service startup. Existing uploaded files are not moved or exposed publicly.
- PDF export uses the browser's print dialog (choose “Save as PDF”); no PDF generation dependency was added.
