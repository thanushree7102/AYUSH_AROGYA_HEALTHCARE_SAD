import { useCallback, useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { platform } from '../../api/client';
import TopBar from '../../components/TopBar';
import { getSession } from '../../utils/session';

export default function DoctorAppointments() {
  const session = getSession();
  const doctorId = session?.code || session?.doctorId || session?.doctorCode;
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    if (!doctorId) return;
    const r = await platform.get(`/clinical/doctors/${encodeURIComponent(doctorId)}/appointments`);
    setItems(Array.isArray(r.data) ? r.data : (r.data?.appointments || []));
  }, [doctorId]);
  useEffect(() => { load().catch(() => setError('Could not load appointment requests. Check your login and service connection.')); }, [load]);
  if (!session || session.role !== 'practitioner') return <Navigate to="/" replace />;
  const update = async (item, status) => {
    setBusyId(item.appointmentId); setError(''); setMessage('');
    try {
      await platform.patch(`/clinical/appointments/${encodeURIComponent(item.appointmentId)}`, { status });
      setMessage(status === 'Confirmed' ? 'Appointment confirmed.' : status === 'Completed' ? 'Appointment marked completed.' : 'Appointment declined/cancelled.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Could not update appointment.'); }
    finally { setBusyId(''); }
  };
  const date = (v) => v ? new Date(v).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' }) : 'Not scheduled';
  const pending = items.filter(x => x.status === 'Booked');
  const others = items.filter(x => x.status !== 'Booked');
  return <>
    <TopBar />
    <main className="container">
      <section className="card">
        <div className="row between" style={{alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div><h2>Doctor appointment dashboard</h2><p className="muted">Review requests booked with your doctor account.</p></div>
          <Link className="pill" to="/doctor">Find patient</Link>
        </div>
        {error && <div className="banner err" role="alert">{error}</div>}
        {message && <div className="banner ok" role="status">{message}</div>}
        <h3>Pending requests ({pending.length})</h3>
        {pending.length === 0 ? <p className="muted">No pending appointment requests.</p> : <div className="stack">
          {pending.map(a => <article className="card" key={a.appointmentId}>
            <div className="row between"><strong>{a.patientName || 'Patient name unavailable'}</strong><span className="badge">{a.status}</span></div>
            <p><strong>Patient ID:</strong> {a.healthId || a.patientId}</p>
            <p><strong>Service:</strong> {a.system} · <strong>Date:</strong> {date(a.scheduledAt)}</p>
            <p><strong>Mode:</strong> {a.mode} · <strong>Duration:</strong> {a.durationMinutes} min</p>
            <p><strong>Reason:</strong> {a.reason || 'Not provided'}</p>
            <div className="row" style={{gap:8,flexWrap:'wrap'}}>
              <button disabled={busyId===a.appointmentId} onClick={() => update(a,'Confirmed')}>Accept appointment</button>
              <button className="secondary" disabled={busyId===a.appointmentId} onClick={() => update(a,'Cancelled')}>Decline</button>
            </div>
          </article>)}
        </div>}
        <h3>Appointment history</h3>
        {others.length === 0 ? <p className="muted">No previous appointments.</p> : <div className="stack">
          {others.map(a => <article className="card" key={a.appointmentId}>
            <div className="row between"><strong>{a.patientName || 'Patient name unavailable'}</strong><span className="badge">{a.status}</span></div>
            <p>{a.healthId || a.patientId} · {a.system} · {date(a.scheduledAt)}</p>
            <p className="muted">{a.reason || 'No reason provided'}</p>
            {a.status === 'Confirmed' && <button className="secondary" disabled={busyId===a.appointmentId} onClick={() => update(a,'Completed')}>Mark completed</button>}
          </article>)}
        </div>}
      </section>
    </main>
  </>;
}
