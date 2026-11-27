# Patient Appointment Booking UI

The patient portal now includes an Appointments tab. It uses the existing signed-in API client and calls the gateway endpoints:

- `GET /clinical/patients/:patientId/appointments`
- `GET /doctors`
- `POST /clinical/appointments`
- `PATCH /clinical/appointments/:appointmentId`

The page supports booking, viewing and cancelling appointments. Doctor availability calendars and notification delivery are not included in this increment. Runtime integration must be verified against the local services and seeded doctor accounts.
