import { useState } from 'react';
import useSummary from '@shared/hooks/useSummary';
import PrescriptionEditor from './PrescriptionEditor';
import { One } from './DoctorPrescriptions';

// "Medicines" tab of every AYUSH consultation screen. The doctor writes the medicines here; they are saved as a doctor-issued prescription
// that shows up in Common clinical -> Prescriptions (update + PDF download) and in the patient's own pages.
export default function ConsultationMedicines({ healthId, system }) {
  const s = useSummary(healthId);
  const [more, setMore] = useState(false);
  if (s.loading) return <div className="card"><p>Loading...</p></div>;
  if (s.error) return <div className="card"><div className="banner err">{s.error} {s.retry && <button type="button" onClick={s.reload}>Retry</button>}</div></div>;
  const mine = [...s.data.records].reverse().filter((r) => r.system === system && r.issuedByCode);
  return (
    <div className="card">
      <h3>Medicines &amp; prescription ({system})</h3>
      <p className="muted">Medicines saved here become the patient's prescription. You can update and download them any time, and the patient sees every update.</p>
      {mine.map((r) => <One key={r.recordId} record={r} onChanged={s.refresh} />)}
      {(mine.length === 0 || more) ? (
        <PrescriptionEditor key={mine.length} create={{ healthId, system }} onCancel={mine.length ? () => setMore(false) : undefined}
          onSaved={() => { setMore(false); s.refresh(); }} />
      ) : <button type="button" className="secondary" onClick={() => setMore(true)}>+ Issue another prescription</button>}
    </div>
  );
}
