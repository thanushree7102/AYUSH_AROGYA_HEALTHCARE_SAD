// Common Clinical Service (port 5007): encounters (consultations), prescriptions / saved records, uploaded documents.
// Owns services/common-clinical-service/database/clinical.db. Identity + consent come from the Shared Platform
// (/internal/access/check); AYUSH forms live in the five domain services. Cross-service ids (patient_id, doctor code)
// are plain stable ids, never database foreign keys.
try { require('dotenv').config(); } catch (e) { /* optional */ }
process.env.SERVICE_NAME = 'clinical';
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const express = require('express');
const { createService, finish, listen, authenticate, serviceOnly, forbid, invalid, idem } = require('../../../libs/common/http');
const { openDb, uuid, now } = require('../../../libs/common/db');
const { str } = require('../../../libs/common/validate');
const { checkAccess, audit, integrations } = require('../../../libs/common/internal');
const { createEvents } = require('../../../libs/common/events');
const { SERVICES, SYSTEM_NAMES, EVENTS } = require('../../../libs/common/config');
const crypto = require('crypto');

const db = openDb(path.join(__dirname, '..', 'database'), 'clinical.db', 'common-clinical-service');
const STORAGE_DIR = path.resolve(process.env.CLINICAL_STORAGE_DIR || (process.env.DATA_ROOT ? path.join(process.env.DATA_ROOT, 'common-clinical-service', 'storage') : path.join(__dirname, '..', 'storage'))); // private: never served statically
fs.mkdirSync(STORAGE_DIR, { recursive: true });
const events = createEvents('clinical', db);
const ix = idem(db);

db.exec(`
CREATE TABLE IF NOT EXISTS encounters (
  encounter_id TEXT PRIMARY KEY,
  consultation_code TEXT NOT NULL UNIQUE,                 -- C-123456789, the id doctors use in the AYUSH forms
  patient_id TEXT NOT NULL,                               -- Shared Platform id (no cross-database foreign key)
  patient_health_id TEXT,
  doctor_reference_id TEXT, facility_reference_id TEXT,   -- doctor code / facility code (plain ids)
  consultation_datetime TEXT,
  consultation_mode TEXT CHECK (consultation_mode IS NULL OR consultation_mode IN ('In-person','Video','Audio','Chat')),
  reason TEXT, ayush_system TEXT, clinical_notes TEXT, follow_up_date TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Completed','Cancelled','No-show')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prescriptions (
  prescription_id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(encounter_id),
  patient_id TEXT NOT NULL,
  doctor_reference_id TEXT,
  prescription_details TEXT,                               -- JSON array of medicines
  instructions TEXT, issued_at TEXT,
  document_reference TEXT                                  -- private storage key, never a public path
);
CREATE TABLE IF NOT EXISTS patient_records (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  prescription_id TEXT REFERENCES prescriptions(prescription_id),
  document_type TEXT, file_name TEXT, ayush_system TEXT,
  problem TEXT, diagnosis TEXT, prakriti TEXT, saved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_uploads (
  upload_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  file_name TEXT, mime_type TEXT, size INTEGER CHECK (size IS NULL OR size >= 0),
  document_reference TEXT, uploaded_at TEXT NOT NULL,
  ayush_system TEXT NOT NULL DEFAULT 'Ayurveda'
);
CREATE INDEX IF NOT EXISTS ix_enc_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS ix_rx_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS ix_rec_patient ON patient_records(patient_id);
CREATE TABLE IF NOT EXISTS prescription_versions (
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL,
  prescription_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  doctor_id TEXT,
  doctor_name TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(record_id, version_number)
);
CREATE INDEX IF NOT EXISTS ix_rx_versions_record ON prescription_versions(record_id, version_number);
CREATE TABLE IF NOT EXISTS patient_notifications (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  record_id INTEGER,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_patient_notifications ON patient_notifications(patient_id, created_at);
CREATE TABLE IF NOT EXISTS appointments (
  appointment_id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  patient_health_id TEXT,
  patient_name TEXT,
  doctor_reference_id TEXT NOT NULL,
  ayush_system TEXT NOT NULL CHECK (ayush_system IN ('Ayurveda','Yoga & Naturopathy')),
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 10 AND 180),
  consultation_mode TEXT NOT NULL DEFAULT 'In-person' CHECK (consultation_mode IN ('In-person','Video','Audio','Chat')),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Booked' CHECK (status IN ('Booked','Confirmed','Completed','Cancelled','No-show')),
  created_by_role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_appointments_patient ON appointments(patient_id, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_appointments_doctor ON appointments(doctor_reference_id, scheduled_at);
`);

