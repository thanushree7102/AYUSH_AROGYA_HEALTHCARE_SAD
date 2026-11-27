import { THEGI_OPTIONS } from '../constants/options';
import { getActivePatient } from '../utils/session';

// Siddha doctor forms are pre-filled from the patient's last read prescription (the doctor reviews before saving).
const HUMOUR = { vali: 'Vali', vatham: 'Vali', vata: 'Vali', azhal: 'Azhal', pitham: 'Azhal', pitta: 'Azhal', iyam: 'Iyya', iyyam: 'Iyya', iyya: 'Iyya', kabam: 'Iyya', kapham: 'Iyya', kapha: 'Iyya' };
export function toThegi(text) {
  const found = [];
  String(text || '').toLowerCase().split(/[^a-z]+/).forEach((w) => { const h = HUMOUR[w]; if (h && !found.includes(h)) found.push(h); });
  if (!found.length) return '';
  const guess = found.length >= 3 ? 'Thontham (Mukkutra Samam)' : `${found.join('-')} Thegi`;
  return THEGI_OPTIONS.includes(guess) ? guess : '';
}

// kind = the Siddha form id: 'mukkutram' | 'envagai-thervu' | 'diagnosis' | 'maruthuvam'
export default function usePrefill(kind) {
  const p = getActivePatient();
  const x = p && p.extracted;
  if (!x) return undefined;
  const meds = (x.medicines || []).map((m) => [m.name, m.dose, m.timing, m.duration].filter(Boolean).join(' ')).join('; ');
  if (kind === 'mukkutram') return { udalThegi: toThegi(x.prakriti) };
  if (kind === 'envagai-thervu') return { chiefComplaint: x.problem || '' };
  if (kind === 'diagnosis') return { diagnosis: x.diagnosis || '', notes: x.problem ? `Complaints: ${x.problem}` : '' };
  if (kind === 'maruthuvam') return { internal: meds, pathiyam: x.advice || '' };
  return undefined;
}
