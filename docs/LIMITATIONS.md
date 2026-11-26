# Implementation limitations and deployment notes

- This package exposes the Unani domain frontend and Unani clinical forms only. Shared infrastructure retains AYUSH-wide identity labels for compatibility.
- OTP delivery is demo/local unless an SMS provider is configured. The local demo may display OTPs.
- Aadhaar data is demo-only; there is no live UIDAI verification. ABHA validation is format-level unless a real ABDM integration is separately configured.
- Face matching does not independently establish production-grade liveness.
- OCR fallback is intended for printed English and may miss handwriting, Hindi or Urdu. AI document reading requires a configured compatible vision endpoint and must remain a draft for human review.
- Voice and translation depend on browser capabilities or configured external services.
- SQLite is the supplied local/demo database. Use a reviewed production database and operational backup strategy before production deployment.
- The Unani assessment fields are configurable software forms, not validated clinical protocols. A qualified Unani practitioner must review the fields and clinical terminology before real-world use.
- The application records practitioner-entered information; it is not an autonomous diagnosis or prescribing system.
