// Unani clinical domain service. Uses the shared consent, encounter, audit and versioning infrastructure,
// while storing Unani-specific consultation forms in its own unani.db database.
try { require('dotenv').config(); } catch (e) { /* optional */ }
const buildDomainService = require('../../../libs/common/domain-service');
const T = (label, fields, o = {}) => ({ ...o, label, fields });

const parts = [
  {
    id: 'ahwal',
    ...T('Case Taking (Ahwal)', [
      { name: 'chiefComplaints', label: 'Chief complaints (current symptoms)', type: 'textarea', required: true },
      { name: 'historyOfPresentIllness', label: 'History of present illness', type: 'textarea', required: true },
      { name: 'pastMedicalHistory', label: 'Past medical and treatment history', type: 'textarea' },
      { name: 'familyHistory', label: 'Family history', type: 'textarea' },
      { name: 'personalHistory', label: 'Personal history (diet, sleep, bowel, habits)', type: 'textarea' },
      { name: 'generalObservations', label: 'General observations', type: 'textarea' },
      { name: 'duration', label: 'Duration of complaints' },
      { name: 'notes', label: 'Additional Ahwal notes', type: 'textarea' },
    ], { practitionerOnly: false }),
    summary: (b) => ({ chiefComplaints: b.chiefComplaints, historyOfPresentIllness: b.historyOfPresentIllness }),
  },
  {
    id: 'mizaj',
    ...T('Mizaj Assessment', [
      { name: 'overallMizaj', label: 'Overall Mizaj', type: 'select', required: true, options: ['Damwi (Sanguine)', 'Balghami (Phlegmatic)', 'Safrawi (Bilious)', 'Saudawi (Melancholic)', 'Mixed / compound', 'Undetermined'] },
      { name: 'temperament', label: 'Temperamental qualities', type: 'select', required: true, options: ['Hot and dry', 'Hot and moist', 'Cold and dry', 'Cold and moist', 'Balanced / moderate', 'Mixed / requires assessment'] },
      { name: 'heat', label: 'Heat assessment', type: 'select', options: ['Hot', 'Cold', 'Balanced', 'Mixed / unclear'] },
      { name: 'moisture', label: 'Moisture assessment', type: 'select', options: ['Moist', 'Dry', 'Balanced', 'Mixed / unclear'] },
      { name: 'observations', label: 'Assessment observations and supporting findings', type: 'textarea', required: true },
      { name: 'notes', label: 'Practitioner notes', type: 'textarea' },
    ], { practitionerOnly: false }),
    summary: (b) => ({ mizaj: b.overallMizaj, temperament: b.temperament }),
  },
  {
    id: 'tashkhees',
    ...T('Diagnosis (Tashkhees)', [
      { name: 'diagnosis', label: 'Clinical diagnosis (Tashkhees)', required: true },
      { name: 'unaniTerminology', label: 'Unani terminology / diagnostic classification' },
      { name: 'differentialDiagnosis', label: 'Differential diagnosis', type: 'textarea' },
      { name: 'clinicalFindings', label: 'Clinical findings supporting diagnosis', type: 'textarea', required: true },
      { name: 'investigations', label: 'Investigations / reports reviewed', type: 'textarea' },
      { name: 'notes', label: 'Practitioner notes', type: 'textarea' },
    ], { practitionerOnly: true }),
    summary: (b) => ({ diagnosis: b.diagnosis, unaniTerminology: b.unaniTerminology }),
  },
  {
    id: 'ilaj',
    ...T('Treatment (Ilaj)', [
      { name: 'treatmentApproach', label: 'Treatment approach / plan', type: 'textarea', required: true },
      { name: 'regimenalTherapy', label: 'Regimenal therapy (if prescribed)', type: 'multiselect', options: ['Hijama (cupping)', 'Fasd (venesection)', 'Dalk (massage)', 'Hammam (bath)', 'Idrar (diuresis)', 'Ishal (purgation)', 'Qai (emesis)', 'Nutool (irrigation)', 'Other / not applicable'] },
      { name: 'regimenalDetails', label: 'Regimenal therapy details, duration and precautions', type: 'textarea' },
      { name: 'ghizaAdvice', label: 'Ghiza (dietary advice)', type: 'textarea', required: true },
      { name: 'tadabeerAdvice', label: 'Tadabeer / lifestyle advice', type: 'textarea' },
      { name: 'precautions', label: 'Precautions and patient instructions', type: 'textarea' },
      { name: 'treatmentNotes', label: 'Additional Ilaj notes', type: 'textarea' },
    ], { practitionerOnly: true }),
    summary: (b) => ({ treatmentApproach: b.treatmentApproach, ghizaAdvice: b.ghizaAdvice }),
  },
  {
    id: 'follow-up',
    ...T('Follow-up', [
      { name: 'followUpDate', label: 'Next follow-up date', type: 'date', required: true },
      { name: 'progress', label: 'Progress since previous visit', type: 'select', required: true, options: ['Improved', 'No significant change', 'Worsened', 'New symptoms'] },
      { name: 'symptomChanges', label: 'Changes in symptoms', type: 'textarea' },
      { name: 'treatmentResponse', label: 'Response to treatment', type: 'textarea' },
      { name: 'planChanges', label: 'Changes to treatment / advice', type: 'textarea' },
      { name: 'notes', label: 'Follow-up notes', type: 'textarea' },
    ], { practitionerOnly: true }),
    summary: (b) => ({ followUpDate: b.followUpDate, progress: b.progress }),
  },
];

buildDomainService({ key: 'unani', folder: 'unani-service', dir: __dirname, parts, strict: false });
