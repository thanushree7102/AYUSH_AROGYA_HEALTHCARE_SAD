# Appointment Management API

The Common Clinical Service now persists appointment bookings in `appointments` within `clinical.db`. The service is domain-scoped: the Ayurveda application accepts `Ayurveda`; the Yoga application accepts `Yoga & Naturopathy`. Patient access is checked through the Shared Platform and its consent rules. Practitioner access is restricted to the authenticated doctor code.

All requests go through the API Gateway and require the normal signed access token. JSON requests use `Content-Type: application/json`. Date/time values must be ISO-8601 strings with a timezone, for example `2026-12-02T10:30:00+05:30`.

## Endpoints

### Book an appointment
`POST /api/clinical/appointments` (gateway prefix may vary by local route configuration)

```json
{
  "patientId": "patient-health-id-or-consultation-code",
  "doctorId": "verified-doctor-code",
  "system": "Ayurveda",
  "scheduledAt": "2026-12-02T10:30:00+05:30",
  "durationMinutes": 30,
  "mode": "In-person",
  "reason": "Follow-up consultation"
}
```

Returns `201` and the appointment object. A doctor/time collision returns `409`. Duration must be 10–180 minutes.

### List a patient's appointments
`GET /api/clinical/patients/:patientId/appointments`

Returns only appointments for the authenticated patient's permitted AYUSH systems, or appointments permitted by the practitioner's active consent.

### List a practitioner's appointments
`GET /api/clinical/doctors/:doctorCode/appointments`

Only the matching authenticated practitioner may call this endpoint. Records are filtered through patient consent.

### Reschedule, cancel or update
`PATCH /api/clinical/appointments/:appointmentId`

```json
{ "scheduledAt": "2026-12-03T11:00:00+05:30", "mode": "Video" }
```

Patients may cancel their own appointment by sending `{ "status": "Cancelled" }`. Practitioners may update status to `Confirmed`, `Completed`, `Cancelled` or `No-show`, and may reschedule.

## Important implementation notes

- The database table is created automatically at service startup using `CREATE TABLE IF NOT EXISTS`. Existing clinical records are not migrated or deleted.
- Doctor/time collision detection prevents two active bookings at the same exact start time. This first iteration does not yet implement recurring availability calendars, slot generation, reminder delivery or overlapping-duration detection.
- Appointment APIs are implemented in both application codebases. The front-end booking screens and end-to-end runtime verification remain subsequent work.
- For production, add rate limits, notification delivery, robust timezone policy, database backups and a centralized shared Clinical Service deployment.
