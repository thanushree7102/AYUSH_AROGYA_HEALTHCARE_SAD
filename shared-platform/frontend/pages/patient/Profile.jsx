import { useCallback, useEffect, useState } from 'react';
import { platform } from '../../api/client';
import Field from '../../components/Field';
import { getSession } from '../../utils/session';
import { formatIST } from '../../utils/time';

const concernFields = [
  { name: 'symptoms', label: 'What is your wellness goal or concern?', type: 'textarea', required: true },
  { name: 'duration', label: 'How long have you had this concern? (optional)' },
  { name: 'notes', label: 'Any injury, movement limitation or note for your yoga instructor? (optional)', type: 'textarea' },
];
const blank = (fs) => Object.fromEntries(fs.map((f) => [f.name, '']));

// Yoga wellness goals and relevant movement-safety notes live on the patient profile.
function Section({ title, fields, endpoint, onSaved }) {
  const s = getSession();
  const [v, setV] = useState(blank(fields));
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (ev) => {
    ev.preventDefault();
    setBusy(true); setErrors({}); setMsg(null);
    try {
      await platform.post(`/patients/${s.healthId}/${endpoint}`, v);
      setV(blank(fields)); setMsg({ ok: true, text: 'Saved.' }); onSaved();
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      setMsg({ ok: false, text: err.response?.data?.message || 'Could not save. Please retry.' });
    } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <h3>{title}</h3>
      {msg && <div className={`banner ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <form onSubmit={save} noValidate>
        {fields.map((f) => <Field key={f.name} field={f} value={v[f.name]} error={errors[f.name]} onChange={(n, val) => { setV((p) => ({ ...p, [n]: val })); setMsg(null); }} />)}
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      </form>
    </div>
  );
}

export default function Profile() {
  const s = getSession();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    platform.get(`/patients/${s.healthId}/profile`).then((r) => setP(r.data)).catch(() => setError('Could not load your profile.'));
  }, [s.healthId]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="card">
        <h3>My profile</h3>
        {error && <div className="banner err">{error}</div>}
        {p && (
          <>
            <p><strong>{p.name}</strong> · {p.healthId}</p>
            <p className="muted">{[p.gender, p.dob, [p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No other details added.'}</p>
            {p.emergencyContacts.map((c, i) => <p key={i} className="muted">Emergency contact: {c.name}{c.relationship ? ` (${c.relationship})` : ''} · {c.phone}</p>)}
            {p.identity.map((i, k) => <p key={k} className="muted">{i.documentType ? `${i.documentType} ${i.masked || ''}` : ''}{i.abha ? ` ABHA ${i.abha}` : ''} · {i.status}</p>)}
          </>
        )}
      </div>
      <Section title="Yoga wellness profile" fields={concernFields} endpoint="health-concerns" onSaved={load} />
      {p?.concerns.length > 0 && (
        <div className="card"><h3>Your wellness goals and notes</h3>
          {p.concerns.map((c) => (
            <div className="tl" key={c.id}>
              <div className="muted">{formatIST(c.recordedAt)}{c.duration ? ` · ${c.duration}` : ''}</div>
              <div>{c.symptoms}</div>{c.notes && <div className="muted">{c.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
