import { useState } from 'react';
import { errorText, saveFile } from '../utils/download';

// One small download button with its own busy / error state. `path` is a gateway path (see utils/download.js).
export default function DownloadButton({ path, fileName, children, className = 'secondary' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await saveFile(path, fileName); } catch (e) { setErr(await errorText(e, 'Download failed. Please retry.')); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={go}>{busy ? 'Downloading...' : children}</button>
      {err && <span className="dl-err">{err}</span>}
    </>
  );
}
