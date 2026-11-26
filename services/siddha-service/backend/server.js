// Siddha service. Own database (siddha-service/database/siddha.db), own forms, own versions. Shares only the plumbing in libs/common.
// Every label the doctor sees is written in Siddha terms (Tamil transliteration, English meaning in brackets).
try { require('dotenv').config(); } catch (e) { /* optional */ }
const buildDomainService = require('../../../libs/common/domain-service');
const T = (label, fields, o = {}) => ({ ...o, label, fields });
const join = (...a) => a.filter(Boolean).join(' | ').slice(0, 200);

// ---- Siddha option lists ----
const MUKKUTRAM = ['Vatham (Vali)', 'Pitham (Azhal)', 'Kabam (Iyam)', 'Vatham-Pitham', 'Pitham-Kabam', 'Vatham-Kabam', 'Thontham (all three)'];
const THEGI = ['Vali Thegi', 'Azhal Thegi', 'Iyya Thegi', 'Vali-Azhal Thegi', 'Vali-Iyya Thegi', 'Azhal-Iyya Thegi', 'Thontham (Mukkutra Samam)'];
const STATE = ['Thannilai (normal)', 'Valarchi (increased)', 'Thaazhchi (decreased)'];
const THATHU = ['Saaram (plasma)', 'Senneer (blood)', 'Oon (muscle)', 'Kozhuppu (fat)', 'Enbu (bone)', 'Moolai (marrow)', 'Sukkilam / Suronitham (reproductive tissue)'];
const NAADI = ['Vali Naadi', 'Azhal Naadi', 'Iyam Naadi', 'Vali-Azhal Naadi', 'Azhal-Iyam Naadi', 'Iyam-Vali Naadi', 'Thontha Naadi (all three)'];
const NEIKURI = ['Aravam (spreads like a snake) - Vatham', 'Mothiram / Aazhi (ring form) - Pitham', 'Muthu (pearl form) - Kabam', 'Not performed'];
const MARUNTHU_VAGAI = ['Chooranam', 'Kudineer', 'Mathirai', 'Parpam', 'Chenduram', 'Chunnam', 'Legiyam', 'Nei', 'Ennai / Thailam', 'Manappagu', 'Kuzhambu', 'Other'];
const PURA_MARUTHUVAM = ['Varmam', 'Thokkanam', 'Ottradam', 'Podikizhi', 'Pugai', 'Kattu', 'Kalikkam', 'Other'];
const PROGRESS = ['Improved', 'Same', 'Worse'];