try { db.exec("ALTER TABLE patient_uploads ADD COLUMN ayush_system TEXT NOT NULL DEFAULT 'Ayurveda'"); } catch (e) { /* column already exists */ }

// Seed version 1 for prescriptions created before version history was introduced.
for (const r of db.prepare(`SELECT r.record_id, r.prescription_id, r.problem, r.diagnosis, r.ayush_system, r.document_type,
  p.prescription_details, p.instructions, p.doctor_reference_id, p.issued_at
  FROM patient_records r JOIN prescriptions p ON p.prescription_id=r.prescription_id
  WHERE NOT EXISTS (SELECT 1 FROM prescription_versions v WHERE v.record_id=r.record_id)`).all()) {
  const snapshot = { problem:r.problem || '', diagnosis:r.diagnosis || '', advice:r.instructions || '',
    medicines: JSON.parse(r.prescription_details || '[]'), system:r.ayush_system || 'Ayurveda', documentType:r.document_type };
  db.prepare('INSERT INTO prescription_versions (record_id,prescription_id,version_number,snapshot_json,doctor_id,doctor_name,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(r.record_id,r.prescription_id,1,JSON.stringify(snapshot),r.doctor_reference_id || null,r.doctor_reference_id || 'Existing record',r.issued_at || now());
}

// Backward-compatible migration for appointment patient display name.
try { db.exec('ALTER TABLE appointments ADD COLUMN patient_name TEXT'); } catch (e) { /* column already exists */ }

const rnd = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');
const newCode = () => { for (;;) { const c = `C-${rnd(9)}`; if (!db.prepare('SELECT 1 FROM encounters WHERE consultation_code=?').get(c)) return c; } };
const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const disk = multer({
  storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, STORAGE_DIR), filename: (req, f, cb) => cb(null, `${uuid()}${EXT[f.mimetype] || ''}`) }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, f, cb) => (['application/pdf', 'image/jpeg', 'image/png'].includes(f.mimetype) ? cb(null, true) : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PDF, JPG or PNG files are allowed.'))),
});
const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ---------- data helpers ----------
function ensurePrimary(patientId, healthId) {
  let e = db.prepare('SELECT * FROM encounters WHERE patient_id = ? AND is_primary = 1').get(patientId);
  if (!e) {
    const id = uuid();
    db.prepare(`INSERT INTO encounters (encounter_id,consultation_code,patient_id,patient_health_id,status,is_primary,created_at) VALUES (?,?,?,?, 'Scheduled', 1, ?)`).run(id, newCode(), patientId, healthId || null, now());
    e = db.prepare('SELECT * FROM encounters WHERE encounter_id = ?').get(id);
  }
  return e;
}
const encView = (e) => ({ encounterId: e.encounter_id, consultationId: e.consultation_code, patientId: e.patient_id, healthId: e.patient_health_id, doctorId: e.doctor_reference_id, system: e.ayush_system, mode: e.consultation_mode, reason: e.reason, datetime: e.consultation_datetime, followUpDate: e.follow_up_date, notes: e.clinical_notes, status: e.status });

