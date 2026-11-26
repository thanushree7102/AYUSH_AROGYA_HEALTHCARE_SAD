# AYUSH Database Package

This package contains the database folder layout plus the source files that define and initialize the project SQLite schemas.

## Important distinction
- The original database ZIP contained folder placeholders (`.gitkeep`) and a gateway database README, not populated `.db` files.
- This expanded package adds the actual schema-initialization source modules from the matching backend package.
- The project creates SQLite tables at service startup using `better-sqlite3` and `db.exec(...)`; the canonical definitions are JavaScript source, not standalone `.sql` migrations.
- No live patient data, credentials, or populated database files are included.

## Schema source files
The original project paths are preserved beneath `schema-source/`:

- `schema-source/libs/common/db.js`
- `schema-source/shared-platform/backend/db.js`
- `schema-source/shared-platform/backend/face.js`
- `schema-source/shared-platform/backend/aadhaar.js`
- `schema-source/services/common-clinical-service/backend/server.js`
- `schema-source/services/common-clinical-service/backend/prescriptions.js`
- `schema-source/event-bus/backend/server.js`
- `schema-source/longitudinal-record-service/backend/server.js`
- `schema-source/ai-service/backend/server.js`

## Tables found in these schema sources

- `idempotency` — `libs/common/db.js`
- `event_outbox` — `libs/common/db.js`
- `processed_events` — `libs/common/db.js`
- `patients` — `shared-platform/backend/db.js`
- `patient_emergency_contacts` — `shared-platform/backend/db.js`
- `patient_identity_references` — `shared-platform/backend/db.js`
- `patient_medical_history` — `shared-platform/backend/db.js`
- `patient_health_concerns` — `shared-platform/backend/db.js`
- `doctors` — `shared-platform/backend/db.js`
- `doctor_qualifications` — `shared-platform/backend/db.js`
- `doctor_registrations` — `shared-platform/backend/db.js`
- `doctor_specializations` — `shared-platform/backend/db.js`
- `doctor_availability` — `shared-platform/backend/db.js`
- `facilities` — `shared-platform/backend/db.js`
- `facility_addresses` — `shared-platform/backend/db.js`
- `facility_registrations` — `shared-platform/backend/db.js`
- `facility_services` — `shared-platform/backend/db.js`
- `facility_doctors` — `shared-platform/backend/db.js`
- `facility_infrastructure` — `shared-platform/backend/db.js`
- `user_accounts` — `shared-platform/backend/db.js`
- `admin_profiles` — `shared-platform/backend/db.js`
- `roles` — `shared-platform/backend/db.js`
- `permissions` — `shared-platform/backend/db.js`
- `user_role_assignments` — `shared-platform/backend/db.js`
- `role_permissions` — `shared-platform/backend/db.js`
- `authentication_events` — `shared-platform/backend/db.js`
- `biometric_verifications` — `shared-platform/backend/db.js`
- `consent_records` — `shared-platform/backend/db.js`
- `consent_grants` — `shared-platform/backend/db.js`
- `verification_cases` — `shared-platform/backend/db.js`
- `audit_logs` — `shared-platform/backend/db.js`
- `revoked_tokens` — `shared-platform/backend/db.js`
- `face_profiles` — `shared-platform/backend/face.js`
- `face_pending` — `shared-platform/backend/face.js`
- `face_attempts` — `shared-platform/backend/face.js`
- `demo_aadhaar` — `shared-platform/backend/aadhaar.js`
- `encounters` — `services/common-clinical-service/backend/server.js`
- `prescriptions` — `services/common-clinical-service/backend/server.js`
- `patient_records` — `services/common-clinical-service/backend/server.js`
- `patient_uploads` — `services/common-clinical-service/backend/server.js`
- `prescription_versions` — `services/common-clinical-service/backend/prescriptions.js`
- `prescription_files` — `services/common-clinical-service/backend/prescriptions.js`
- `doctor_visits` — `services/common-clinical-service/backend/prescriptions.js`
- `events` — `event-bus/backend/server.js`
- `subscriptions` — `event-bus/backend/server.js`
- `deliveries` — `event-bus/backend/server.js`
- `timeline_entries` — `longitudinal-record-service/backend/server.js`
- `qa_sessions` — `ai-service/backend/server.js`
- `qa_messages` — `ai-service/backend/server.js`
- `qa_feedback` — `ai-service/backend/server.js`

## Database layout
The service-specific `database/` folders are preserved with `.gitkeep` placeholders. Runtime SQLite files are created by the application when services start. See `schema-source/libs/common/db.js` for the shared helper and the service-specific schema source files for table definitions.
