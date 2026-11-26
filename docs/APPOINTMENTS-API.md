# Appointments API

The Common Clinical Service persists appointment bookings in `appointments` within `clinical.db`. This Unani deployment uses the `Unani` system label. Patient access is checked through Shared Platform consent rules; practitioner access is restricted to the authenticated doctor identity and approved system.

The frontend supports listing available doctors, choosing a date/time and consultation mode, submitting a booking, viewing appointment history, cancellation, and practitioner accept/decline/completion actions. Appointment reminders and full overlapping-duration conflict detection are not included.