function createRecord(patientId, healthId, b) {
  const enc = ensurePrimary(patientId, healthId);
  const t = b.date ? `${b.date}T00:00:00.000Z` : now(); const rx = uuid();
  const meds = Array.isArray(b.medicines) ? b.medicines : Array.isArray(b.meds) ? b.meds : [];
  const system = SYSTEM_NAMES.includes(b.system) ? b.system : 'Ayurveda';
  const r = db.transaction(() => {
    db.prepare(`INSERT INTO prescriptions (prescription_id,encounter_id,patient_id,doctor_reference_id,prescription_details,instructions,issued_at) VALUES (?,?,?,?,?,?,?)`)
      .run(rx, enc.encounter_id, patientId, b.doctorId || null, JSON.stringify(meds), b.advice || '', t);
    const rec = db.prepare(`INSERT INTO patient_records (patient_id,prescription_id,document_type,file_name,ayush_system,problem,diagnosis,prakriti,saved_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(patientId, rx, b.documentType || b.docType || null, b.fileName || null, system, b.problem || '', b.diagnosis || '', b.prakriti || '', t);
    const snapshot = { problem: b.problem || '', diagnosis: b.diagnosis || '', advice: b.advice || '', medicines: meds, system, documentType: b.documentType || b.docType || null };
    db.prepare('INSERT INTO prescription_versions (record_id,prescription_id,version_number,snapshot_json,doctor_id,doctor_name,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(rec.lastInsertRowid, rx, 1, JSON.stringify(snapshot), b.doctorId || null, b.doctorName || null, t);
    return rec;
  })();
  const recordId = `R-${r.lastInsertRowid}`;
  events.publish(EVENTS.RECORD_CREATED, patientId, { patientId, healthId, recordId, encounterId: enc.encounter_id, consultationCode: enc.consultation_code, system, problem: b.problem || '', diagnosis: b.diagnosis || '', medicines: meds, savedAt: t });
  return recordId;
}
function recordsOf(patientId) {
  return db.prepare(`SELECT r.record_id, r.saved_at, r.document_type, r.file_name, r.ayush_system, r.problem, r.diagnosis, r.prakriti, x.prescription_details, x.instructions
    FROM patient_records r LEFT JOIN prescriptions x ON x.prescription_id = r.prescription_id WHERE r.patient_id = ? ORDER BY r.record_id`).all(patientId).map((r) => ({
    recordId: `R-${r.record_id}`, id: r.record_id, savedAt: r.saved_at, documentType: r.document_type, fileName: r.file_name, system: r.ayush_system, problem: r.problem, diagnosis: r.diagnosis, prakriti: r.prakriti,
    medicines: JSON.parse(r.prescription_details || '[]'), advice: r.instructions || '',
  }));
}
const uploadsOf = (patientId) => db.prepare('SELECT * FROM patient_uploads WHERE patient_id = ? ORDER BY upload_id').all(patientId)
  .map((u) => ({ uploadId: `U-${u.upload_id}`, id: u.upload_id, fileName: u.file_name, documentType: u.mime_type, size: u.size, system: u.ayush_system || 'Ayurveda', uploadedAt: u.uploaded_at, savedAt: u.uploaded_at }));
const purge = (patientId) => db.transaction(() => {
  for (const f of db.prepare('SELECT document_reference r FROM patient_uploads WHERE patient_id = ?').all(patientId)) { try { fs.unlinkSync(path.join(STORAGE_DIR, path.basename(f.r))); } catch (e) { /* already gone */ } }
  db.prepare('DELETE FROM patient_notifications WHERE patient_id = ?').run(patientId);
  db.prepare('DELETE FROM prescription_versions WHERE record_id IN (SELECT record_id FROM patient_records WHERE patient_id = ?)').run(patientId);
  db.prepare('DELETE FROM patient_records WHERE patient_id = ?').run(patientId);
  db.prepare('DELETE FROM prescriptions WHERE patient_id = ?').run(patientId);
  db.prepare('DELETE FROM patient_uploads WHERE patient_id = ?').run(patientId);
  db.prepare('DELETE FROM encounters WHERE patient_id = ?').run(patientId);
})();

// Ask the Shared Platform; send the right HTTP answer when access is refused.
async function guard(req, res, patient, system, mode) {
  const a = await checkAccess(req, { patient, system, mode });
  if (a.unavailable) { res.status(503).json({ message: 'Identity service is not available right now. Please retry.' }); return null; }
  if (!a.allowed) { res.status(a.status === 404 ? 404 : 403).json({ message: a.reason || 'Not allowed.' }); return null; }
  return a;
}
const resolveRef = (ref) => { const m = /^C-\d+$/.test(String(ref)) && db.prepare('SELECT patient_id FROM encounters WHERE consultation_code = ?').get(ref); return m ? m.patient_id : ref; };

const app = createService('clinical', { jsonLimit: '20mb' });

// ================= encounters =================
app.post('/encounters', authenticate, async (req, res) => {
  const b = req.body || {};
  const system = str(b.ayushSystem) || null;
  if (system && !SYSTEM_NAMES.includes(system)) return invalid(res, { ayushSystem: 'Choose a valid AYUSH system' });
  if (b.mode && !['In-person', 'Video', 'Audio', 'Chat'].includes(b.mode)) return invalid(res, { mode: 'Choose a valid mode' });
  const a = await guard(req, res, resolveRef(b.patientId), system, 'write'); if (!a) return;
  const key = req.get('Idempotency-Key'); const prev = ix.get(key, 'encounters');
  if (prev) return res.status(prev.status).json(JSON.parse(prev.response));
  const p = a.patient; const id = uuid(); const code = newCode();
  ensurePrimary(p.patientId, p.healthId);
  db.prepare(`INSERT INTO encounters (encounter_id,consultation_code,patient_id,patient_health_id,doctor_reference_id,consultation_datetime,consultation_mode,reason,ayush_system,follow_up_date,status,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?, 'Scheduled', ?)`).run(id, code, p.patientId, p.healthId, req.user.role === 'practitioner' ? req.user.code : null, str(b.datetime) || now(), b.mode || null, str(b.reason), system, str(b.followUpDate), now());
  events.publish(EVENTS.ENCOUNTER_CREATED, p.patientId, { patientId: p.patientId, encounterId: id, consultationCode: code, system, reason: str(b.reason), doctor: req.user.role === 'practitioner' ? req.user.code : null, at: now() });
  const out = { encounterId: id, consultationId: code, status: 'Scheduled' };
  ix.set(key, 'encounters', 201, out);
  res.status(201).json(out);
});
app.get('/encounters', authenticate, async (req, res) => {
  const ref = resolveRef(req.query.patient);
  const a = await guard(req, res, ref, null, 'read'); if (!a) return;
  const list = db.prepare('SELECT * FROM encounters WHERE patient_id = ? ORDER BY created_at').all(a.patient.patientId)
    .filter((e) => !a.systems || !e.ayush_system || a.systems.includes(e.ayush_system)).map(encView);
  res.json(list);
});
app.get('/encounters/:code', authenticate, async (req, res) => {
  const e = db.prepare('SELECT * FROM encounters WHERE consultation_code = ?').get(req.params.code);
  if (!e) return res.status(404).json({ message: 'Consultation not found.' });
  const a = await guard(req, res, e.patient_id, e.ayush_system, 'read'); if (!a) return;
  res.json(encView(e));
});
app.patch('/encounters/:code', authenticate, async (req, res) => {
  if (req.user.role !== 'practitioner') return forbid(res, 'Only a practitioner can update a consultation.');
  const e = db.prepare('SELECT * FROM encounters WHERE consultation_code = ?').get(req.params.code);
  if (!e) return res.status(404).json({ message: 'Consultation not found.' });
  const a = await guard(req, res, e.patient_id, e.ayush_system, 'write'); if (!a) return;
  const b = req.body || {};
  if (b.status && !['Scheduled', 'Completed', 'Cancelled', 'No-show'].includes(b.status)) return invalid(res, { status: 'Choose a valid status' });
  db.prepare('UPDATE encounters SET status = COALESCE(?, status), clinical_notes = COALESCE(?, clinical_notes), follow_up_date = COALESCE(?, follow_up_date), doctor_reference_id = ? WHERE encounter_id = ?')
    .run(b.status || null, str(b.notes), str(b.followUpDate), req.user.code, e.encounter_id);
  audit(req, { action: 'ENCOUNTER_UPDATED', type: 'encounter', ref: e.encounter_id, reason: b.status || null });
  res.json(encView(db.prepare('SELECT * FROM encounters WHERE encounter_id = ?').get(e.encounter_id)));
});

// ================= appointment management =================
// Appointments are shared clinical workflow records. Patient visibility is consent-checked;
// practitioners can only manage appointments assigned to their own verified doctor code.
const appointmentView = (a) => ({
  appointmentId: a.appointment_id, patientId: a.patient_id, patientName: a.patient_name || null, healthId: a.patient_health_id,
  doctorId: a.doctor_reference_id, system: a.ayush_system, scheduledAt: a.scheduled_at,
  durationMinutes: a.duration_minutes, mode: a.consultation_mode, reason: a.reason,
  status: a.status, createdAt: a.created_at, updatedAt: a.updated_at,
});
const APPOINTMENT_STATUSES = ['Booked', 'Confirmed', 'Completed', 'Cancelled', 'No-show'];
const APPOINTMENT_MODES = ['In-person', 'Video', 'Audio', 'Chat'];
const validDateTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);

app.post('/appointments', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!['patient', 'practitioner'].includes(req.user.role)) return forbid(res);
  if (!b.patientId || !b.doctorId || !validDateTime(b.scheduledAt)) return invalid(res, { patientId: 'Patient is required', doctorId: 'Doctor is required', scheduledAt: 'Provide a valid ISO date/time' });
  if (!SYSTEM_NAMES.includes(b.system)) return invalid(res, { system: `Choose the AYUSH system supported by this application: ${SYSTEM_NAMES.join(', ')}` });
  if (b.mode && !APPOINTMENT_MODES.includes(b.mode)) return invalid(res, { mode: 'Choose a valid consultation mode' });
  const duration = Number(b.durationMinutes || 30);
  if (!Number.isInteger(duration) || duration < 10 || duration > 180) return invalid(res, { durationMinutes: 'Duration must be 10–180 minutes' });
  if (req.user.role === 'practitioner' && req.user.code !== b.doctorId) return forbid(res, 'Practitioners can only book appointments under their own doctor account.');
  const a = await guard(req, res, resolveRef(b.patientId), b.system, 'write'); if (!a) return;
  const doctor = String(b.doctorId).trim();
  const slot = new Date(b.scheduledAt).toISOString();
  const conflict = db.prepare(`SELECT 1 FROM appointments WHERE doctor_reference_id=? AND scheduled_at=? AND status NOT IN ('Cancelled','No-show')`).get(doctor, slot);
  if (conflict) return res.status(409).json({ message: 'This doctor already has an appointment at that time. Please choose another slot.' });
  const id = uuid(); const t = now();
  db.prepare(`INSERT INTO appointments (appointment_id,patient_id,patient_health_id,patient_name,doctor_reference_id,ayush_system,scheduled_at,duration_minutes,consultation_mode,reason,status,created_by_role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'Booked',?,?,?)`)
    .run(id, a.patient.patientId, a.patient.healthId || null, a.patient.name || a.patient.fullName || null, doctor, b.system, slot, duration, b.mode || 'In-person', str(b.reason), req.user.role, t, t);
  audit(req, { action: 'APPOINTMENT_BOOKED', type: 'appointment', ref: id, reason: b.system });
  res.status(201).json(appointmentView(db.prepare('SELECT * FROM appointments WHERE appointment_id=?').get(id)));
});

app.get('/patients/:id/appointments', authenticate, async (req, res) => {
  const a = await guard(req, res, resolveRef(req.params.id), null, 'read'); if (!a) return;
  const rows = db.prepare('SELECT * FROM appointments WHERE patient_id=? ORDER BY scheduled_at DESC').all(a.patient.patientId)
    .filter((x) => !a.systems || a.systems.includes(x.ayush_system));
  res.json({ appointments: rows.map(appointmentView), restricted: !!a.systems });
});

app.get('/doctors/:doctorId/appointments', authenticate, async (req, res) => {
  if (req.user.role !== 'practitioner' || req.user.code !== req.params.doctorId) return forbid(res, 'You can only view your own appointments.');
  // Appointment requests expose only the minimum booking details to the assigned doctor.
  // Clinical records remain separately protected by patient consent in their own endpoints.
  const rows = db.prepare('SELECT * FROM appointments WHERE doctor_reference_id=? ORDER BY scheduled_at').all(req.params.doctorId);
  res.json({ appointments: rows.map(appointmentView) });
});

app.patch('/appointments/:id', authenticate, async (req, res) => {
  const row = db.prepare('SELECT * FROM appointments WHERE appointment_id=?').get(req.params.id);
  if (!row) return res.status(404).json({ message: 'Appointment not found.' });
  const isPatient = req.user.role === 'patient';
  const isDoctor = req.user.role === 'practitioner' && req.user.code === row.doctor_reference_id;
  if (!isPatient && !isDoctor) return forbid(res, 'You cannot update this appointment.');
  // Appointment management is separate from clinical-record consent. The assigned doctor may
  // confirm/decline their booking; a patient may update only their own booking.
  if (isPatient && req.user.profileId !== row.patient_id) return forbid(res, 'You can only update your own appointment.');
  const b = req.body || {};
  if (b.status && !APPOINTMENT_STATUSES.includes(b.status)) return invalid(res, { status: 'Choose a valid appointment status' });
  if (b.scheduledAt !== undefined && !validDateTime(b.scheduledAt)) return invalid(res, { scheduledAt: 'Provide a valid ISO date/time' });
  if (b.mode && !APPOINTMENT_MODES.includes(b.mode)) return invalid(res, { mode: 'Choose a valid consultation mode' });
  if (isPatient && b.status && b.status !== 'Cancelled') return forbid(res, 'Patients may only cancel their own appointment.');
  if (isPatient && row.status === 'Completed') return res.status(409).json({ message: 'Completed appointments cannot be changed.' });
  const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt).toISOString() : row.scheduled_at;
  if (scheduledAt !== row.scheduled_at && row.status !== 'Cancelled') {
    const conflict = db.prepare(`SELECT 1 FROM appointments WHERE doctor_reference_id=? AND scheduled_at=? AND appointment_id<>? AND status NOT IN ('Cancelled','No-show')`).get(row.doctor_reference_id, scheduledAt, row.appointment_id);
    if (conflict) return res.status(409).json({ message: 'This doctor already has an appointment at that time.' });
  }
  const duration = b.durationMinutes === undefined ? row.duration_minutes : Number(b.durationMinutes);
  if (!Number.isInteger(duration) || duration < 10 || duration > 180) return invalid(res, { durationMinutes: 'Duration must be 10–180 minutes' });
  const status = b.status || row.status;
  db.prepare('UPDATE appointments SET scheduled_at=?, duration_minutes=?, consultation_mode=?, reason=?, status=?, updated_at=? WHERE appointment_id=?')
    .run(scheduledAt, duration, b.mode || row.consultation_mode, b.reason === undefined ? row.reason : str(b.reason), status, now(), row.appointment_id);
  audit(req, { action: status === 'Cancelled' ? 'APPOINTMENT_CANCELLED' : 'APPOINTMENT_UPDATED', type: 'appointment', ref: row.appointment_id, reason: status });
  res.json(appointmentView(db.prepare('SELECT * FROM appointments WHERE appointment_id=?').get(row.appointment_id)));
});

// ================= records / uploads =================
// Reads a prescription / report photo and returns a DRAFT the patient checks before saving (the reader lives in Integrations).
app.post('/records/extract', authenticate, mem.single('file'), async (req, res) => {
  if (!['patient', 'practitioner'].includes(req.user.role)) return forbid(res);
  if (!req.file) return res.status(400).json({ message: 'No file received.' });
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(req.file.mimetype)) return res.status(400).json({ message: 'Only JPG, PNG or PDF files are allowed.' });
  const r = await integrations.post('/internal/reader/read', { mime: req.file.mimetype, base64: req.file.buffer.toString('base64') }, { timeout: 90000, requestId: req.id });
  if (!r.ok) return res.status(r.status === 503 ? 503 : 500).json({ message: r.status === 503 ? 'The document reader is not available right now.' : 'Could not read the file.' });
  const ex = r.data.ex; const raw = r.data.raw || '';
  const ai = ex._engine === 'AI vision';
  const prak = ['vata', 'pitta', 'kapha'].filter((x) => new RegExp(`\\b${x}\\b`, 'i').test((ex.findings && ex.findings.Prakriti) || raw)).map((x) => x[0].toUpperCase() + x.slice(1)).join('-');
  const sys = ex.system === 'ayurveda' ? 'Ayurveda' : 'Ayurveda';
  let note = ai ? '' : 'Read with the offline English OCR reader. Handwriting and Hindi may be missed. AI vision is not configured on this server; add ANTHROPIC_API_KEY to .env to enable it. Please verify every field before saving.';
  if (!ai && ex._note && /PDF/.test(ex._note)) note = ex._note;
  res.json({
    documentType: (req.body && req.body.documentType) || 'Prescription', system: sys, problem: ex.complaint || '', diagnosis: ex.diagnosis || '', prakriti: prak,
    medicines: (ex.medicines || []).map((m) => ({ name: m.name || '', dose: m.dose || '', timing: m.freq || (m.extra && m.extra.Kala) || '', duration: m.duration || '' })), advice: ex.advice || '', readWithAi: ai, note,
  });
});

app.post('/records', authenticate, async (req, res) => {
  const b = req.body || {};
  const system = SYSTEM_NAMES.includes(b.system) ? b.system : 'Ayurveda';
  const a = await guard(req, res, resolveRef(b.healthId), system, 'write'); if (!a) return;
  const key = req.get('Idempotency-Key'); const prev = ix.get(key, 'records');
  if (prev) return res.status(prev.status).json(JSON.parse(prev.response));
  const recordId = createRecord(a.patient.patientId, a.patient.healthId, { ...b, system, doctorId: req.user.role === 'practitioner' ? req.user.code : null, doctorName: req.user.role === 'practitioner' ? req.user.name : null });
  const out = { recordId };
  ix.set(key, 'records', 201, out);
  res.status(201).json(out);
});
app.get('/patients/:id/records', authenticate, async (req, res) => {
  const a = await guard(req, res, resolveRef(req.params.id), null, 'read'); if (!a) return;
  res.json({ records: recordsOf(a.patient.patientId).filter((r) => !a.systems || a.systems.includes(r.system)), uploads: uploadsOf(a.patient.patientId).filter(u => !a.systems || a.systems.includes(u.system)) });
});

// Doctor updates are versioned; patients see immutable history and an in-app notification.
app.patch('/records/:recordId', authenticate, async (req, res) => {
  if (req.user.role !== 'practitioner') return forbid(res, 'Only the treating doctor can update a prescription.');
  const n = Number(String(req.params.recordId).replace(/^R-/, ''));
  if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ message: 'Invalid record ID.' });
  const row = db.prepare(`SELECT r.*, p.prescription_id, p.prescription_details, p.instructions, p.doctor_reference_id
    FROM patient_records r JOIN prescriptions p ON p.prescription_id=r.prescription_id WHERE r.record_id=?`).get(n);
  if (!row) return res.status(404).json({ message: 'Prescription record not found.' });
  const a = await guard(req, res, row.patient_id, row.ayush_system || 'Ayurveda', 'write'); if (!a) return;
  const b = req.body || {};
  const medicines = Array.isArray(b.medicines) ? b.medicines.filter(m => m && String(m.name || '').trim()).map(m => ({
    name: str(m.name), dose: str(m.dose), timing: str(m.timing), duration: str(m.duration)
  })) : null;
  if (!medicines) return invalid(res, { medicines: 'Provide a medicines array.' });
  const t = now();
  const current = db.prepare('SELECT COALESCE(MAX(version_number),0) n FROM prescription_versions WHERE record_id=?').get(n).n;
  const version = current + 1;
  const snapshot = { problem: str(b.problem), diagnosis: str(b.diagnosis), advice: str(b.advice), medicines, system: row.ayush_system || 'Ayurveda', documentType: row.document_type };
  db.transaction(() => {
    db.prepare('UPDATE prescriptions SET prescription_details=?, instructions=?, doctor_reference_id=?, issued_at=? WHERE prescription_id=?')
      .run(JSON.stringify(medicines), snapshot.advice, req.user.code, t, row.prescription_id);
    db.prepare('UPDATE patient_records SET problem=?, diagnosis=?, saved_at=? WHERE record_id=?')
      .run(snapshot.problem, snapshot.diagnosis, t, n);
    db.prepare('INSERT INTO prescription_versions (record_id,prescription_id,version_number,snapshot_json,doctor_id,doctor_name,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(n, row.prescription_id, version, JSON.stringify(snapshot), req.user.code, req.user.name || req.user.code, t);
    db.prepare('INSERT INTO patient_notifications (patient_id,notification_type,title,message,record_id,created_at) VALUES (?,?,?,?,?,?)')
      .run(row.patient_id, 'PRESCRIPTION_UPDATED', 'Prescription updated', `Your Ayurveda prescription was updated by ${req.user.name || req.user.code}. Version ${version} is available.`, n, t);
  })();
  audit(req, { action: 'PRESCRIPTION_UPDATED', type: 'record', ref: `R-${n}`, reason: `version ${version}` });
  res.json({ recordId: `R-${n}`, version, updatedAt: t, doctorId: req.user.code, doctorName: req.user.name || req.user.code });
});

app.get('/records/:recordId/versions', authenticate, async (req, res) => {
  const n = Number(String(req.params.recordId).replace(/^R-/, ''));
  const row = db.prepare('SELECT patient_id, ayush_system FROM patient_records WHERE record_id=?').get(n);
  if (!row) return res.status(404).json({ message: 'Record not found.' });
  const a = await guard(req, res, row.patient_id, row.ayush_system || 'Ayurveda', 'read'); if (!a) return;
  const versions = db.prepare('SELECT version_number, snapshot_json, doctor_id, doctor_name, updated_at FROM prescription_versions WHERE record_id=? ORDER BY version_number DESC').all(n)
    .map(v => ({ version: v.version_number, ...JSON.parse(v.snapshot_json), doctorId: v.doctor_id, doctorName: v.doctor_name, updatedAt: v.updated_at }));
  res.json({ versions });
});

app.get('/patients/:id/notifications', authenticate, async (req, res) => {
  const a = await guard(req, res, resolveRef(req.params.id), null, 'read'); if (!a) return;
  if (req.user.role !== 'patient' || req.user.profileId !== a.patient.patientId) return forbid(res, 'Only the patient can view their notifications.');
  const items = db.prepare('SELECT * FROM patient_notifications WHERE patient_id=? ORDER BY created_at DESC LIMIT 100').all(a.patient.patientId)
    .map(x => ({ id:x.notification_id, type:x.notification_type, title:x.title, message:x.message, recordId:x.record_id ? `R-${x.record_id}` : null, createdAt:x.created_at, readAt:x.read_at }));
  res.json({ notifications: items, unread: items.filter(x => !x.readAt).length });
});
app.patch('/notifications/:id/read', authenticate, async (req, res) => {
  if (req.user.role !== 'patient') return forbid(res);
  const item = db.prepare('SELECT * FROM patient_notifications WHERE notification_id=?').get(Number(req.params.id));
  if (!item || item.patient_id !== req.user.profileId) return res.status(404).json({ message: 'Notification not found.' });
  db.prepare('UPDATE patient_notifications SET read_at=? WHERE notification_id=?').run(now(), item.notification_id);
  res.json({ read: true });
});

app.get('/uploads/:uploadId/file', authenticate, async (req, res) => {
  const id = Number(req.params.uploadId);
  const row = db.prepare('SELECT * FROM patient_uploads WHERE upload_id=?').get(id);
  if (!row) return res.status(404).json({ message: 'Uploaded report not found.' });
  const a = await guard(req, res, row.patient_id, row.ayush_system || 'Ayurveda', 'read'); if (!a) return;
  const file = path.resolve(STORAGE_DIR, path.basename(row.document_reference || ''));
  if (!file.startsWith(STORAGE_DIR + path.sep) || !fs.existsSync(file)) return res.status(404).json({ message: 'Original file is unavailable.' });
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.file_name || 'patient-report')}`);
  fs.createReadStream(file).pipe(res);
});

app.post('/patients/:id/prescriptions', authenticate, disk.single('file'), async (req, res) => {
  const drop = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  const a = await guard(req, res, resolveRef(req.params.id), null, 'write'); if (!a) return drop();
  if (!req.file) return res.status(400).json({ message: 'No file received.' });
  const r = db.prepare('INSERT INTO patient_uploads (patient_id,file_name,mime_type,size,document_reference,uploaded_at) VALUES (?,?,?,?,?,?)')
    .run(a.patient.patientId, req.file.originalname, req.file.mimetype, req.file.size, req.file.filename, now());
  res.status(201).json({ uploadId: `U-${r.lastInsertRowid}`, fileName: req.file.originalname });
});

// ================= internal (other services only) =================
const internal = express.Router();
internal.use(serviceOnly);
internal.post('/encounters/ensure', (req, res) => {
  const { patientId, healthId } = req.body || {};
  if (!patientId) return res.status(400).json({ message: 'patientId is required.' });
  const e = ensurePrimary(patientId, healthId);
  res.json({ encounterId: e.encounter_id, consultationId: e.consultation_code });
});
internal.get('/encounters/by-code/:code', (req, res) => {
  const e = db.prepare('SELECT * FROM encounters WHERE consultation_code = ?').get(req.params.code);
  return e ? res.json(encView(e)) : res.status(404).json({ message: 'Consultation not found.' });
});
internal.get('/patients/:pid/records', (req, res) => {
  const e = db.prepare('SELECT consultation_code c FROM encounters WHERE patient_id = ? AND is_primary = 1').get(req.params.pid);
  res.json({ consultationId: e ? e.c : null, records: recordsOf(req.params.pid), uploads: uploadsOf(req.params.pid) });
});
internal.post('/records', (req, res) => {
  const { patientId, healthId, record } = req.body || {};
  if (!patientId || !record) return res.status(400).json({ message: 'patientId and record are required.' });
  res.status(201).json({ recordId: createRecord(patientId, healthId, record) });
});
internal.post('/uploads', (req, res) => {
  const { patientId, fileName, mime, base64 } = req.body || {};
  if (!patientId || !EXT[mime] || !base64) return res.status(400).json({ message: 'patientId, mime and base64 are required.' });
  const buf = Buffer.from(base64, 'base64'); const file = `${uuid()}${EXT[mime]}`;
  fs.writeFileSync(path.join(STORAGE_DIR, file), buf);
  const r = db.prepare('INSERT INTO patient_uploads (patient_id,file_name,mime_type,size,document_reference,uploaded_at) VALUES (?,?,?,?,?,?)').run(patientId, fileName || `upload${EXT[mime]}`, mime, buf.length, file, now());
  res.status(201).json({ uploadId: r.lastInsertRowid });
});
internal.get('/patients/:pid/uploads/count', (req, res) => res.json({ n: db.prepare('SELECT COUNT(*) n FROM patient_uploads WHERE patient_id = ?').get(req.params.pid).n }));
internal.delete('/patients/:pid', (req, res) => { purge(req.params.pid); res.json({ deleted: true }); });
internal.post('/events', events.handler(async (e) => {
  const d = e.data || {};
  if (e.type === EVENTS.PATIENT_CREATED) ensurePrimary(d.patientId, d.healthId);
  else if (e.type === EVENTS.PATIENT_DELETED) purge(d.patientId);
  else if (e.type === EVENTS.ASSESSMENT_SAVED && d.consultationCode) { // the doctor who saved a form and the diagnosis note appear on the encounter
    db.prepare('UPDATE encounters SET doctor_reference_id = COALESCE(?, doctor_reference_id), ayush_system = COALESCE(ayush_system, ?), clinical_notes = COALESCE(?, clinical_notes) WHERE consultation_code = ?')
      .run(d.doctor || null, d.system || null, d.diagnosisNote || null, d.consultationCode);
  }
}));
app.use('/internal', internal);

finish(app, 'clinical');
listen(app, 'clinical');
events.subscribe('clinical', `${SERVICES.clinical.url}/internal/events`, [EVENTS.PATIENT_CREATED, EVENTS.PATIENT_DELETED, EVENTS.ASSESSMENT_SAVED]);
