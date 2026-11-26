import { useEffect, useState } from 'react';
import { platform } from '@shared/api/client';
import { formatIST } from '@shared/utils/time';
import DownloadButton from './DownloadButton';
import { rxPdfName, rxPdfPath } from '../utils/download';

// Every version of one prescription, each with its own PDF download. Used by the doctor and by the patient.
export default function PrescriptionHistory({ recordId, reloadKey }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    setState({ loading: true });
    platform.get(`/records/${encodeURIComponent(recordId)}/prescription`).then((r) => setState({ data: r.data })).catch(() => setState({ error: 'Could not load the version history.' }));
  }, [recordId, reloadKey]);
  if (state.loading) return <p className="muted">Loading...</p>;
  if (state.error) return <div className="banner err">{state.error}</div>;
  return (
    <div className="rxhist">
      {state.data.versions.map((v) => (
        <div className="row" key={v.version} style={{ display: 'block', marginBottom: 6 }}>
          <strong>Version {v.version}</strong> {v.original ? '(original)' : '(updated)'} · {formatIST(v.at)}
          {!v.original && <> · by {v.changedBy.name || v.changedBy.code || 'doctor'}</>}
          {v.summary && !v.original && <div className="muted">{v.summary}{v.note ? ` — ${v.note}` : ''}</div>}
          {' '}<DownloadButton className="linkbtn" path={rxPdfPath(recordId, v.version)} fileName={rxPdfName(recordId, v.version)}>Download PDF</DownloadButton>
        </div>
      ))}
    </div>
  );
}
