# Deployment notes and limitations

- This package is an Ayurveda-only deployment. Other AYUSH domain services and frontends are intentionally excluded.
- Shared Platform, Common Clinical, Longitudinal Records, Integrations, Event Bus and API Gateway remain because the Ayurveda workflows depend on them.
- The demo OTP and seeded accounts are for local demonstration only. Configure production OTP delivery, secrets, HTTPS, database backups and access controls before any real deployment.
- Prescription extraction is a draft-assistance feature. A patient or qualified practitioner must verify extracted text and clinical details before saving or acting on them.
- This demonstration is not a substitute for professional medical diagnosis or treatment.
