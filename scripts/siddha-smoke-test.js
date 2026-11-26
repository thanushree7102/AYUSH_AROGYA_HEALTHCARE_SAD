// End-to-end smoke test for the Siddha application. Starts every required service on temporary data + ports,
// drives the API through the gateway only, and checks: registration (OTP + face), consent, the Siddha doctor forms
// (Siddha terms only), versions, prescription + PDF, appointments and the patient timeline.
//   npm test
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { ROOT, PROCESSES } = require('./services');
const { SERVICES } = require('../libs/common/config');

const PORT_BASE = 5700 + Math.floor(Math.random() * 40) * 20;
const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'siddha-smoke-'));
const ENV = { ...process.env, AYUSH_SECRET: 'siddha-smoke-secret', OTP_CODE: '123456', OTP_SHOW: '0', FACE_REQUIRED: '1', SEED_DEMO: '1', ANTHROPIC_API_KEY: '', PORT_BASE: String(PORT_BASE), DATA_ROOT, SERVICE_HOST: '127.0.0.1' };
for (const [k, v] of Object.entries(SERVICES)) { ENV[`${k.toUpperCase()}_PORT`] = String(PORT_BASE + v.offset); ENV[`${k.toUpperCase()}_URL`] = `http://127.0.0.1:${PORT_BASE + v.offset}`; }
const GW = `http://127.0.0.1:${PORT_BASE}`;
const kids = []; const logs = []; const results = []; let section = '';
const ok = (c, name, extra = '') => { results.push({ pass: !!c }); console.log(`  ${c ? '✓' : '✗'} ${name}${c ? '' : ' ' + String(extra).slice(0, 300)}`); };
const sec = (s) => { section = s; console.log(`\n${s}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 25000) { const t = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) { /* retry */ } if (Date.now() - t > ms) return null; await sleep(300); } }
const j = async (p, o = {}) => {
  const headers = { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.headers || {}) };
  const r = await fetch(GW + p, { method: o.method || (o.json ? 'POST' : 'GET'), headers, body: o.json ? JSON.stringify(o.json) : undefined });
  let b = null; try { b = await r.json(); } catch (e) { /* empty */ } return { s: r.status, b };
};
const face = (seed) => Array.from({ length: 128 }, (_, i) => Math.sin(seed * 7.1 + i * 0.37) * 0.2);
const login = (mobile, role) => j('/v1/auth/login', { json: { mobile, role, otp: '123456' } });
const AYURVEDA_TERMS = /prakriti|vikriti|dosha|ayurved|agni|koshtha|panchakarma|dashavidha|pathya\b|\bvata\b|\bpitta\b|\bkapha\b/i;

// valid sample values for every field of a Siddha form
const fill = (def) => Object.fromEntries(def.fields.map((f) => [f.name,
  f.type === 'select' ? f.options[0] : f.type === 'multiselect' ? [f.options[0]] : f.type === 'date' ? '2026-12-15' : `test ${f.name}`]));

(async () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'prepare-shared-data.js')], { cwd: ROOT, env: ENV, stdio: 'ignore' });
  for (const [n, f] of PROCESSES) {
    const p = spawn(process.execPath, [path.join(ROOT, f)], { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stderr.on('data', (d) => { const s = String(d); logs.push(`[${n}] ${s.trim()}`); if (/EADDR|Error:/.test(s)) process.stderr.write(`[${n}] ${s}`); });
    p.stdout.on('data', (d) => logs.push(`[${n}] ${String(d).trim()}`));
    kids.push(p);
  }
  const up = await until(async () => { const h = (await j('/v1/health')).b; return h && h.ok ? h : null; });
  if (!up) { console.error('services did not start\n' + JSON.stringify((await j('/v1/health').catch(() => ({}))).b) + '\n' + logs.slice(-40).join('\n')); kids.forEach((k) => k.kill()); process.exit(2); }
  try {
    sec('1. Services and routing');
    ok(up.ok, 'gateway health: all required services are up', JSON.stringify(up));
    ok((await j('/v1/siddha/forms')).s === 401, 'Siddha forms are protected without login');
    ok((await j('/v1/internal/auth/resolve', { json: {} })).s === 404, '/internal/* is never reachable through the gateway');

    sec('2. Patient registration (OTP + face + consent)');
    const M = '9811100001'; const f1 = face(1);
    let r = await j('/v1/face/enroll', { json: { mobile: M, otp: '123456', descriptor: f1, liveness: true, consent: true } });
    ok(r.s === 201 && r.b.faceToken, 'face enrolled', JSON.stringify(r.b));
    const ft = r.b.faceToken;
    r = await j('/v1/auth/register', { json: { name: 'Test Patient', mobile: M, otp: '123456', consent: true, dob: '1990-01-01', gender: 'Female' }, headers: { 'X-Face-Token': ft } });
    ok(r.s === 201 && r.b.healthId, 'patient registered', JSON.stringify(r.b));
    const HID = r.b.healthId;
    const P = (await login(M, 'patient')).b?.token; ok(!!P, 'patient login');

    sec('3. Siddha doctor and consent');
    const dl = await login('9000000003', 'practitioner');
    ok(dl.s === 200 && dl.b.token, 'demo Siddha doctor (9000000003) logs in', JSON.stringify(dl.b));
    const D = dl.b.token; const DCODE = 'D-SID-1';
    const me = await j('/v1/me', { token: D });
    ok(me.s === 200 && /siddha/i.test(JSON.stringify(me.b)), 'doctor profile shows the Siddha system', JSON.stringify(me.b));
    const sum0 = await j(`/v1/patients/${HID}/summary`, { token: P });
    const CID = sum0.b?.consultationId; ok(sum0.s === 200 && CID, 'patient summary + consultation id', JSON.stringify(sum0.b));
    ok((await j(`/v1/patients/${HID}/summary`, { token: D })).s === 403, 'doctor without consent cannot open the record');
    ok((await j(`/v1/siddha/consultations/${CID}/summary`, { token: D })).s === 403, 'doctor without consent cannot read the Siddha forms');
    r = await j(`/v1/patients/${HID}/consents`, { token: P, json: { doctorIds: [DCODE], systems: ['Siddha'], days: 30 } });
    ok(r.s === 200 && r.b.sharedWith.includes(DCODE), 'patient shares the record with the Siddha doctor', JSON.stringify(r.b));
    ok((await j(`/v1/patients/${HID}/summary`, { token: D })).s === 200, 'doctor can now open the record');

    sec('4. Siddha forms (the doctor sees Siddha terms only)');
    r = await j('/v1/siddha/forms', { token: D });
    const forms = r.b; const ids = (forms.parts || []).map((p) => p.id);
    ok(r.s === 200 && forms.system === 'Siddha', 'forms served by the Siddha service');
    ok(JSON.stringify(ids) === JSON.stringify(['mukkutram', 'envagai-thervu', 'diagnosis', 'maruthuvam', 'follow-up']), 'five Siddha forms in clinical order', ids.join(', '));
    ok(!AYURVEDA_TERMS.test(JSON.stringify(forms)), 'no Ayurveda terms anywhere in the Siddha forms', (JSON.stringify(forms).match(AYURVEDA_TERMS) || [''])[0]);
    const all = JSON.stringify(forms);
    ok(['Mukkutram', 'Udal Thegi', 'Envagai Thervu', 'Naadi', 'Neer Kuri', 'Nei Kuri', 'Noi Naadal', 'Ul Marunthu', 'Pura Maruthuvam', 'Pathiyam', 'Kabam'].every((t) => all.includes(t)), 'Siddha vocabulary present (Mukkutram, Udal Thegi, Envagai Thervu, Naadi, Neer/Nei Kuri, Noi Naadal, Ul Marunthu, Pura Maruthuvam, Pathiyam)');
    for (const def of forms.parts) {
      r = await j(`/v1/siddha/consultations/${CID}/${def.id}`, { token: D, json: fill(def) });
      ok(r.s === 201 && r.b.version === 1, `doctor saves "${def.label}" v1`, JSON.stringify(r.b));
    }
    const env = forms.parts.find((p) => p.id === 'envagai-thervu');
    r = await j(`/v1/siddha/consultations/${CID}/envagai-thervu`, { token: D, json: fill(env) });
    ok(r.s === 201 && r.b.version === 2, 'second save of Envagai Thervu creates v2 (history kept)');
    const idem = { 'Idempotency-Key': 'idem-1' };
    const a1 = await j(`/v1/siddha/consultations/${CID}/envagai-thervu`, { token: D, json: fill(env), headers: idem });
    const a2 = await j(`/v1/siddha/consultations/${CID}/envagai-thervu`, { token: D, json: fill(env), headers: idem });
    ok(a1.b.version === a2.b.version, 'same Idempotency-Key does not create another version');
    r = await j(`/v1/siddha/consultations/${CID}/envagai-thervu/versions`, { token: D });
    ok(r.s === 200 && r.b.length === 3, 'version history lists 3 versions', JSON.stringify(r.b));
    r = await j(`/v1/siddha/consultations/${CID}/envagai-thervu`, { token: D, json: { ...fill(env), naadi: 'Vata Naadi' } });
    ok(r.s === 400, 'a non-Siddha pulse name (Vata Naadi) is rejected', JSON.stringify(r.b));
    r = await j(`/v1/siddha/consultations/${CID}/mukkutram`, { token: D, json: { dominant: 'Vatham (Vali)' } });
    ok(r.s === 400, 'Udal Thegi is required on the Mukkutram form');
    r = await j(`/v1/siddha/consultations/${CID}/diagnosis`, { token: P, json: fill(forms.parts.find((p) => p.id === 'diagnosis')) });
    ok(r.s === 403, 'the patient cannot write the doctor-only Noi Naadal form');
    r = await j(`/v1/siddha/consultations/${CID}/summary`, { token: D });
    ok(r.s === 200 && r.b.diagnosis && r.b['envagai-thervu'] && r.b.mukkutram && r.b.maruthuvam, 'consultation summary returns the latest of every Siddha form');

    sec('5. Marunthu (prescription) and PDF');
    r = await j('/v1/records', { token: D, json: { healthId: HID, system: 'Siddha', documentType: 'Prescription', problem: 'Kaaichal', diagnosis: 'Pitha Suram', medicines: [{ name: 'Nilavembu Kudineer', dose: '30 ml', timing: 'twice daily after food', duration: '5 days' }, { name: 'Amukkara Chooranam', dose: '1 tsp', timing: 'at bedtime with warm water', duration: '10 days' }], advice: 'Pathiyam: warm light food' } });
    ok(r.s === 201 && /^R-\d+/.test(r.b.recordId || ''), 'doctor issues a Siddha prescription', JSON.stringify(r.b));
    const RID = r.b?.recordId;
    const pdf = await fetch(`${GW}/v1/records/${RID}/prescription/download`, { headers: { Authorization: `Bearer ${D}` } });
    const buf = Buffer.from(await pdf.arrayBuffer());
    ok(pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF', 'prescription PDF downloads', `status ${pdf.status}`);
    r = await j(`/v1/patients/${HID}/summary`, { token: P });
    ok(r.s === 200 && r.b.records.some((x) => x.system === 'Siddha' && x.medicines.some((m) => /Chooranam/.test(m.name))), 'patient sees the Siddha prescription');

    sec('6. Appointments');
    const when = new Date(Date.now() + 3 * 86400000); when.setUTCHours(5, 0, 0, 0);
    r = await j('/v1/records', { token: P }); // route reachable
    r = await j('/v1/clinical/appointments', { token: P, json: { patientId: HID, doctorId: DCODE, system: 'Siddha', scheduledAt: when.toISOString(), mode: 'In-person', reason: 'Siddha consultation' } });
    ok(r.s === 201, 'patient books a Siddha appointment', JSON.stringify(r.b));
    r = await j(`/v1/clinical/doctors/${DCODE}/appointments`, { token: D });
    ok(r.s === 200 && JSON.stringify(r.b).includes('Siddha consultation'), 'doctor sees the appointment request', JSON.stringify(r.b).slice(0, 200));

    sec('7. Patient timeline');
    const tl = await until(async () => { const t = await j(`/v1/patients/${HID}/timeline`, { token: P }); return t.s === 200 && t.b.items.some((i) => /Noi Naadal/.test(i.title || '')) ? t : null; }, 20000);
    ok(!!tl, 'timeline shows the Siddha assessments from the event bus', tl ? '' : 'no Noi Naadal item');
    ok(tl && !AYURVEDA_TERMS.test(JSON.stringify(tl.b.items.filter((i) => i.system === 'Siddha'))), 'Siddha timeline items contain no Ayurveda terms');
  } catch (e) { ok(false, 'test run crashed', e.stack || e.message); }

  kids.forEach((k) => k.kill());
  const pass = results.filter((x) => x.pass).length; const fail = results.length - pass;
  console.log(`\n${pass} passed, ${fail} failed`);
  try { fs.rmSync(DATA_ROOT, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(fail ? 1 : 0);
})();
