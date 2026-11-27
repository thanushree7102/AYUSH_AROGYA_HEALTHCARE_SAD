// Longitudinal Record Service (port 5008): one patient timeline across all AYUSH systems + the consent-aware patient summary.
// Owns longitudinal.db: a READ MODEL built only from events (records, assessments, encounters). It never writes clinical data.
// Every read asks the Shared Platform whether this person may see this patient, and which AYUSH systems the patient allowed;
// entries from other systems are left out (not even counted), so a doctor cannot see what the patient did not share.
try { require('dotenv').config(); } catch (e) { /* optional */ }
process.env.SERVICE_NAME = 'longitudinal';
const path = require('path');
const express = require('express');
const { createService, finish, listen, authenticate, serviceOnly, forbid } = require('../../libs/common/http');
const { openDb, uuid } = require('../../libs/common/db');
const { checkAccess, platform, clinical } = require('../../libs/common/internal');
const { createEvents } = require('../../libs/common/events');
const { SERVICES, EVENTS } = require('../../libs/common/config');

const db = openDb(path.join(__dirname, '..', 'database'), 'longitudinal.db', 'longitudinal-record-service');
db.exec(`
CREATE TABLE IF NOT EXISTS timeline_entries (
  entry_id TEXT PRIMARY KEY, patient_id TEXT NOT NULL,
  source_service TEXT NOT NULL, source_ref TEXT NOT NULL,          -- which service/record the entry came from (UNIQUE: events are applied once)
  kind TEXT NOT NULL CHECK (kind IN ('record','assessment','encounter')),
  ayush_system TEXT, consultation_code TEXT, title TEXT NOT NULL, summary TEXT, occurred_at TEXT NOT NULL,
  UNIQUE (source_service, source_ref)
);
CREATE INDEX IF NOT EXISTS ix_tl_patient ON timeline_entries(patient_id, occurred_at);
`);
const events = createEvents('longitudinal', db);
const put = db.prepare(`INSERT OR IGNORE INTO timeline_entries (entry_id,patient_id,source_service,source_ref,kind,ayush_system,consultation_code,title,summary,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);

const app = createService('longitudinal');
const resolveRef = async (ref, req) => {
  if (!/^C-\d+$/.test(String(ref))) return ref;
  const r = await clinical.get(`/internal/encounters/by-code/${ref}`, { requestId: req.id });
  return r.ok ? r.data.patientId : ref;
};
async function guard(req, res, ref) {
  const a = await checkAccess(req, { patient: await resolveRef(ref, req), mode: 'read' });
  if (a.unavailable) { res.status(503).json({ message: 'Identity service is not available right now. Please retry.' }); return null; }
  if (!a.allowed) { res.status(a.status === 404 ? 404 : 403).json({ message: a.reason || 'Not allowed.' }); return null; }
  return a;
}
const visible = (a, system) => !a.systems || !system || a.systems.includes(system);

app.get('/patients/:id/timeline', authenticate, async (req, res) => {
  const a = await guard(req, res, req.params.id); if (!a) return;
  const { system, from, to } = req.query;
  const rows = db.prepare('SELECT * FROM timeline_entries WHERE patient_id = ? ORDER BY occurred_at DESC').all(a.patient.patientId)
    .filter((r) => visible(a, r.ayush_system) && (!system || r.ayush_system === system) && (!from || r.occurred_at >= from) && (!to || r.occurred_at <= `${to}~`));
  res.json({ patientId: a.patient.healthId, items: rows.map((r) => ({ id: r.entry_id, kind: r.kind, system: r.ayush_system, consultationId: r.consultation_code, title: r.title, summary: r.summary, occurredAt: r.occurred_at })), restricted: !!a.systems });
});

// Medical / visit history of the patient: which doctors they saw and when, the prescriptions they were given and every update a doctor made.
// Assembled on request from the Clinical service (visits, prescriptions + versions) and the Shared Platform (doctor details).
// Patient only: it is the patient's own history. If the Platform is down the doctor names saved with each visit are used;
// if Clinical is down the answer says so instead of failing.
app.get('/patients/:id/visit-history', authenticate, async (req, res) => {
  if (req.user.role !== 'patient') return forbid(res, 'The visit history is available to the patient only.');
  const a = await guard(req, res, req.params.id); if (!a) return;
  const cl = await clinical.get(`/internal/patients/${a.patient.patientId}/visit-data`, { requestId: req.id });
  if (!cl.ok) return res.json({ healthId: a.patient.healthId, clinicalAvailable: false, doctorDetailsAvailable: true, doctors: [], items: [] });
  const { visits, records } = cl.data;
  const codes = new Set([...visits.map((v) => v.doctorCode), ...records.map((r) => r.issuedByCode), ...records.flatMap((r) => r.updates.map((u) => u.doctorCode))].filter(Boolean));
  let info = {}; let detailsOk = true;
  if (codes.size) {
    const pd = await platform.post('/internal/doctors/lookup', { codes: [...codes] }, { requestId: req.id });
    if (pd.ok) info = Object.fromEntries(pd.data.map((d) => [d.code, d])); else detailsOk = false;
  }
  const snap = {}; // names saved with the visit / update, used when the Platform cannot be asked
  visits.forEach((v) => { if (v.doctorName) snap[v.doctorCode] = v.doctorName; });
  records.forEach((r) => r.updates.forEach((u) => { if (u.doctorName) snap[u.doctorCode] = u.doctorName; }));
  const who = (code) => (code ? { code, name: (info[code] && info[code].name) || snap[code] || code, system: info[code] ? info[code].system : null, qualifications: info[code] ? info[code].qualifications : [], experienceYears: info[code] ? info[code].experienceYears : null, city: info[code] ? info[code].city : null } : null);

  const items = [];
  for (const v of visits) items.push({ id: `visit:${v.visitId}`, kind: 'visit', date: v.date, system: v.system, consultationId: v.consultationId, doctor: who(v.doctorCode), title: 'Doctor visit', summary: v.activity });
  for (const r of records) {
    items.push({ id: `rx:${r.recordId}`, kind: 'prescription', date: r.savedAt, recordId: r.recordId, system: r.system, documentType: r.documentType, fileName: r.fileName, doctor: who(r.issuedByCode),
      title: r.issuedByCode ? 'Prescription issued' : 'Prescription added by you', problem: r.problem, diagnosis: r.diagnosis, medicines: r.medicines, advice: r.advice, version: r.version, hasFile: r.hasFile });
    for (const u of r.updates) items.push({ id: `rxu:${r.recordId}:${u.version}`, kind: 'prescription_update', date: u.at, recordId: r.recordId, system: r.system, version: u.version, doctor: who(u.doctorCode), title: `Prescription updated (version ${u.version})`, summary: u.summary, note: u.note });
  }
  items.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const byDoc = new Map();
  for (const v of visits) {
    const d = byDoc.get(v.doctorCode) || { ...who(v.doctorCode), visits: 0, firstVisit: v.date, lastVisit: v.date };
    d.visits += 1; if (v.date < d.firstVisit) d.firstVisit = v.date; if (v.date > d.lastVisit) d.lastVisit = v.date; byDoc.set(v.doctorCode, d);
  }
  res.json({ healthId: a.patient.healthId, clinicalAvailable: true, doctorDetailsAvailable: detailsOk, doctors: [...byDoc.values()].sort((x, y) => y.lastVisit.localeCompare(x.lastVisit)), items });
});

// Same shape the website always used, now assembled from the owning services.
app.get('/patients/:id/summary', authenticate, async (req, res) => {
  const a = await guard(req, res, req.params.id); if (!a) return;
  const [pd, cl] = await Promise.all([platform.get(`/internal/patients/${a.patient.patientId}/profile-data`, { requestId: req.id }), clinical.get(`/internal/patients/${a.patient.patientId}/records`, { requestId: req.id })]);
  if (!pd.ok) return res.status(pd.status === 404 ? 404 : 503).json({ message: pd.data && pd.data.message });
  const c = cl.ok ? cl.data : { consultationId: null, records: [], uploads: [] }; // clinical data missing = say so, don't fail the whole summary
  res.json({
    name: pd.data.name, healthId: pd.data.healthId, consultationId: c.consultationId, gender: pd.data.gender, dob: pd.data.dob,
    records: c.records.filter((r) => visible(a, r.system)), uploads: a.systems ? [] : c.uploads,
    medicalHistory: pd.data.medicalHistory, concerns: pd.data.concerns, lastExtracted: null,
    sharedWith: req.user.role === 'patient' ? pd.data.sharedWith : [], restricted: !!a.systems, clinicalAvailable: cl.ok,
  });
});

const internal = express.Router();
internal.use(serviceOnly);
internal.delete('/patients/:pid', (req, res) => { db.prepare('DELETE FROM timeline_entries WHERE patient_id = ?').run(req.params.pid); res.json({ deleted: true }); });
internal.post('/events', events.handler(async (e) => {
  const d = e.data || {};
  if (e.type === EVENTS.RECORD_CREATED) put.run(uuid(), d.patientId, 'clinical', `record:${d.recordId}`, 'record', d.system, d.consultationCode, `${d.system} record`, [d.problem, d.diagnosis].filter(Boolean).join(' | '), d.savedAt);
  else if (e.type === EVENTS.ASSESSMENT_SAVED) put.run(uuid(), d.patientId, d.system, `${d.consultationCode}:${d.part}:${d.version}`, 'assessment', d.system, d.consultationCode, d.title, d.text || '', d.savedAt);
  else if (e.type === EVENTS.PRESCRIPTION_UPDATED) put.run(uuid(), d.patientId, 'clinical', `rx-update:${d.recordId}:${d.version}`, 'record', d.system, d.consultationCode, 'Prescription updated', [d.doctorName && `by ${d.doctorName}`, d.summary].filter(Boolean).join(': '), d.savedAt);
  else if (e.type === EVENTS.ENCOUNTER_CREATED) put.run(uuid(), d.patientId, 'clinical', `encounter:${d.encounterId}`, 'encounter', d.system, d.consultationCode, 'Consultation started', d.reason || '', d.at);
  else if (e.type === EVENTS.PATIENT_DELETED) db.prepare('DELETE FROM timeline_entries WHERE patient_id = ?').run(d.patientId);
}));
app.use('/internal', internal);

finish(app, 'longitudinal');
listen(app, 'longitudinal');
events.subscribe('longitudinal', `${SERVICES.longitudinal.url}/internal/events`, [EVENTS.RECORD_CREATED, EVENTS.PRESCRIPTION_UPDATED, EVENTS.ASSESSMENT_SAVED, EVENTS.ENCOUNTER_CREATED, EVENTS.PATIENT_DELETED]);
