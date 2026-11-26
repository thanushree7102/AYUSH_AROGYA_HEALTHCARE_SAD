import { useEffect, useState } from 'react';
import { platform } from '@shared/api/client';
import useSummary from '@shared/hooks/useSummary';
import { getSession } from '@shared/utils/session';
import { formatIST } from '@shared/utils/time';

async function fileAction(id, download=false) {
  const previewWindow=download?null:window.open('about:blank','_blank');
  const r=await platform.get(`/clinical/uploads/${id}/file${download?'?download=1':''}`,{responseType:'blob'});
  const url=URL.createObjectURL(r.data);
  if(download){const a=document.createElement('a');a.href=url;a.download='patient-report';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  else {if(previewWindow)previewWindow.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
function pdf(record,v) {
  const w=window.open('','_blank','width=850,height=900'); if(!w)return;
  const e=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  w.document.write(`<!doctype html><html><head><title>Prescription ${e(record.recordId)} v${v.version}</title><style>body{font:14px Arial;padding:32px}h1{color:#176b45}table{width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:8px;text-align:left}</style></head><body><h1>AYUSH Unani — Prescription</h1><p>Record ${e(record.recordId)} · Version ${v.version}</p><p>Doctor: ${e(v.doctorName||v.doctorId||'Doctor')} · ${e(formatIST(v.updatedAt))}</p><h3>Problem</h3><p>${e(v.problem)}</p><h3>Diagnosis</h3><p>${e(v.diagnosis)}</p><h3>Medicines</h3><table><tr><th>Medicine</th><th>Dose</th><th>When</th><th>Duration</th></tr>${(v.medicines||[]).map(m=>`<tr><td>${e(m.name)}</td><td>${e(m.dose)}</td><td>${e(m.timing)}</td><td>${e(m.duration)}</td></tr>`).join('')}</table><h3>Advice</h3><p>${e(v.advice)}</p><script>window.onload=()=>window.print()</script></body></html>`);w.document.close();
}
export default function Uploads() {
  const session=getSession();
  const s=useSummary(session.healthId);
  const [notifications,setNotifications]=useState([]);
  const [versions,setVersions]=useState({});
  const [error,setError]=useState('');
  useEffect(()=>{platform.get(`/clinical/patients/${encodeURIComponent(session.healthId)}/notifications`).then(r=>setNotifications(r.data.notifications||[])).catch(()=>{});},[session.healthId]);
  const downloadLatest=async(r)=>{try{const x=await platform.get(`/clinical/records/${encodeURIComponent(r.recordId)}/versions`);const v=(x.data.versions||[])[0];if(v)pdf(r,v);else setError('No prescription version is available.');}catch(e){setError('Could not download latest prescription.');}};
  const loadVersions=async(r)=>{try{const x=await platform.get(`/clinical/records/${encodeURIComponent(r.recordId)}/versions`);setVersions(v=>({...v,[r.recordId]:x.data.versions||[]}));}catch(e){setError('Could not load prescription history.');}};
  const markRead=async(n)=>{try{await platform.patch(`/clinical/notifications/${n.id}/read`,{});setNotifications(v=>v.map(x=>x.id===n.id?{...x,readAt:new Date().toISOString()}:x));}catch(e){}};
  if(s.loading)return <div className="card"><p>Loading...</p></div>;
  if(s.error)return <div className="card"><div className="banner err">{s.error}</div></div>;
  const ups=[...(s.data.uploads||[])].reverse();
  const records=[...(s.data.records||[])].filter(r=>r.medicines?.length||r.advice||r.diagnosis).reverse();
  return <div className="stack">
    <div className="card"><h3>Prescription update notifications</h3>
      {notifications.length===0?<p className="muted">No report or prescription updates yet.</p>:notifications.map(n=><div className="tl" key={n.id}>
        <div className="row between"><strong>{n.title}</strong>{!n.readAt&&<span className="badge">New</span>}</div><p>{n.message}</p><small className="muted">{formatIST(n.createdAt)}</small>{n.recordId&&<p><a href="/patient/medicines">View updated prescription in Medicines</a></p>}
        {!n.readAt&&<button className="secondary" onClick={()=>markRead(n)}>Mark as read</button>}
      </div>)}
    </div>
    <div className="card"><h3>My uploaded reports</h3>
      {error&&<div className="banner err">{error}</div>}
      {ups.length===0?<p className="muted">Nothing uploaded yet.</p>:ups.map(u=><div className="row between tl" key={u.uploadId} style={{gap:10,flexWrap:'wrap'}}>
        <div><strong>{u.fileName}</strong><div className="muted">{u.documentType} · {formatIST(u.savedAt)}</div></div>
        <div className="row" style={{gap:6}}><button className="secondary" onClick={()=>fileAction(u.id,false).catch(()=>setError('Could not open report.'))}>Open</button><button onClick={()=>fileAction(u.id,true).catch(()=>setError('Could not download report.'))}>Download</button></div>
      </div>)}
    </div>
    <div className="card"><h3>Prescription history and updated reports</h3>
      {records.length===0?<p className="muted">No prescription history yet.</p>:records.map(r=><div className="tl" key={r.recordId}>
        <div className="row between"><strong>{r.documentType||'Prescription'} · {r.recordId}</strong><span className="muted">{formatIST(r.savedAt)}</span></div>
        <p><strong>Problem:</strong> {r.problem||'—'} · <strong>Diagnosis:</strong> {r.diagnosis||'—'}</p>
        <p><strong>Medicines:</strong> {(r.medicines||[]).map(m=>m.name).filter(Boolean).join(', ')||'—'}</p><p><strong>Advice:</strong> {r.advice||'—'}</p>
        <div className="row" style={{gap:8,flexWrap:'wrap'}}><button onClick={()=>downloadLatest(r)}>Download latest prescription PDF</button><button className="secondary" onClick={()=>loadVersions(r)}>View previous versions</button></div>
        {versions[r.recordId]?.map(v=><div className="tl" key={v.version}><strong>Version {v.version}</strong> · {formatIST(v.updatedAt)}<p>Updated by: {v.doctorName||v.doctorId||'Doctor'}</p><button onClick={()=>pdf(r,v)}>Download PDF</button></div>)}
      </div>)}
    </div>
  </div>;
}