const parts = [
  // 1. Constitution and the three humours
  { id: 'mukkutram', ...T('Mukkutram & Udal Thegi (three humours & constitution)', [
    { name: 'udalThegi', label: 'Udal Thegi (body constitution)', type: 'select', options: THEGI, required: true },
    { name: 'dominant', label: 'Dominant Mukkutram (Vatham / Pitham / Kabam)', type: 'select', options: MUKKUTRAM, required: true },
    { name: 'vaathamState', label: 'Vatham (Vali) state', type: 'select', options: STATE },
    { name: 'pithamState', label: 'Pitham (Azhal) state', type: 'select', options: STATE },
    { name: 'kabamState', label: 'Kabam (Iyam) state', type: 'select', options: STATE },
    { name: 'thathu', label: 'Udal Thathukkal (seven body constituents) affected', type: 'multiselect', options: THATHU },
    { name: 'notes', label: 'Notes (Dasa Vayukkal, Pitham / Kabam subtypes, Kaalam)', type: 'textarea' },
  ], { practitionerOnly: false }),
    summary: (b) => ({ udalThegi: b.udalThegi, dominantHumour: b.dominant }),
    brief: (b) => join(b.udalThegi, b.dominant) },

  // 2. Envagai Thervu: the eight-fold examination
  { id: 'envagai-thervu', ...T('Envagai Thervu (eight-fold examination)', [
    { name: 'chiefComplaint', label: 'Presenting complaint (Kuri Kunangal)', type: 'textarea', required: true },
    { name: 'naadi', label: 'Naadi (pulse type)', type: 'select', options: NAADI, required: true },
    { name: 'naadiNadai', label: 'Naadi Nadai (pulse gait / character) & Manikkadai Nool (wrist measure)', type: 'textarea' },
    { name: 'sparisam', label: 'Sparisam (touch: warmth, dryness, moisture)', type: 'textarea' },
    { name: 'naa', label: 'Naa (tongue)', type: 'textarea' },
    { name: 'niram', label: 'Niram (colour of skin and body)', type: 'textarea' },
    { name: 'mozhi', label: 'Mozhi (voice and speech)', type: 'textarea' },
    { name: 'vizhi', label: 'Vizhi (eyes)', type: 'textarea' },
    { name: 'malam', label: 'Malam (stool)', type: 'textarea' },
    { name: 'neerKuri', label: 'Moothiram - Neer Kuri (urine: colour, odour, froth, quantity)', type: 'textarea' },
    { name: 'neiKuri', label: 'Moothiram - Nei Kuri (oil-drop test)', type: 'select', options: NEIKURI },
  ], { practitionerOnly: false }),
    summary: (b) => ({ naadi: b.naadi, neiKuri: b.neiKuri }),
    brief: (b) => join(b.chiefComplaint, b.naadi) },

  // 3. Noi Naadal: diagnosis (id stays 'diagnosis' so the timeline picks up the diagnosis note)
  { id: 'diagnosis', ...T('Noi Naadal (diagnosis)', [
    { name: 'diagnosis', label: 'Noi (Siddha diagnosis)', required: true },
    { name: 'noiMudhal', label: 'Noi Mudhal Naadal (cause and course of the disease)', type: 'textarea' },
    { name: 'terminologyCode', label: 'NAMASTE / ICD-11 TM2 code (optional)' },
    { name: 'notes', label: 'Clinical notes', type: 'textarea' },
  ], { practitionerOnly: true }),
    summary: (b) => ({ diagnosis: b.diagnosis }),
    brief: (b) => join(b.diagnosis, b.terminologyCode) },

  // 4. Maruthuvam: treatment
  { id: 'maruthuvam', ...T('Maruthuvam (treatment plan)', [
    { name: 'internal', label: 'Ul Marunthu (internal medicines)', type: 'textarea', required: true },
    { name: 'marunthuVagai', label: 'Marunthu Vagai (form of medicine)', type: 'multiselect', options: MARUNTHU_VAGAI },
    { name: 'external', label: 'Pura Maruthuvam (external therapies)', type: 'multiselect', options: PURA_MARUTHUVAM },
    { name: 'externalNotes', label: 'Pura Maruthuvam / Varmam details (sites, sessions)', type: 'textarea' },
    { name: 'pathiyam', label: 'Pathiyam (diet and conduct to follow)', type: 'textarea', required: true },
    { name: 'apathiyam', label: 'Apathiyam (diet and conduct to avoid)', type: 'textarea' },
    { name: 'yogam', label: 'Yogam / Kaya Kalpam advice', type: 'textarea' },
    { name: 'duration', label: 'Duration' },
  ], { practitionerOnly: true }),
    brief: (b) => join(b.internal, (b.marunthuVagai || []).join(', ')) },

  // 5. Follow-up
  { id: 'follow-up', ...T('Follow-up (Thodar Paarvai)', [
    { name: 'date', label: 'Follow-up date', type: 'date', required: true },
    { name: 'progress', label: 'Progress', type: 'select', options: PROGRESS, required: true },
    { name: 'naadiNow', label: 'Naadi at follow-up', type: 'select', options: NAADI },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ], { practitionerOnly: false }),
    brief: (b) => join(b.progress, b.date) },
];

buildDomainService({ key: 'siddha', folder: 'siddha-service', dir: __dirname, parts });
