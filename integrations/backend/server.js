// Integrations service (port 5009): document reader (OCR), translation and voice transcription. No messaging-app integration.
try { require('dotenv').config(); } catch (e) { /* optional */ }
process.env.SERVICE_NAME = 'integrations';
const path = require('path');
const express = require('express');
const { createService, finish, listen, serviceOnly, authenticate } = require('../../libs/common/http');
const { SERVICES } = require('../../libs/common/config');
const { str } = require('../../libs/common/validate');
const reader = require('../reader');
const voice = require('../voice');

const app = createService('integrations', { jsonLimit: '20mb' });

// ---------- public (through the gateway, signed-in users) ----------
// Text translation for "Speak & translate" (English, Hindi, Kannada). TRANSLATE_URL = LibreTranslate-compatible server, else MyMemory.
app.post('/translate', authenticate, async (req, res) => {
  const { text, source, target } = req.body || {}; const OK = ['en', 'hi', 'kn'];
  if (!OK.includes(source) || !OK.includes(target)) return res.status(400).json({ message: 'Only English, Hindi and Kannada are supported.' });
  const q = String(text || '').trim().slice(0, 450);
  if (!q) return res.status(400).json({ message: 'Type or speak something first.' });
  try {
    if (process.env.TRANSLATE_URL) {
      const r = await fetch(process.env.TRANSLATE_URL, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, source, target, format: 'text', api_key: process.env.TRANSLATE_KEY || undefined }) });
      if (!r.ok) throw new Error(`translate ${r.status}`);
      return res.json({ translated: (await r.json()).translatedText });
    }
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${source}|${target}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`mymemory ${r.status}`);
    return res.json({ translated: (await r.json()).responseData.translatedText });
  } catch (e) {
    return res.status(502).json({ message: 'Translation is not available right now. Check the internet connection or TRANSLATE_URL.' });
  }
});

// Speech to text for a short recording: { audio: <base64>, mime, lang }
app.post('/voice/transcribe', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!voice.available()) return res.status(501).json({ message: 'Speech recognition is not set up on this server.' });
  if (!b.audio) return res.status(400).json({ message: 'No audio received.' });
  try {
    const text = await voice.transcribe({ get: async () => Buffer.from(String(b.audio), 'base64'), mime: b.mime || 'audio/ogg' }, b.lang || 'en');
    return res.json({ text: text || '' });
  } catch (e) { return res.status(502).json({ message: 'Could not read the recording.' }); }
});

// Link to a real national health-data network is NOT built: honest status so the UI never pretends.
app.get('/external-healthcare/status', authenticate, (req, res) => res.json(require('../external-healthcare/status').status()));
app.get('/notifications', authenticate, (req, res) => res.json({ channels: [], note: 'No external messaging channels are configured. In-app notifications are available in the application.' }));

// ---------- internal OCR endpoint (service-to-service only) ----------
const internal = express.Router();
internal.use(serviceOnly);
// read a document with OCR / rules: { base64, mime } or { text } -> { raw, ex }
internal.post('/reader/read', async (req, res) => {
  const { base64, mime, text } = req.body || {};
  if (!base64 && !text) return res.status(400).json({ message: 'base64 or text is required.' });
  const fs = require('fs'); const os = require('os');
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' }[mime] || '';
  const file = base64 ? path.join(os.tmpdir(), `read-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`) : null;
  try {
    if (file) fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    const out = await reader.readInput(file ? { file, mime } : { text });
    res.json({ raw: out.raw !== undefined ? out.raw : null, ex: out.ex });
  } catch (e) { console.error('reader failed', e.message); res.status(500).json({ message: 'Could not read the document.' }); }
  finally { if (file) fs.unlink(file, () => {}); }
});
app.use('/internal', internal);

finish(app, 'integrations');
listen(app, 'integrations');

