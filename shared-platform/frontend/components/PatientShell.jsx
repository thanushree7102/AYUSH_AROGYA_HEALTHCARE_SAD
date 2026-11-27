import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import { useLang } from '../i18n';
import { getSession } from '../utils/session';
import { platform } from '../api/client';

const tabs = [['services', 'AYUSH Services'], ['appointments', 'Appointments'], ['add', 'Add record'], ['timeline', 'Timeline'], ['medicines', 'Medicines'], ['uploads', 'Reports & notifications'], ['profile', 'Profile'], ['privacy', 'Privacy']];

export default function PatientShell() {
  const s = getSession();
  const { t } = useLang();
  const [unread,setUnread]=useState(0);
  useEffect(()=>{if(s?.healthId)platform.get(`/clinical/patients/${encodeURIComponent(s.healthId)}/notifications`).then(r=>setUnread(r.data.unread||0)).catch(()=>{});},[s?.healthId]);
  if (!s || s.role !== 'patient') return <Navigate to="/" replace />;
  return (
    <>
      <TopBar />
      <nav className="pills">
        {tabs.map(([p, l]) => (
          <NavLink key={p} to={`/patient/${p}`} className={({ isActive }) => `pill${isActive ? ' on' : ''}`}>{t(l)}{p==='uploads'&&unread>0?` (${unread})`:''}</NavLink>
        ))}
      </nav>
      <div className="container"><Outlet /></div>
    </>
  );
}
