import { useState } from 'react';
import { formatIST } from '@shared/utils/time';
import DownloadButton from './DownloadButton';
import PrescriptionHistory from './PrescriptionHistory';
import { rxPdfName, rxPdfPath } from '../utils/download';

// Patient side: the current prescription for each record. When a doctor has updated it, the patient sees who changed what and can download it.
function One({ r }) {
  const [history, setHistory] = useState(false);
  const meds = (r.medicines || []).filter((m) => m.name);
  return (
    <div className="tl">
      <div className="tl-head">
        <span className="badge">{r.system}</span> <span className="muted">{r.documentType} · {formatIST(r.savedAt)}</span>
        {r.edited && <> <span className="badge upd">Updated by doctor · v{r.prescriptionVersion}</span></>}
      </div>
      {r.edited && (
        <div className="banner info">
          Your doctor{r.updatedBy ? ` (${r.updatedBy})` : ''} updated this prescription{r.updatedAt ? ` on ${formatIST(r.updatedAt)}` : ''}.
          {r.updateSummary && <div>{r.updateSummary}</div>}
          {r.updateNote && <div>Note: {r.updateNote}</div>}
        </div>
      )}
      {r.problem && <div><strong>Problem:</strong> {r.problem}</div>}
      {r.diagnosis && <div><strong>Diagnosis:</strong> {r.diagnosis}</div>}
      {meds.length > 0 ? (
        <table className="tbl"><thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>For</th></tr></thead>
          <tbody>{meds.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.dose}</td><td>{m.timing}</td><td>{m.duration}</td></tr>)}</tbody></table>
      ) : <p className="muted">No medicines listed.</p>}
      {r.advice && <div><strong>Advice:</strong> {r.advice}</div>}
      <div style={{ marginTop: 8 }}>
        <DownloadButton path={rxPdfPath(r.recordId)} fileName={rxPdfName(r.recordId, r.prescriptionVersion)}>{r.edited ? 'Download updated prescription (PDF)' : 'Download prescription (PDF)'}</DownloadButton>
        {r.edited && <>{' '}<button type="button" className="linkbtn" onClick={() => setHistory((h) => !h)}>{history ? 'Hide earlier versions' : 'Earlier versions'}</button></>}
      </div>
      {history && <PrescriptionHistory recordId={r.recordId} />}
    </div>
  );
}

export default function PatientPrescriptions({ records }) {
  const withRx = records.filter((r) => r.recordId);
  return (
    <div className="card">
      <h3>My prescriptions</h3>
      {withRx.length === 0 && <p className="muted">No prescriptions yet.</p>}
      {withRx.map((r) => <One key={r.recordId} r={r} />)}
    </div>
  );
}
