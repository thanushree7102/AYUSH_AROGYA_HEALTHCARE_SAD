// Local-only shared identity diagnostic. Prints only whether a mobile has a patient account and a masked Health ID.
try { require('dotenv').config(); } catch (e) {}
const path = require('path');
const { openDb } = require('../libs/common/db');
const db = openDb(path.join(__dirname, '..', 'shared-platform', 'database'), 'platform.db', 'shared-platform');
const mobile = String(process.argv[2] || '').replace(/\\D/g, '');
if (!/^\\d{10}$/.test(mobile)) {
  console.error('Usage: node scripts/check-shared-patient.js 10_DIGIT_MOBILE');
  process.exit(2);
}
const row = db.prepare(`SELECT p.health_id, p.account_status, ua.account_status user_status
  FROM patients p JOIN user_accounts ua ON ua.linked_profile_id=p.patient_id AND ua.account_type='Patient'
  WHERE p.mobile_number=?`).get(mobile);
if (!row) console.log('No patient account found in this shared platform database. Check that Ayurveda and this app use the same DATA_ROOT.');
else console.log(JSON.stringify({ found: true, healthId: row.health_id.replace(/(91-\\d{4}-)\\d{4}/, '$1****'), patientStatus: row.account_status, loginStatus: row.user_status }, null, 2));
db.close();
