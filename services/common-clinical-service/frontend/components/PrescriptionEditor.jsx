import { useState } from 'react';
import { platform } from '@shared/api/client';
import { errorText } from '../utils/download';

// Doctor edits a saved prescription (medicines, advice, problem, diagnosis). Saves as a NEW version; version 1 (the original) is never changed.
const blank = { name: '', dose: '', timing: '', duration: '' };

export default function PrescriptionEditor({ record, onSaved, onCancel, create }) {
  // create = { healthId, system }: issue a NEW prescription (doctor adds medicines during a consultation). Otherwise `record` is updated as a new version.
  record = record || { medicines: [], advice: '', problem: '', diagnosis: '' };
  const [medicines, setMedicines] = useState(() => {
    const m = (record.medicines || []).filter((x) => x.name).map((x) => ({ name: x.name || '', dose: x.dose || '', timing: x.timing || '', duration: x.duration || '' }));
    return m.length ? m : [{ ...blank }];
  });
  const [advice, setAdvice] = useState(record.advice || '');
  const [problem, setProblem] = useState(record.problem || '');
  const [diagnosis, setDiagnosis] = useState(record.diagnosis || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');

  const setMed = (i, k, v) => setMedicines((p) => p.map((m, n) => (n === i ? { ...m, [k]: v } : m)));
  const save = async () => {
    setBusy(true); setError('');
    try {
      const meds = medicines.filter((m) => m.name.trim() || m.dose.trim() || m.timing.trim() || m.duration.trim());
      if (create && !meds.some((m) => m.name.trim())) { setError('Add at least one medicine name.'); setBusy(false); return; }
      const r = create
        ? await platform.post('/records', { healthId: create.healthId, system: create.system, documentType: 'Doctor prescription', problem, diagnosis, medicines: meds, advice }, { headers: { 'Idempotency-Key': key } })
        : await platform.put(`/records/${encodeURIComponent(record.recordId)}/prescription`, { medicines: meds, advice, problem, diagnosis, note, baseVersion: record.prescriptionVersion || 1 });
      onSaved(r.data);
    } catch (e) { setError(await errorText(e, 'Could not save the updated prescription. Please retry.')); } finally { setBusy(false); }
  };

  return (
    <div className="rxedit">
      <h4>{create ? 'Medicines (new prescription)' : 'Update prescription'}</h4>
      <label>Problem<input value={problem} maxLength={1000} onChange={(e) => setProblem(e.target.value)} /></label>
      <label>Diagnosis<input value={diagnosis} maxLength={1000} onChange={(e) => setDiagnosis(e.target.value)} /></label>
      <table className="tbl">
        <thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>For how long</th><th /></tr></thead>
        <tbody>{medicines.map((m, i) => (
          <tr key={i}>
            {['name', 'dose', 'timing', 'duration'].map((k) => (
              <td key={k}><input aria-label={k} value={m[k]} maxLength={k === 'name' ? 120 : 80} onChange={(e) => setMed(i, k, e.target.value)} /></td>
            ))}
            <td><button type="button" className="linkbtn" onClick={() => setMedicines((p) => p.filter((_, n) => n !== i))}>Remove</button></td>
          </tr>
        ))}</tbody>
      </table>
      <button type="button" className="secondary" onClick={() => setMedicines((p) => [...p, { ...blank }])}>+ Add medicine</button>
      <label>Advice<textarea rows={3} maxLength={2000} value={advice} onChange={(e) => setAdvice(e.target.value)} /></label>
      {!create && <label>Reason for the change (optional, the patient can see this)<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>}
      {error && <div className="banner err">{error}</div>}
      <div style={{ marginTop: 10 }}>
        <button type="button" disabled={busy} onClick={save}>{busy ? 'Saving...' : create ? 'Save medicines as prescription' : 'Save updated prescription'}</button>{' '}
        {onCancel && <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
