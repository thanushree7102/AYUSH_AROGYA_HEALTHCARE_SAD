try { require('dotenv').config(); } catch (e) {}
// Adds an Unani demo doctor (9000000003) to the existing shared Ayurveda-hosted platform; it does not start a second platform.
// Shared clinic/admin/auditor accounts are retained from the central platform seed.
// Creates the demo accounts (Unani doctor 9000000003, clinic 9000000005, auditor 9000000008,
// admin 9000000009) in the Shared Platform database. The Shared Platform also does this on its first start (SEED_DEMO=0 turns it off).
process.env.SERVICE_NAME = 'platform';
require('../shared-platform/backend/seed')();
console.log('Unani demo doctor is added to the shared AYUSH Platform. Sign in with OTP (see OTP_CODE in .env; empty = shown by the shared platform server).');
process.exit(0);
