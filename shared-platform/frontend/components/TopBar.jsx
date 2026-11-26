import { Link, useNavigate } from 'react-router-dom';
import { useLang } from '../i18n';
import { clearSession, getSession } from '../utils/session';
import LangSwitch from './LangSwitch';

export default function TopBar() {
  const nav = useNavigate();
  const { t } = useLang();
  const s = getSession();
  // Older browser sessions may still contain the previous Ayurveda demo display name.
  const displayName = s?.name === 'Dr. Ayurveda Demo' ? 'Dr. Yoga Demo' : s?.name;
  return (
    <header className="topbar">
      <div className="brand"><Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>🌿 {t('Yoga & Naturopathy Wellness')}</Link></div>
      <div className="who">
        <LangSwitch />
        <Link to="/assistant" className="toplink">🗣️ {t('Speak & translate')}</Link>
        {s && (
          <>
            <Link to="/me" className="toplink">{displayName}{s.healthId ? ` · ${s.healthId}` : ''}</Link>
            <button type="button" className="ghost" onClick={() => { clearSession(); nav('/'); }}>{t('Sign out')}</button>
          </>
        )}
      </div>
    </header>
  );
}
