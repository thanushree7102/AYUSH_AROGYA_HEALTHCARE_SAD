// Regression checks for prescription OCR field mapping and Unani document recognition.
const assert = require('node:assert/strict');
const { extract } = require('../integrations/reader');
const unani = extract(`UNANI PRESCRIPTION\nPATIENT DETAILS\nName: Demo Patient\nCHIEF COMPLAINTS\nJoint pain and stiffness\nDIAGNOSIS\nMizaj: Balghami\nPRESCRIPTION\nMedicine: Majun-e-Suranjan 5 gm twice daily for 7 days\nGHIZA: Light diet`);
assert.equal(unani.system, 'unani');
assert.match(unani.complaint, /Joint pain/i);
assert.match(unani.findings.Mizaj, /Balghami/i);
assert.ok(unani.medicines.length >= 1);
const ayurveda = extract('AYURVEDIC PRESCRIPTION\nPrakriti: Vata\nMedicine: Triphala churna 3 gm');
assert.equal(ayurveda.system, 'ayurveda');
const homoeo = extract('HOMOEOPATHIC PRESCRIPTION\nMedicine: Arnica 30C');
assert.equal(homoeo.system, '');
console.log('Reader regression checks passed for Unani and Ayurveda; unrelated systems remain unclassified.');
