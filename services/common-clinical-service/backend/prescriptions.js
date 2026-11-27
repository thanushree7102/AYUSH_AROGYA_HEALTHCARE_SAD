// Common Clinical Service: prescription editing by doctors, version history, downloads, doctor-visit tracking.
// Added as its own module so server.js only gets a few small hook calls. Everything here lives in clinical.db
// (the clinical service's OWN database); doctor names are stored as snapshots so nothing here needs the Shared Platform
// to be up (access checks are the only platform dependency, exactly like every other clinical endpoint).
//
// Public API (through the gateway, /v1/records/...):
//   GET  /records/:recordId/prescription                  current prescription + full version history
//   PUT  /records/:recordId/prescription                  doctor edit (add / change / remove medicines, advice, problem, diagnosis)
//   GET  /records/:recordId/prescription/download         PDF of the latest (or ?version=N) prescription
//   GET  /records/:recordId/file                          the ORIGINAL file the patient uploaded for this record
//   GET  /records/uploads/:uploadId/download              an uploaded file by id (own file, or a doctor with full consent)
// Internal (service token only):
//   GET  /internal/patients/:pid/visit-data               visits + prescriptions with versions, for the Longitudinal service
const fs = require('fs');
const path = require('path');
const { authenticate, forbid, invalid } = require('../../../libs/common/http');
const { uuid, now } = require('../../../libs/common/db');
const { audit } = require('../../../libs/common/internal');
const { EVENTS } = require('../../../libs/common/config');

const FIELD_MAX = { name: 120, dose: 80, timing: 80, duration: 80 };
const MAX_MEDICINES = 50;
const MIME_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const clip = (v) => String(v === undefined || v === null ? '' : v).trim();
const ridNum = (rid) => { const m = /^R-(\d+)$/.exec(String(rid)); return m ? Number(m[1]) : null; };
const uidNum = (uid) => { const m = /^U-?(\d+)$/.exec(String(uid)); return m ? Number(m[1]) : null; };

