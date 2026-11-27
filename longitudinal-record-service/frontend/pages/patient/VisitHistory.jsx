import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { platform } from '@shared/api/client';
import { formatIST } from '@shared/utils/time';
import { getSession } from '@shared/utils/session';
import DownloadButton from '@clinical/components/DownloadButton';
import { rxPdfName, rxPdfPath } from '@clinical/utils/download';

// Medical / visit history on the patient's profile: doctors seen, consultation dates, prescriptions and doctors' updates, newest first.
// Built by the Longitudinal Record service (GET /patients/:id/visit-history) from the clinical service and the doctor directory.
const day = (d) => (String(d).length === 10 ? dayjs(d).format('DD MMM YYYY') : formatIST(d));
const LABEL = { visit: 'Doctor visit', prescription: 'Prescription', prescription_update: 'Prescription updated' };
const doctorLine = (d) => [d.system, (d.qualifications || []).join(', '), d.experienceYears ? `${d.experienceYears} yrs experience` : '', d.city].filter(Boolean).join(' · ');

export default function VisitHistory() {
  const s = getSession();
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => {
    platform.get(`/patients/${s.healthId}/visit-history`).then((r) => setD(r.data)).catch(() => setErr('Could not load your visit history. Please retry in a moment.'));
  }, [s.healthId]);

  return (
    <div className="card">
      <h3>Medical and visit history</h3>
      {err && <div className="banner err">{err}</div>}
      {!d && !err && <p className="muted">Loading...</p>}
      {d && !d.clinicalAvailable && <div className="banner info">Your visit history is temporarily unavailable. Please try again in a moment.</div>}
      {d && d.clinicalAvailable && !d.doctorDetailsAvailable && <p className="muted">Some doctor details could not be loaded right now; names saved with each visit are shown.</p>}
      {d && d.clinicalAvailable && d.items.length === 0 && <p className="muted">No visits yet. When a doctor works on your record or updates your prescription, it appears here.</p>}

      {d && d.doctors.length > 0 && (
        <>
          <h4>Doctors you have visited</h4>
          {d.doctors.map((x) => (
            <div className="tl" key={x.code}>
              <div><strong>{x.name}</strong> <span className="muted">({x.code})</span></div>
              {doctorLine(x) && <div className="muted">{doctorLine(x)}</div>}
              <div className="muted">{x.visits} visit{x.visits === 1 ? '' : 's'} · first {day(x.firstVisit)} · last {day(x.lastVisit)}</div>
            </div>
          ))}
        </>
      )}

      {d && d.items.length > 0 && (
        <>
          <h4>Timeline</h4>
          {d.items.map((i) => (
            <div className="tl" key={i.id}>
              <div className="tl-head"><span className="badge">{LABEL[i.kind] || i.title}</span> <span className="muted">{day(i.date)}{i.system ? ` · ${i.system}` : ''}</span></div>
              {i.doctor && <div><strong>{i.kind === 'prescription_update' ? 'Updated by' : 'Doctor'}:</strong> {i.doctor.name}{i.doctor.system ? <span className="muted"> ({i.doctor.system})</span> : null}</div>}
              {i.kind === 'visit' && <div>{i.summary}{i.consultationId ? <span className="muted"> · Consultation {i.consultationId}</span> : null}</div>}
              {i.kind === 'prescription' && (
                <>
                  {i.problem && <div><strong>Problem:</strong> {i.problem}</div>}
                  {i.diagnosis && <div><strong>Diagnosis:</strong> {i.diagnosis}</div>}
                  {i.medicines?.some((m) => m.name) && <div><strong>Medicines:</strong> {i.medicines.filter((m) => m.name).map((m) => m.name).join(', ')}</div>}
                  {i.advice && <div><strong>Advice:</strong> {i.advice}</div>}
                  <div className="muted">{i.documentType || 'Record'}{i.version > 1 ? ` · now at version ${i.version}` : ''}</div>
                  <DownloadButton path={rxPdfPath(i.recordId)} fileName={rxPdfName(i.recordId, i.version)}>Download latest prescription</DownloadButton>
                </>
              )}
              {i.kind === 'prescription_update' && (
                <>
                  <div>Version {i.version}: {i.summary}</div>
                  {i.note && <div className="muted">Note: {i.note}</div>}
                  <DownloadButton path={rxPdfPath(i.recordId, i.version)} fileName={rxPdfName(i.recordId, i.version)}>Download version {i.version}</DownloadButton>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
