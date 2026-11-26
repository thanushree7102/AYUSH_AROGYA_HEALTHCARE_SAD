import { useEffect, useState } from 'react';
import { formatIST } from '@shared/utils/time';
import DownloadButton from './DownloadButton';
import PrescriptionEditor from './PrescriptionEditor';
import PrescriptionHistory from './PrescriptionHistory';
import { errorText, fetchBlob, rxPdfName, rxPdfPath } from '../utils/download';

// Doctor side of "prescriptions": view / download the file the patient uploaded, and download the prescription as a PDF.
// Rendered inside CommonClinical (the doctor's "Common clinical" tab).

function OriginalFile({ recordId, fileName }) {
  const [state, setState] = useState({ busy: false });
  const [shown, setShown] = useState(false);
  useEffect(() => () => { if (state.url) URL.revokeObjectURL(state.url); }, [state.url]);
  const open = async () => {
    if (shown) { setShown(false); return; }
    setState({ busy: true });
    try { const blob = await fetchBlob(`/records/${encodeURIComponent(recordId)}/file`); setState({ url: URL.createObjectURL(blob), type: blob.type }); setShown(true); } catch (e) { setState({ error: await errorText(e) }); }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="secondary" disabled={state.busy} onClick={open}>{shown ? 'Hide uploaded prescription' : state.busy ? 'Opening...' : 'View uploaded prescription'}</button>{' '}
      <DownloadButton path={`/records/${encodeURIComponent(recordId)}/file`} fileName={fileName || 'uploaded-prescription'}>Download original file</DownloadButton>
      {state.error && <div className="banner err" style={{ marginTop: 8 }}>{state.error}</div>}
      {shown && state.url && (/^image\//.test(state.type)
        ? <img className="rxprev" src={state.url} alt="Prescription uploaded by the patient" />
        : <p className="muted">This is a PDF. <a href={state.url} target="_blank" rel="noreferrer">Open it in a new tab</a>.</p>)}
    </div>
  );
}

export function One({ record, onChanged }) {
  const meds = (record.medicines || []).filter((m) => m.name);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [done, setDone] = useState('');
  const [tick, setTick] = useState(0);
  const saved = (r) => { setEditing(false); setDone(`Saved as version ${r.version}. The patient can now see and download it.`); setTick((n) => n + 1); onChanged?.(); };
  return (
    <div className="tl">
      <div className="tl-head">
        <span className="badge">{record.system}</span> <span className="muted">{record.documentType} · {formatIST(record.savedAt)}</span>
        {record.edited && <> <span className="badge upd">Updated · v{record.prescriptionVersion}</span></>}
      </div>
      {record.edited && <div className="muted">Updated by {record.updatedBy || 'a doctor'}{record.updatedAt ? ` · ${formatIST(record.updatedAt)}` : ''}{record.updateSummary ? ` — ${record.updateSummary}` : ''}</div>}
      {done && <div className="banner ok">{done}</div>}
      {editing ? (
        <PrescriptionEditor record={record} onCancel={() => setEditing(false)} onSaved={saved} />
      ) : (
        <>
          {record.problem && <div><strong>Problem:</strong> {record.problem}</div>}
          {record.diagnosis && <div><strong>Diagnosis:</strong> {record.diagnosis}</div>}
          {meds.length > 0 ? (
            <table className="tbl"><thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>For</th></tr></thead>
              <tbody>{meds.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.dose}</td><td>{m.timing}</td><td>{m.duration}</td></tr>)}</tbody></table>
          ) : <p className="muted">No medicines listed.</p>}
          {record.advice && <div><strong>Advice:</strong> {record.advice}</div>}
        </>
      )}
      {record.hasFile && <OriginalFile recordId={record.recordId} fileName={record.fileName} />}
      {!editing && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => { setDone(''); setEditing(true); }}>Update prescription</button>{' '}
          <DownloadButton path={rxPdfPath(record.recordId)} fileName={rxPdfName(record.recordId, record.prescriptionVersion)}>{record.edited ? 'Download updated prescription (PDF)' : 'Download PDF'}</DownloadButton>
          {record.edited && <>{' '}<button type="button" className="linkbtn" onClick={() => setHistory((h) => !h)}>{history ? 'Hide versions' : 'All versions'}</button></>}
        </div>
      )}
      {history && record.edited && <PrescriptionHistory recordId={record.recordId} reloadKey={tick} />}
    </div>
  );
}

export default function DoctorPrescriptions({ records, onChanged }) {
  return (
    <div className="card">
      <h3>Prescriptions</h3>
      <p className="muted">View the prescription the patient uploaded, update it (the patient sees every update), and download the latest prescription as a PDF.</p>
      {records.length === 0 && <p className="muted">No prescriptions yet.</p>}
      {records.map((r) => <One key={r.recordId} record={r} onChanged={onChanged} />)}
    </div>
  );
}
