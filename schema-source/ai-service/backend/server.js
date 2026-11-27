
try { require('dotenv').config(); } catch (_) {}
process.env.SERVICE_NAME = 'ai';
const express = require('express');
const path = require('path');
const { openDb, uuid, now } = require('../../libs/common/db');
const security = require('../../libs/common/security');
const { SERVICES, HOST } = require('../../libs/common/config');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
const db = openDb(path.join(__dirname, '..', 'database'), 'ai.db', 'ai-service');
db.exec(`
CREATE TABLE IF NOT EXISTS qa_sessions (
 session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS qa_messages (
 message_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
 category TEXT, ayush_system TEXT, sources_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_qa_user ON qa_sessions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS ix_qa_messages ON qa_messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS qa_feedback (
 feedback_id TEXT PRIMARY KEY, message_id TEXT NOT NULL, user_id TEXT NOT NULL,
 helpful INTEGER NOT NULL, comment TEXT, created_at TEXT NOT NULL
);
`);

// Small, transparent starter knowledge base. Replace/extend with administrator-approved source material.
const KNOWLEDGE = [
 {id:'platform-registration',system:'general',title:'AAUH patient registration',text:'Patients can use the registration flow in the AAUH application. Follow the on-screen identity and contact verification steps. Do not share OTPs with anyone. The exact options shown depend on the configured deployment.'},
 {id:'platform-appointments',system:'general',title:'Appointments',text:'Use the appointment or consultation workflow available in the signed-in application. Available practitioners and time slots depend on the facility configuration.'},
 {id:'platform-records',system:'general',title:'Patient records and consent',text:'Patient records are available only to authenticated users with appropriate permissions. Sharing or access to another person’s health information requires the applicable authorisation and consent.'},
 {id:'ayurveda-intro',system:'Ayurveda',title:'Ayurveda overview',text:'Ayurveda is a traditional system of health knowledge originating in India. Educational explanations should be distinguished from individual diagnosis or treatment advice.'},
 {id:'yoga-intro',system:'Yoga & Naturopathy',title:'Yoga and Naturopathy overview',text:'Yoga and naturopathy include approaches related to movement, breathing, lifestyle and nature-based health practices. Individual suitability should be discussed with a qualified practitioner.'},
 {id:'unani-intro',system:'Unani',title:'Unani overview',text:'Unani is a traditional system of medicine with its own concepts, terminology and practices. Its concepts should be explained in their own context rather than assumed equivalent to those of other systems.'},
 {id:'siddha-intro',system:'Siddha',title:'Siddha overview',text:'Siddha is a traditional system of medicine with distinct concepts, terminology and practices. Individual clinical decisions belong to a qualified Siddha practitioner.'},
 {id:'homoeopathy-intro',system:'Homoeopathy',title:'Homoeopathy overview',text:'Homoeopathy is a distinct system with its own historical concepts and terminology. Educational information should not be presented as proof of clinical effectiveness or as a substitute for evidence-based medical care.'},
];
const normal = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
function retrieve(question, system, category) {
 const words = new Set(normal(question));
 return KNOWLEDGE.filter(x => category === 'platform' ? x.system === 'general' : category === 'ayush' ? (system === 'All' || x.system === system) : true)
  .map(x => ({...x, score: normal(x.title+' '+x.text+' '+x.system).reduce((n,w)=>n+(words.has(w)?1:0),0)}))
  .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4);
}
function safeFallback(question, docs, system) {
 if (!docs.length) return 'I could not find a verified answer in the currently loaded AAUH knowledge sources. Please try rephrasing your question or contact a qualified practitioner. The knowledge base is a starter set and needs approved reference documents.';
 const intro = system && system !== 'All' ? `For ${system}: ` : '';
 return intro + docs.map(d=>d.text).join('\n\n') + '\n\nThis is general educational information, not a diagnosis or treatment recommendation. Please consult a qualified practitioner for personal clinical advice.';
}
async function generate(question, docs, system) {
 const key = process.env.ANTHROPIC_API_KEY;
 if (!key) return { answer: safeFallback(question, docs, system), provider: 'local-knowledge' };
 const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
 const context = docs.map(d=>`[${d.title}; source id: ${d.id}]\n${d.text}`).join('\n\n');
 const prompt = `You are the educational Q&A assistant for AAUH, an AYUSH digital health platform. Answer only from the supplied context. If it does not support an answer, say you cannot verify it. Do not diagnose, prescribe, recommend stopping treatment, or claim equivalence between AYUSH systems. For urgent symptoms, advise urgent medical assessment. Be concise and clear. Question: ${question}\nSelected system: ${system || 'General'}\nContext:\n${context || '(No matching sources found)'}`;
 const response = await fetch('https://api.anthropic.com/v1/messages', {
  method:'POST', headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
  body:JSON.stringify({model,max_tokens:700,messages:[{role:'user',content:prompt}]}), signal:AbortSignal.timeout(25000)
 });
 if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
 const data = await response.json();
 const answer = (data.content || []).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
 if (!answer) throw new Error('AI provider returned an empty answer');
 return {answer,provider:'anthropic'};
}
function identity(req,res) {
 const id = security.readIdentity(req.get('X-Identity'));
 if (!id || !(id.userId || id.sub)) { res.status(401).json({message:'Valid sign-in required.'}); return null; }
 return id;
}
app.get('/health',(req,res)=>res.json({service:'ai',title:SERVICES.ai.title,ok:true,provider:process.env.ANTHROPIC_API_KEY?'anthropic':'local-knowledge',time:new Date().toISOString()}));
app.get('/qa/suggestions',(req,res)=>res.json({suggestions:[
 'What is Ayurveda?','What is the difference between Siddha and Unani?','How do I access my patient records?','How can I book a consultation?'
]}));
app.post('/qa/ask', async (req,res)=>{
 // Public visitor Q&A: no account or access token is required. Anonymous chats are scoped to an unguessable session UUID.
 const id = security.readIdentity(req.get('X-Identity'));
 const question=String(req.body?.question||'').trim();
 const category=['ayush','platform','compare','general'].includes(req.body?.category)?req.body.category:'general';
 const system=['Ayurveda','Yoga & Naturopathy','Unani','Siddha','Homoeopathy','All'].includes(req.body?.system)?req.body.system:'All';
 if(question.length<2||question.length>1500)return res.status(400).json({message:'Question must be between 2 and 1500 characters.'});
 const sessionId=String(req.body?.sessionId||'').trim()||uuid();
 if (!/^[0-9a-f-]{20,64}$/i.test(sessionId)) return res.status(400).json({message:'Invalid chat session.'});
 const ownerId = id && (id.userId || id.sub) ? String(id.userId || id.sub) : `guest:${sessionId}`;
 let session=db.prepare('SELECT * FROM qa_sessions WHERE session_id=? AND user_id=?').get(sessionId,ownerId);
 if(!session){db.prepare('INSERT INTO qa_sessions(session_id,user_id,created_at,updated_at) VALUES(?,?,?,?)').run(sessionId,ownerId,now(),now());}
 const docs=retrieve(question,system,category);
 try {
  const result=await generate(question,docs,system);
  const created=now(), userMsg=uuid(), assistantMsg=uuid();
  const tx=db.transaction(()=>{
   db.prepare('INSERT INTO qa_messages VALUES(?,?,?,?,?,?,?,?,?)').run(userMsg,sessionId,ownerId,'user',question,category,system,'[]',created);
   db.prepare('INSERT INTO qa_messages VALUES(?,?,?,?,?,?,?,?,?)').run(assistantMsg,sessionId,ownerId,'assistant',result.answer,category,system,JSON.stringify(docs.map(d=>({id:d.id,title:d.title}))),created);
   db.prepare('UPDATE qa_sessions SET updated_at=? WHERE session_id=? AND user_id=?').run(created,sessionId,ownerId);
  }); tx();
  res.json({sessionId,answer:result.answer,messageId:assistantMsg,provider:result.provider,sources:docs.map(d=>({id:d.id,title:d.title,system:d.system}))});
 } catch(e) {
  // Safe local retrieval fallback keeps the feature useful if the configured provider is temporarily down.
  const answer=safeFallback(question,docs,system);
  const created=now(), assistantMsg=uuid();
  db.prepare('INSERT INTO qa_messages VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(),sessionId,ownerId,'user',question,category,system,'[]',created);
  db.prepare('INSERT INTO qa_messages VALUES(?,?,?,?,?,?,?,?,?)').run(assistantMsg,sessionId,ownerId,'assistant',answer,category,system,JSON.stringify(docs.map(d=>({id:d.id,title:d.title}))),created);
  res.json({sessionId,answer,messageId:assistantMsg,provider:'local-fallback',warning:'AI provider unavailable; returned matching approved starter knowledge only.',sources:docs.map(d=>({id:d.id,title:d.title,system:d.system}))});
 }
});
app.get('/qa/history', (req,res)=>{
 const id=identity(req,res);if(!id)return;
 const sessions=db.prepare('SELECT session_id sessionId,created_at createdAt,updated_at updatedAt FROM qa_sessions WHERE user_id=? ORDER BY updated_at DESC LIMIT 30').all(id.userId || id.sub);
 res.json({sessions});
});
app.get('/qa/history/:sessionId', (req,res)=>{
 const id=identity(req,res);if(!id)return;
 const s=db.prepare('SELECT session_id FROM qa_sessions WHERE session_id=? AND user_id=?').get(req.params.sessionId,(id.userId || id.sub));
 if(!s)return res.status(404).json({message:'Conversation not found.'});
 const messages=db.prepare('SELECT message_id messageId,role,content,category,ayush_system ayushSystem,sources_json sources,created_at createdAt FROM qa_messages WHERE session_id=? AND user_id=? ORDER BY created_at').all(req.params.sessionId,(id.userId || id.sub)).map(m=>({...m,sources:JSON.parse(m.sources||'[]')}));
 res.json({messages});
});
app.post('/qa/feedback',(req,res)=>{
 const {messageId,helpful,comment}=req.body||{};
 if(typeof messageId!=='string'||typeof helpful!=='boolean')return res.status(400).json({message:'messageId and boolean helpful are required.'});
 const message=db.prepare("SELECT user_id FROM qa_messages WHERE message_id=? AND role='assistant'").get(messageId);
 if(!message)return res.status(404).json({message:'Answer not found.'});
 db.prepare('INSERT INTO qa_feedback VALUES(?,?,?,?,?,?)').run(uuid(),messageId,message.user_id,helpful?1:0,String(comment||'').slice(0,500),now());
 res.status(201).json({saved:true});
});
app.listen(SERVICES.ai.port,HOST,()=>console.log(`[ai] ${SERVICES.ai.title} listening on ${SERVICES.ai.port}`));
