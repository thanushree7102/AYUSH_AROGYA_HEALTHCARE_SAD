import { useEffect, useMemo, useState } from 'react';
import { platform } from '../../api/client';
import { getSession } from '../../utils/session';
import { DOMAIN_LIST } from '../../domains';

const toIso = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export default function Appointments() {
  const session = getSession();
  const system = DOMAIN_LIST?.[0]?.label || (import.meta.env.VITE_APP_SYSTEM || 'AYUSH');
  const [doctors, setDoctors] = useState([]);
  const [items, setItems] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [mode, setMode] = useState('In-person');
  const [reason, setReason] = useState('General consultation');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const patientId = session?.healthId || session?.patientId || session?.id;
  const load = async () => {
    if (!patientId) return;
    const [appointments, doctorResponse] = await Promise.all([
      platform.get(`/clinical/patients/${encodeURIComponent(patientId)}/appointments`),
      platform.get('/doctors')
    ]);
    setItems(Array.isArray(appointments.data) ? appointments.data : (appointments.data?.appointments || []));
    const available = Array.isArray(doctorResponse.data) ? doctorResponse.data : (doctorResponse.data?.doctors || []);
    setDoctors(available.filter((doctor) => !doctor.system || doctor.system === system));
  };

  useEffect(() => {
    load().catch(() => setError('Appointments could not be loaded. Check your login and service connection.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upcoming = useMemo(() => items.filter((a) => !['Cancelled', 'Completed', 'No-show'].includes(a.status)), [items]);
  const book = async (event) => {
    event.preventDefault();
    setError(''); setMessage('');
    if (!patientId) return setError('Patient ID is missing from your session. Please sign in again.');
    if (!doctorId || !scheduledAt) return setError('Choose a doctor and appointment date/time.');
    const iso = toIso(scheduledAt);
    if (!iso || new Date(iso) <= new Date()) return setError('Choose a future appointment time.');
    setBusy(true);
    try {
      await platform.post('/clinical/appointments', {
        patientId, patientName: session?.name || '', doctorId, system, scheduledAt: iso,
        durationMinutes: Number(durationMinutes), mode, reason
      });
      setMessage('Appointment request submitted successfully.');
      setDoctorId(''); setScheduledAt('');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || 'Booking failed. The doctor may already have an appointment at this time.');
    } finally { setBusy(false); }
  };

  const cancel = async (id) => {
    setError(''); setMessage('');
    try {
      await platform.patch(`/clinical/appointments/${encodeURIComponent(id)}`, { status: 'Cancelled' });
      setMessage('Appointment cancelled.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Could not cancel this appointment.'); }
  };

  const dateLabel = (value) => value ? new Date(value).toLocaleString() : 'Time not set';
  return (
    <section className="card">
      <h2>Appointments</h2>
      <p className="muted">Book and manage your {system} consultations. Your appointment is linked to your AYUSH patient identity.</p>
      {message && <div className="banner ok" role="status">{message}</div>}
      {error && <div className="banner err" role="alert">{error}</div>}
      <form onSubmit={book}>
        <div className="field">
          <label htmlFor="appointment-doctor">Choose doctor</label>
          <select id="appointment-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
            <option value="">Select a doctor</option>
            {doctors.map((doctor) => <option key={doctor.id || doctor.doctorId} value={doctor.code || doctor.doctorCode || doctor.id || doctor.doctorId}>{doctor.name || doctor.fullName} {doctor.specialization ? `· ${doctor.specialization}` : ''}</option>)}
          </select>
          {doctors.length === 0 && <small className="muted">No matching doctor is currently listed. Check doctor registration and service availability.</small>}
        </div>
        <div className="field">
          <label htmlFor="appointment-time">Date and time</label>
          <input id="appointment-time" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="appointment-duration">Duration</label>
          <select id="appointment-duration" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)}>
            <option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="appointment-mode">Consultation mode</label>
          <select id="appointment-mode" value={mode} onChange={(e) => setMode(e.target.value)}><option>In-person</option><option>Video</option><option>Audio</option></select>
        </div>
        <div className="field">
          <label htmlFor="appointment-reason">Reason for visit</label>
          <textarea id="appointment-reason" rows="2" value={reason} onChange={(e) => setReason(e.target.value)} maxLength="500" />
        </div>
        <button type="submit" disabled={busy || doctors.length === 0}>{busy ? 'Submitting…' : 'Book appointment'}</button>
      </form>
      <hr />
      <h3>My appointments</h3>
      {items.length === 0 ? <p className="muted">No appointments found yet.</p> : (
        <div className="stack">
          {items.map((item) => (
            <article className="card" key={item.appointmentId || item.id}>
              <div className="row between">
                <strong>{item.system || system} consultation</strong>
                <span className="badge">{item.status || 'Requested'}</span>
              </div>
              <p>{dateLabel(item.scheduledAt)} · {item.mode || 'In-person'} · {item.durationMinutes || 30} min</p>
              <p className="muted">{item.reason || 'Consultation'} {item.doctorName ? `· ${item.doctorName}` : ''}</p>
              {upcoming.some((a) => (a.appointmentId || a.id) === (item.appointmentId || item.id)) && (
                <button type="button" className="secondary" onClick={() => cancel(item.appointmentId || item.id)}>Cancel appointment</button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
