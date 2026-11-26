import { useNavigate } from 'react-router-dom';

import { DOMAIN_LIST } from '../../domains';

export default function Services() {
  const nav = useNavigate();
  return (
    <div className="card">
      <h2>Explore Yoga & Naturopathy</h2>
      <p className="muted">Explore wellness options focused on yoga, pranayama, meditation and naturopathy. You can upload your health documents and keep your Yoga & Naturopathy records together.</p>
      <div className="servicegrid">
        {DOMAIN_LIST.map((service) => (
          <article className="servicecard" key={service.key}>
            <div className="serviceicon" aria-hidden="true">{service.icon}</div>
            <h3>{service.label}</h3>
            <p className="muted">{service.desc}</p>
            <button type="button" onClick={() => nav(`/patient/add?system=${encodeURIComponent(service.label)}`)}>
              Explore {service.label}
            </button>
          </article>
        ))}
      </div>
      <p className="muted servicefoot">Build a healthy routine with guided yoga practices, breathing exercises, meditation and naturopathy-based wellness support.</p>
    </div>
  );
}
