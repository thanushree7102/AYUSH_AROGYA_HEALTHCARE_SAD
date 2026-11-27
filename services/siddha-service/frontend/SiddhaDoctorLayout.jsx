// Siddha consultation screen: sidebar + the Siddha forms. Mounted by the shell at /siddha/consultations/:id/*
// The forms (Mukkutram & Udal Thegi, Envagai Thervu, Noi Naadal, Maruthuvam, Follow-up) are loaded from the Siddha service itself (GET /v1/siddha/forms).
import { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import TopBar from '@shared/components/TopBar';
import FormPage from '@shared/components/FormPage';
import usePrefill from '@shared/hooks/usePrefill';
import CommonClinical from '@clinical/components/CommonClinical';
import ConsultationMedicines from '@clinical/components/ConsultationMedicines';
import { forSystem } from '@shared/api/client';
import { getActivePatient, getSession } from '@shared/utils/session';

export const FIRST_PART = 'mukkutram';

function SiddhaForm({ api, def }) {
  const prefill = usePrefill(def.id);
  return (
    <FormPage key={def.id} api={api} title={def.label} endpoint={def.id} fields={def.fields}
      requiredRole={def.practitionerOnly ? 'practitioner' : undefined} prefill={prefill} />
  );
}

export default function SiddhaDoctorLayout() {
  const { id } = useParams();
  const nav = useNavigate();
  const s = getSession();
  const patient = getActivePatient();
  const api = useMemo(() => forSystem('siddha'), []);
  const [defs, setDefs] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setDefs(null); setErr('');
    api.get('/forms').then((r) => setDefs(r.data)).catch(() => setErr('Could not load the Siddha forms. Please retry.'));
  }, [api]);
  if (!s || s.role !== 'practitioner' || !patient) return <Navigate to="/doctor" replace />;
  const base = `/siddha/consultations/${id}`;
  const parts = defs?.parts || [];

  return (
    <>
      <TopBar />
      <div className="layout">
        <aside className="sidebar">
          <h2>Siddha</h2>
          <NavLink to={`${base}/common-clinical`}>Common clinical</NavLink>
          {parts.map((p, i) => <NavLink key={p.id} to={`${base}/${p.id}`}>{i + 1}. {p.label}</NavLink>)}
          {defs && <NavLink to={`${base}/medicines`}>{parts.length + 1}. Marunthu (Prescription)</NavLink>}
        </aside>
        <main className="main">
          <div className="header">
            <div><strong>Patient:</strong> {patient.name} ({patient.healthId}) &nbsp;|&nbsp; <strong>Consultation:</strong> {id}</div>
            <button type="button" className="secondary" onClick={() => nav('/doctor')}>Change patient</button>
          </div>
          {err && <div className="banner err">{err}</div>}
          {!defs && !err && <p className="muted">Loading Siddha forms…</p>}
          {defs && (
            <Routes>
              <Route path="common-clinical" element={<CommonClinical healthId={patient.healthId} view="all" />} />
              <Route path="medicines" element={<ConsultationMedicines healthId={patient.healthId} system="Siddha" />} />
              {parts.map((p) => <Route key={p.id} path={p.id} element={<SiddhaForm api={api} def={p} />} />)}
              <Route path="*" element={<Navigate to={parts[0]?.id || FIRST_PART} replace />} />
            </Routes>
          )}
        </main>
      </div>
    </>
  );
}