module.exports = function create({ db, STORAGE_DIR, events, guard }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS prescription_versions (
  version_id TEXT PRIMARY KEY,
  prescription_id TEXT NOT NULL REFERENCES prescriptions(prescription_id),
  version_no INTEGER NOT NULL,                              -- 1 = the original, exactly as it was first saved
  medicines TEXT NOT NULL,                                  -- JSON snapshot
  instructions TEXT, problem TEXT, diagnosis TEXT,
  changed_by_role TEXT NOT NULL CHECK (changed_by_role IN ('patient','practitioner','system')),
  changed_by_code TEXT, changed_by_name TEXT,               -- doctor code + name AT THE TIME (snapshot, no cross-service join)
  change_note TEXT, change_summary TEXT, created_at TEXT NOT NULL,
  UNIQUE (prescription_id, version_no)
);
CREATE TABLE IF NOT EXISTS prescription_files (            -- which uploaded file belongs to which saved prescription
  prescription_id TEXT PRIMARY KEY REFERENCES prescriptions(prescription_id),
  upload_id INTEGER NOT NULL REFERENCES patient_uploads(upload_id), linked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS doctor_visits (                 -- one row per patient + doctor + day + AYUSH system
  visit_id TEXT PRIMARY KEY, patient_id TEXT NOT NULL,
  doctor_code TEXT NOT NULL, doctor_name TEXT,              -- plain ids, never a foreign key into the Shared Platform
  ayush_system TEXT NOT NULL DEFAULT '', consultation_code TEXT,
  visit_date TEXT NOT NULL, activity TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (patient_id, doctor_code, visit_date, ayush_system)
);
CREATE INDEX IF NOT EXISTS ix_visit_patient ON doctor_visits(patient_id, visit_date);
`);

  // Backward-compatible migration for older shared clinical.db schemas.
  // Add missing columns in-place; never drop or recreate existing patient data.
  function ensureColumn(table, column, declaration) {
    const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    if (!columns.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
  const versionColumns = [
    ['version_id', 'TEXT'],
    ['prescription_id', 'TEXT'],
    ['version_no', 'INTEGER'],
    ['medicines', "TEXT NOT NULL DEFAULT '[]'"],
    ['instructions', "TEXT DEFAULT ''"],
    ['problem', "TEXT DEFAULT ''"],
    ['diagnosis', "TEXT DEFAULT ''"],
    ['changed_by_role', "TEXT NOT NULL DEFAULT 'system'"],
    ['changed_by_code', 'TEXT'],
    ['changed_by_name', 'TEXT'],
    ['change_note', 'TEXT'],
    ['change_summary', 'TEXT'],
    ['created_at', 'TEXT'],
  ];
  for (const [column, declaration] of versionColumns) {
    ensureColumn('prescription_versions', column, declaration);
  }
  // Older databases may not have created_at; populate it before ordering versions.
  db.prepare("UPDATE prescription_versions SET created_at = COALESCE(NULLIF(created_at,''), ?) WHERE created_at IS NULL OR created_at = ''").run(now());
  const missingVersionIds = db.prepare('SELECT rowid FROM prescription_versions WHERE version_id IS NULL OR version_id = ?').all('');
  const setVersionId = db.prepare('UPDATE prescription_versions SET version_id = ? WHERE rowid = ?');
  for (const row of missingVersionIds) setVersionId.run(uuid(), row.rowid);
  // Assign stable, increasing version numbers to historical rows that did not have them.
  const oldVersions = db.prepare(
    'SELECT rowid, prescription_id FROM prescription_versions WHERE version_no IS NULL OR version_no < 1 ORDER BY prescription_id, created_at, rowid'
  ).all();
  const groups = db.prepare('SELECT prescription_id, MAX(version_no) AS max_version FROM prescription_versions WHERE version_no IS NOT NULL GROUP BY prescription_id').all();
  const maxVersions = new Map(groups.map((r) => [r.prescription_id, Number(r.max_version) || 0]));
  const setVersion = db.prepare('UPDATE prescription_versions SET version_no = ? WHERE rowid = ?');
  for (const row of oldVersions) {
    const next = (maxVersions.get(row.prescription_id) || 0) + 1;
    maxVersions.set(row.prescription_id, next);
    setVersion.run(next, row.rowid);
  }
  db.exec('CREATE INDEX IF NOT EXISTS ix_pxv_rx ON prescription_versions(prescription_id, version_no)');

  // ---------- doctor visits ----------
  const upsertVisit = db.prepare(`INSERT INTO doctor_visits (visit_id,patient_id,doctor_code,doctor_name,ayush_system,consultation_code,visit_date,activity,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(patient_id, doctor_code, visit_date, ayush_system) DO UPDATE SET
      doctor_name = COALESCE(excluded.doctor_name, doctor_name),
      consultation_code = COALESCE(consultation_code, excluded.consultation_code),
      activity = CASE WHEN instr(activity, excluded.activity) = 0 THEN activity || ', ' || excluded.activity ELSE activity END`);
  function recordVisit({ patientId, doctorCode, doctorName = null, system = '', consultationCode = null, activity, at }) {
    if (!patientId || !doctorCode) return;
    const t = at || now();
    upsertVisit.run(uuid(), patientId, doctorCode, doctorName || null, system || '', consultationCode || null, String(t).slice(0, 10), activity, now());
  }
  // existing data: doctors who already worked on a patient's encounter or issued a record before this feature existed
  db.transaction(() => {
    for (const e of db.prepare(`SELECT * FROM encounters WHERE doctor_reference_id IS NOT NULL`).all()) {
      recordVisit({ patientId: e.patient_id, doctorCode: e.doctor_reference_id, system: e.ayush_system, consultationCode: e.consultation_code, activity: 'Consultation', at: e.consultation_datetime || e.created_at });
    }
    for (const x of db.prepare(`SELECT x.*, r.ayush_system s FROM prescriptions x LEFT JOIN patient_records r ON r.prescription_id = x.prescription_id WHERE x.doctor_reference_id IS NOT NULL`).all()) {
      recordVisit({ patientId: x.patient_id, doctorCode: x.doctor_reference_id, system: x.s, activity: 'Prescription issued', at: x.issued_at });
    }
  })();

  // ---------- version 1 = the original ----------
  const insertVersion = db.prepare(`INSERT INTO prescription_versions (version_id,prescription_id,version_no,medicines,instructions,problem,diagnosis,changed_by_role,changed_by_code,changed_by_name,change_note,change_summary,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  function snapshotOriginal(prescriptionId, { meds, advice, problem, diagnosis, doctorCode, doctorName, at }) {
    insertVersion.run(uuid(), prescriptionId, 1, JSON.stringify(meds || []), advice || '', problem || '', diagnosis || '', doctorCode ? 'practitioner' : 'patient', doctorCode || null, doctorName || null, null, 'Original', at || now());
  }
  db.transaction(() => { // prescriptions saved before this feature existed get their v1 now
    const missing = db.prepare(`SELECT x.*, r.problem, r.diagnosis FROM prescriptions x LEFT JOIN patient_records r ON r.prescription_id = x.prescription_id
      WHERE NOT EXISTS (SELECT 1 FROM prescription_versions v WHERE v.prescription_id = x.prescription_id)`).all();
    for (const x of missing) snapshotOriginal(x.prescription_id, { meds: JSON.parse(x.prescription_details || '[]'), advice: x.instructions, problem: x.problem, diagnosis: x.diagnosis, doctorCode: x.doctor_reference_id, at: x.issued_at });
  })();

  // ---------- link the saved prescription to the file the patient uploaded ----------
  function linkFile(prescriptionId, patientId, { uploadId, fileName, oldestFirst = false }) {
    let up = null;
    const n = uploadId == null ? null : uidNum(uploadId) || (Number.isInteger(Number(uploadId)) ? Number(uploadId) : null);
    if (n) up = db.prepare('SELECT * FROM patient_uploads WHERE upload_id = ? AND patient_id = ?').get(n, patientId);
    if (!up && fileName) { // older clients: newest upload of this patient with the same file name that is not linked yet
      up = db.prepare(`SELECT u.* FROM patient_uploads u WHERE u.patient_id = ? AND u.file_name = ? AND NOT EXISTS (SELECT 1 FROM prescription_files f WHERE f.upload_id = u.upload_id) ORDER BY u.upload_id ${oldestFirst ? 'ASC' : 'DESC'} LIMIT 1`).get(patientId, fileName);
    }
    if (up) db.prepare('INSERT OR IGNORE INTO prescription_files (prescription_id,upload_id,linked_at) VALUES (?,?,?)').run(prescriptionId, up.upload_id, now());
  }
  db.transaction(() => { // records saved before this feature: pair them with the upload of the same name, in the order they were saved
    const todo = db.prepare(`SELECT r.patient_id, r.prescription_id, r.file_name FROM patient_records r WHERE r.file_name IS NOT NULL AND r.prescription_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM prescription_files f WHERE f.prescription_id = r.prescription_id) ORDER BY r.record_id`).all();
    for (const r of todo) linkFile(r.prescription_id, r.patient_id, { fileName: r.file_name, oldestFirst: true });
  })();
  // called from createRecord(), inside its transaction
  function onRecordCreated({ prescriptionId, patientId, meds, advice, problem, diagnosis, doctorCode, doctorName, system, consultationCode, at, uploadId, fileName }) {
    snapshotOriginal(prescriptionId, { meds, advice, problem, diagnosis, doctorCode, doctorName, at });
    linkFile(prescriptionId, patientId, { uploadId, fileName });
    if (doctorCode) recordVisit({ patientId, doctorCode, doctorName, system, consultationCode, activity: 'Prescription issued', at });
  }

  // ---------- reading ----------
  const loadRecord = (rid) => {
    const n = ridNum(rid); if (!n) return null;
    return db.prepare(`SELECT r.record_id, r.patient_id, r.prescription_id, r.document_type, r.file_name, r.ayush_system, r.problem, r.diagnosis, r.prakriti, r.saved_at,
        x.prescription_details, x.instructions, x.doctor_reference_id, x.encounter_id
      FROM patient_records r JOIN prescriptions x ON x.prescription_id = r.prescription_id WHERE r.record_id = ?`).get(n) || null;
  };
  const versionsOf = (pid) => db.prepare('SELECT * FROM prescription_versions WHERE prescription_id = ? ORDER BY version_no DESC').all(pid);
  const verView = (v) => ({
    version: v.version_no, original: v.version_no === 1, medicines: JSON.parse(v.medicines || '[]'), advice: v.instructions || '', problem: v.problem || '', diagnosis: v.diagnosis || '',
    changedBy: { role: v.changed_by_role, code: v.changed_by_code, name: v.changed_by_name }, note: v.change_note, summary: v.change_summary, at: v.created_at,
  });
  const fileOf = (pid) => db.prepare('SELECT u.* FROM prescription_files f JOIN patient_uploads u ON u.upload_id = f.upload_id WHERE f.prescription_id = ?').get(pid) || null;
  const fileView = (u) => (u ? { uploadId: `U-${u.upload_id}`, fileName: u.file_name, mimeType: u.mime_type, size: u.size, uploadedAt: u.uploaded_at } : null);
  const latestOf = (pid) => db.prepare('SELECT * FROM prescription_versions WHERE prescription_id = ? ORDER BY version_no DESC LIMIT 1').get(pid);

  // extra fields the lists (patient Uploads page, doctor panel) need; added next to the existing ones, nothing renamed
  function recordExtras(prescriptionId) {
    const last = latestOf(prescriptionId); const f = fileOf(prescriptionId);
    const issuer = db.prepare('SELECT doctor_reference_id d FROM prescriptions WHERE prescription_id = ?').get(prescriptionId);
    return { issuedByCode: issuer ? issuer.d : null, prescriptionVersion: last ? last.version_no : 1, edited: !!last && last.version_no > 1, updatedAt: last && last.version_no > 1 ? last.created_at : null,
      updatedBy: last && last.version_no > 1 ? (last.changed_by_name || last.changed_by_code) : null,
      updateSummary: last && last.version_no > 1 ? last.change_summary : null, updateNote: last && last.version_no > 1 ? last.change_note : null,
      hasFile: !!f, uploadId: f ? `U-${f.upload_id}` : null };
  }
  function uploadExtras(uploadNo) {
    const l = db.prepare(`SELECT r.record_id, f.prescription_id FROM prescription_files f JOIN patient_records r ON r.prescription_id = f.prescription_id WHERE f.upload_id = ?`).get(uploadNo);
    return l ? { recordId: `R-${l.record_id}`, ...recordExtras(l.prescription_id) } : { recordId: null, prescriptionVersion: null, edited: false };
  }

  // ---------- editing ----------
  function cleanMedicines(list, errors) {
    if (!Array.isArray(list)) { errors.medicines = 'Medicines must be a list.'; return []; }
    if (list.length > MAX_MEDICINES) { errors.medicines = `At most ${MAX_MEDICINES} medicines.`; return []; }
    const out = [];
    list.forEach((m, i) => {
      const row = {};
      for (const [k, max] of Object.entries(FIELD_MAX)) { row[k] = clip(m && m[k]); if (row[k].length > max) errors[`medicines.${i}.${k}`] = `At most ${max} characters.`; }
      if (!row.name) { if (row.dose || row.timing || row.duration) errors[`medicines.${i}.name`] = 'Medicine name is required.'; return; } // fully empty rows are dropped
      out.push(row);
    });
    return out;
  }
  const norm = (s) => String(s || '').trim().toLowerCase();
  function describeChange(before, after, prev, next) {
    const b = new Map(before.map((m) => [norm(m.name), m])); const a = new Map(after.map((m) => [norm(m.name), m]));
    const added = after.filter((m) => !b.has(norm(m.name))).map((m) => m.name);
    const removed = before.filter((m) => !a.has(norm(m.name))).map((m) => m.name);
    const changed = after.filter((m) => b.has(norm(m.name)) && ['dose', 'timing', 'duration'].some((k) => (b.get(norm(m.name))[k] || '') !== (m[k] || ''))).map((m) => m.name);
    const parts = [];
    if (added.length) parts.push(`Added: ${added.join(', ')}`);
    if (removed.length) parts.push(`Removed: ${removed.join(', ')}`);
    if (changed.length) parts.push(`Changed: ${changed.join(', ')}`);
    if (prev.advice !== next.advice) parts.push('Advice changed');
    if (prev.problem !== next.problem) parts.push('Problem changed');
    if (prev.diagnosis !== next.diagnosis) parts.push('Diagnosis changed');
    return parts.join('. ') || 'Details edited';
  }

  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

  function mount(app) {
    // ---- current prescription + history ----
    app.get('/records/:rid/prescription', authenticate, async (req, res) => {
      const r = loadRecord(req.params.rid); if (!r) return res.status(404).json({ message: 'Record not found.' });
      const a = await guard(req, res, r.patient_id, r.ayush_system, 'read'); if (!a) return;
      const vs = versionsOf(r.prescription_id); const last = vs[0];
      res.json({
        recordId: `R-${r.record_id}`, system: r.ayush_system, documentType: r.document_type, savedAt: r.saved_at,
        problem: r.problem || '', diagnosis: r.diagnosis || '', medicines: JSON.parse(r.prescription_details || '[]'), advice: r.instructions || '',
        version: last ? last.version_no : 1, file: fileView(fileOf(r.prescription_id)), versions: vs.map(verView),
      });
    });

    // ---- doctor edit ----
    app.put('/records/:rid/prescription', authenticate, async (req, res) => {
      if (req.user.role !== 'practitioner') return forbid(res, 'Only a doctor can edit a prescription.');
      const r = loadRecord(req.params.rid); if (!r) return res.status(404).json({ message: 'Record not found.' });
      const a = await guard(req, res, r.patient_id, r.ayush_system, 'write'); if (!a) return;
      const b = req.body || {}; const errors = {};
      const medicines = cleanMedicines(b.medicines, errors);
      const advice = clip(b.advice); const problem = clip(b.problem === undefined ? r.problem : b.problem); const diagnosis = clip(b.diagnosis === undefined ? r.diagnosis : b.diagnosis); const note = clip(b.note);
      if (advice.length > 2000) errors.advice = 'At most 2000 characters.';
      if (problem.length > 1000) errors.problem = 'At most 1000 characters.';
      if (diagnosis.length > 1000) errors.diagnosis = 'At most 1000 characters.';
      if (note.length > 300) errors.note = 'At most 300 characters.';
      if (Object.keys(errors).length) return invalid(res, errors);

      const before = { medicines: JSON.parse(r.prescription_details || '[]'), advice: r.instructions || '', problem: r.problem || '', diagnosis: r.diagnosis || '' };
      const after = { medicines, advice, problem, diagnosis };
      if (same(before, after)) return res.status(400).json({ message: 'Nothing was changed.' });

      const out = db.transaction(() => {
        const last = latestOf(r.prescription_id);
        const cur = last ? last.version_no : 1;
        if (b.baseVersion !== undefined && Number(b.baseVersion) !== cur) return { conflict: cur };
        const next = cur + 1; const at = now();
        db.prepare('UPDATE prescriptions SET prescription_details = ?, instructions = ? WHERE prescription_id = ?').run(JSON.stringify(medicines), advice, r.prescription_id);
        db.prepare('UPDATE patient_records SET problem = ?, diagnosis = ? WHERE record_id = ?').run(problem, diagnosis, r.record_id);
        const summary = describeChange(before.medicines, medicines, before, after);
        insertVersion.run(uuid(), r.prescription_id, next, JSON.stringify(medicines), advice, problem, diagnosis, 'practitioner', req.user.code, req.user.name || null, note || null, summary, at);
        recordVisit({ patientId: r.patient_id, doctorCode: req.user.code, doctorName: req.user.name, system: r.ayush_system, activity: 'Prescription updated', at });
        return { version: next, summary, at };
      })();
      if (out.conflict) return res.status(409).json({ message: 'This prescription was changed by someone else. Reload it and try again.', currentVersion: out.conflict });

      const enc = db.prepare('SELECT consultation_code c FROM encounters WHERE encounter_id = ?').get(r.encounter_id);
      events.publish(EVENTS.PRESCRIPTION_UPDATED, r.patient_id, {
        patientId: r.patient_id, recordId: `R-${r.record_id}`, prescriptionId: r.prescription_id, version: out.version, system: r.ayush_system,
        consultationCode: enc ? enc.c : null, doctor: req.user.code, doctorName: req.user.name || null, summary: out.summary, savedAt: out.at,
      });
      audit(req, { action: 'PRESCRIPTION_UPDATED', type: 'prescription', ref: r.prescription_id, reason: `v${out.version}` });
      res.json({ recordId: `R-${r.record_id}`, version: out.version, summary: out.summary, updatedAt: out.at });
    });

    // ---- PDF of the latest (or a given) version ----
    app.get('/records/:rid/prescription/download', authenticate, async (req, res) => {
      const r = loadRecord(req.params.rid); if (!r) return res.status(404).json({ message: 'Record not found.' });
      const a = await guard(req, res, r.patient_id, r.ayush_system, 'read'); if (!a) return;
      const vs = versionsOf(r.prescription_id);
      const want = req.query.version === undefined ? vs[0].version_no : Number(req.query.version);
      const v = vs.find((x) => x.version_no === want);
      if (!v) return res.status(404).json({ message: 'That version does not exist.' });
      let PDFDocument; try { PDFDocument = require('pdfkit'); } catch (e) { return res.status(503).json({ message: 'PDF download is not available on this server (pdfkit is not installed).' }); }
      renderPdf(PDFDocument, res, { r, v, versions: vs, patient: a.patient, rid: `R-${r.record_id}` });
      audit(req, { action: 'PRESCRIPTION_DOWNLOADED', type: 'prescription', ref: r.prescription_id, reason: `v${v.version_no}` });
    });

    // ---- original uploaded file ----
    app.get('/records/:rid/file', authenticate, async (req, res) => {
      const r = loadRecord(req.params.rid); if (!r) return res.status(404).json({ message: 'Record not found.' });
      const a = await guard(req, res, r.patient_id, r.ayush_system, 'read'); if (!a) return;
      const u = fileOf(r.prescription_id);
      if (!u) return res.status(404).json({ message: 'No original file is attached to this prescription.' });
      sendUpload(res, u);
      audit(req, { action: 'UPLOAD_DOWNLOADED', type: 'upload', ref: `U-${u.upload_id}` });
    });
    app.get('/records/uploads/:uid/download', authenticate, async (req, res) => {
      const n = uidNum(req.params.uid); const u = n && db.prepare('SELECT * FROM patient_uploads WHERE upload_id = ?').get(n);
      if (!u) return res.status(404).json({ message: 'File not found.' });
      const link = db.prepare(`SELECT r.ayush_system s FROM prescription_files f JOIN patient_records r ON r.prescription_id = f.prescription_id WHERE f.upload_id = ?`).get(u.upload_id);
      const a = await guard(req, res, u.patient_id, link ? link.s : null, 'read'); if (!a) return;
      if (!link && a.systems) return forbid(res, 'The patient has shared only some AYUSH systems with you, so this file is not available.'); // same rule as the summary: restricted doctors do not see loose uploads
      sendUpload(res, u);
      audit(req, { action: 'UPLOAD_DOWNLOADED', type: 'upload', ref: `U-${u.upload_id}` });
    });
  }

  function sendUpload(res, u) {
    const abs = path.join(STORAGE_DIR, path.basename(String(u.document_reference || '')));
    if (!u.document_reference || !fs.existsSync(abs)) return res.status(404).json({ message: 'The stored file is no longer available.' });
    const safe = (u.file_name || 'prescription').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'prescription';
    return res.sendFile(abs, { dotfiles: 'allow', headers: {
      'Content-Type': MIME_OK.includes(u.mime_type) ? u.mime_type : 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(u.file_name || safe)}`, // always a download, never rendered by the server's origin
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    } });
  }

  function mountInternal(internal) {
    internal.get('/patients/:pid/visit-data', (req, res) => {
      const pid = req.params.pid;
      const visits = db.prepare('SELECT * FROM doctor_visits WHERE patient_id = ? ORDER BY visit_date DESC').all(pid)
        .map((v) => ({ visitId: v.visit_id, date: v.visit_date, doctorCode: v.doctor_code, doctorName: v.doctor_name, system: v.ayush_system || null, consultationId: v.consultation_code, activity: v.activity }));
      const records = db.prepare(`SELECT r.record_id, r.prescription_id, r.saved_at, r.document_type, r.file_name, r.ayush_system, r.problem, r.diagnosis, x.prescription_details, x.instructions, x.doctor_reference_id
        FROM patient_records r JOIN prescriptions x ON x.prescription_id = r.prescription_id WHERE r.patient_id = ? ORDER BY r.record_id DESC`).all(pid).map((r) => {
        const vs = versionsOf(r.prescription_id);
        return {
          recordId: `R-${r.record_id}`, savedAt: r.saved_at, documentType: r.document_type, fileName: r.file_name, system: r.ayush_system, problem: r.problem, diagnosis: r.diagnosis,
          medicines: JSON.parse(r.prescription_details || '[]'), advice: r.instructions || '', issuedByCode: r.doctor_reference_id, version: vs[0] ? vs[0].version_no : 1, hasFile: !!fileOf(r.prescription_id),
          updates: vs.filter((v) => v.version_no > 1).map((v) => ({ version: v.version_no, at: v.created_at, doctorCode: v.changed_by_code, doctorName: v.changed_by_name, summary: v.change_summary, note: v.change_note })),
        };
      });
      res.json({ visits, records });
    });
  }

  return { mount, mountInternal, onRecordCreated, recordExtras, uploadExtras, recordVisit };
};

// ---------------------------------------------------------------- PDF
function renderPdf(PDFDocument, res, { r, v, versions, patient, rid }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Prescription ${rid} v${v.version_no}`, Producer: 'AYUSH Digital Health Platform' } });
  const fontPath = process.env.PRESCRIPTION_PDF_FONT; // optional TTF for Hindi / Kannada text; the default font covers English only
  let custom = false;
  if (fontPath && fs.existsSync(fontPath)) { try { doc.registerFont('Body', fontPath); custom = true; } catch (e) { /* fall back */ } }
  const t = (s) => { const x = String(s === undefined || s === null ? '' : s); return custom ? x : x.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '?'); };
  const body = (size = 11, bold = false) => doc.font(custom ? 'Body' : bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
  const date = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '');
  const safeName = `prescription-${rid}-v${v.version_no}.pdf`;
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${safeName}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
  doc.pipe(res);

  body(18, true).fillColor('#1f7a4d').text('AYUSH Prescription'); doc.moveDown(0.3).fillColor('#000');
  body(10).fillColor('#5f7080').text(`Record ${rid} · Version ${v.version_no}${v.version_no === 1 ? ' (original)' : ''} · ${date(v.created_at)}`); doc.moveDown(0.8).fillColor('#000');
  body(11, true).text('Patient'); body(11).text(t(`${patient.name || ''}  ·  Health ID ${patient.healthId || ''}`));
  body(11).text(t([patient.gender, r.ayush_system].filter(Boolean).join('  ·  ')));
  doc.moveDown(0.6);
  const by = v.changed_by_role === 'practitioner' ? (v.changed_by_name ? (/^dr\b/i.test(v.changed_by_name) ? v.changed_by_name : `Dr ${v.changed_by_name}`) : v.changed_by_code || 'Doctor') : null;
  if (by) { body(11, true).text(v.version_no === 1 ? 'Issued by' : 'Updated by'); body(11).text(t(`${by}${v.changed_by_code ? ` (${v.changed_by_code})` : ''}`)); doc.moveDown(0.6); }
  if (v.problem) { body(11, true).text('Problem'); body(11).text(t(v.problem)); doc.moveDown(0.6); }
  if (v.diagnosis) { body(11, true).text('Diagnosis'); body(11).text(t(v.diagnosis)); doc.moveDown(0.6); }

  body(11, true).text('Medicines'); doc.moveDown(0.2);
  const meds = JSON.parse(v.medicines || '[]');
  if (!meds.length) body(11).text('No medicines listed.');
  const cols = [[0, 'Medicine', 190], [190, 'Dose', 90], [280, 'When', 110], [390, 'For how long', 105]];
  const x0 = doc.page.margins.left;
  if (meds.length) {
    let y = doc.y; body(10, true); cols.forEach(([dx, h, w]) => doc.text(h, x0 + dx, y, { width: w - 6 }));
    y = doc.y + 3; doc.moveTo(x0, y).lineTo(x0 + 495, y).strokeColor('#b8c2cc').stroke(); y += 5;
    for (const m of meds) {
      if (y > doc.page.height - 120) { doc.addPage(); y = doc.page.margins.top; }
      body(10); let bottom = y;
      cols.forEach(([dx, , w], i) => { doc.text(t([m.name, m.dose, m.timing, m.duration][i] || '-'), x0 + dx, y, { width: w - 6 }); bottom = Math.max(bottom, doc.y); });
      y = bottom + 4;
    }
    doc.x = x0; doc.y = y;
  }
  doc.moveDown(0.8); doc.x = x0;
  if (v.instructions) { body(11, true).text('Advice', x0); body(11).text(t(v.instructions), x0); doc.moveDown(0.6); }
  if (v.change_summary && v.version_no > 1) { body(10, true).text('What changed in this version', x0); body(10).text(t(`${v.change_summary}${v.change_note ? `\nNote: ${v.change_note}` : ''}`), x0); doc.moveDown(0.6); }

  if (versions.length > 1) {
    body(10, true).text('Version history', x0);
    for (const h of [...versions].reverse()) body(9).fillColor('#5f7080').text(t(`v${h.version_no}  ${date(h.created_at)}  ${h.version_no === 1 ? 'Original' : `Updated by ${h.changed_by_name || h.changed_by_code || 'doctor'}`}`), x0);
    doc.fillColor('#000');
  }
  doc.moveDown(1); body(8).fillColor('#5f7080').text('Generated from the AYUSH Digital Health Platform. Keep the original uploaded file for reference; every change is recorded in the version history.', x0);
  doc.end();
}
