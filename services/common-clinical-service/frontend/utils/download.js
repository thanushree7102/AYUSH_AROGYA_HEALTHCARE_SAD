import { platform } from '@shared/api/client';

// Authenticated file download: the browser cannot send the Bearer token with a plain link, so the file is fetched as a blob
// through the gateway and saved from memory. Errors come back as JSON text inside the blob; turn them into a message.
export async function fetchBlob(path) {
  const r = await platform.get(path, { responseType: 'blob', timeout: 60000 });
  return r.data;
}

export async function errorText(err, fallback = 'Could not complete the request. Please retry.') {
  const d = err?.response?.data;
  try {
    if (d instanceof Blob) { const j = JSON.parse(await d.text()); return j.message || fallback; }
    return d?.message || fallback;
  } catch (e) { return fallback; }
}

export async function saveFile(path, fileName) {
  const blob = await fetchBlob(path);
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

export const rxPdfPath = (recordId, version) => `/records/${encodeURIComponent(recordId)}/prescription/download${version ? `?version=${version}` : ''}`;
export const rxPdfName = (recordId, version) => `prescription-${recordId}${version ? `-v${version}` : ''}.pdf`;
