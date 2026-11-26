import useSummary from '@shared/hooks/useSummary';
import { getSession } from '@shared/utils/session';
import { formatIST } from '@shared/utils/time';
import DownloadButton from '../../components/DownloadButton';
import { rxPdfName, rxPdfPath } from '../../utils/download';

export default function Uploads() {
  const s = useSummary(getSession().healthId);
  if (s.loading) return <div className="card"><p>Loading...</p></div>;
  if (s.error) return <div className="card"><div className="banner err">{s.error} {s.retry && <button type="button" onClick={s.reload}>Retry</button>}</div></div>;
  const ups = [...s.data.uploads].reverse();
  return (
    <div className="card">
      <h3>My uploads</h3>
      {ups.length === 0 ? <p className="muted">Nothing uploaded yet.</p> : (
        <table className="tbl"><thead><tr><th>File</th><th>Type</th><th>Added</th><th>Prescription</th></tr></thead>
          <tbody>{ups.map((u, i) => <tr key={i}><td>{u.fileName}</td><td>{u.documentType}</td><td>{formatIST(u.savedAt)}</td>
            <td>
              {u.recordId ? (
                <>
                  <DownloadButton path={rxPdfPath(u.recordId)} fileName={rxPdfName(u.recordId, u.prescriptionVersion)}>Download prescription</DownloadButton>
                  {u.edited && <div className="muted">Updated by {u.updatedBy || 'your doctor'}{u.updatedAt ? ` · ${formatIST(u.updatedAt)}` : ''} (version {u.prescriptionVersion}). <DownloadButton className="linkbtn" path={`/records/${encodeURIComponent(u.recordId)}/file`} fileName={u.fileName || 'original-prescription'}>Original file</DownloadButton></div>}
                </>
              ) : (
                <DownloadButton path={`/records/uploads/${encodeURIComponent(u.uploadId)}/download`} fileName={u.fileName || 'prescription'}>Download</DownloadButton>
              )}
            </td></tr>)}</tbody></table>
      )}
    </div>
  );
}
