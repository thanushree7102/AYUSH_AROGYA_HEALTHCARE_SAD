// Regression checks for prescription OCR field mapping (Siddha). No network / API key required.
const assert = require('node:assert/strict');
const { extract } = require('../integrations/reader');

const sample = `
SIDDHA PRESCRIPTION
PATIENT DETAILS
Name: Ganesh B Age: 25
Udal Thegi: Vali-Azhal
Naadi: Azhal
DIAGNOSIS
Reported Symptoms;
cold, fever
Diagnosis: Kaaichal
PRESCRIPTION
Nilavembu Kudineer 30 ml twice daily after food 5 days
Amukkara Chooranam 1 tsp at bedtime with warm water
Pathiyam: warm light food, avoid cold water
`;
const r = extract(sample);
assert.equal(r.system, 'siddha');
assert.match(r.complaint, /cold,\s*fever/i);
assert.equal(r.diagnosis, 'Kaaichal');
assert.equal(r.findings['Udal Thegi'], 'Vali-Azhal');
assert.equal(r.findings.Naadi, 'Azhal');
assert.ok(r.medicines.length >= 2, 'both Siddha medicines are found');
assert.match(r.medicines[0].name, /Nilavembu Kudineer/i);
assert.equal(r.medicines[0].extra.Form.toLowerCase(), 'kudineer');
assert.match(r.medicines[1].name, /Amukkara Chooranam/i);
assert.match(r.medicines[1].extra.Anupana || '', /warm water/i);
assert.match(r.advice, /warm light food/i);
assert.doesNotMatch(JSON.stringify(r), /Prakriti|Ayurved/i);

const homoeo = extract('HOMOEOPATHIC PRESCRIPTION\nMedicine: Arnica 30C');
assert.notEqual(homoeo.system, 'siddha');
console.log('Siddha reader regression checks passed.');
