import { useEffect, useState } from 'react';
import { platform } from '@shared/api/client';
import useSummary from '@shared/hooks/useSummary';
import { formatIST } from '@shared/utils/time';
import { getSession } from '@shared/utils/session';

const blank = (r) => ({ problem:r.problem || '', diagnosis:r.diagnosis || '', advice:r.advice || '', medicines:(r.medicines || []).map(m=>({name:m.name||'',dose:m.dose||'',timing:m.timing||'',duration:m.duration||''})) });
async function openUpload(id, download=false) {
  const previewWindow = download ? null : window.open('about:blank','_blank');
  const r = await platform.get(`/clinical/uploads/${id}/file${download?'?download=1':''}`, { responseType:'blob' });
  const url = URL.createObjectURL(r.data);
  if (download) { const a=document.createElement('a'); a.href=url; a.download='patient-report'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500); }
  else { if(previewWindow) previewWindow.location.href=url; setTimeout(()=>URL.revokeObjectURL(url),60000); }
}
function printPrescription(record, version) {
  const w=window.open('','_blank','width=850,height=900');
  if(!w) return;
  const esc=(v)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  w.document.write(`<!doctype html><html><head><title>Prescription ${esc(record.recordId)} v${version.version}</title><style>body{font:14px Arial;padding:32px;color:#222}h1{color:#176b45}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #bbb;padding:8px;text-align:left}.muted{color:#555}.sign{margin-top:50px}</style></head><body><h1>AYUSH Ayurveda — Prescription</h1><p>Record: ${esc(record.recordId)} · Version ${version.version}</p><p>Updated: ${esc(formatIST(version.updatedAt))}</p><p>Doctor: ${esc(version.doctorName||version.doctorId||'Doctor')}</p><h3>Problem</h3><p>${esc(version.problem)}</p><h3>Diagnosis</h3><p>${esc(version.diagnosis)}</p><h3>Medicines</h3><table><tr><th>Medicine</th><th>Dose</th><th>When</th><th>Duration</th></tr>${(version.medicines||[]).map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.dose)}</td><td>${esc(m.timing)}</td><td>${esc(m.duration)}</td></tr>`).join('')}</table><h3>Advice</h3><p>${esc(version.advice)}</p><p class="sign">Doctor signature: __________________</p><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export default function CommonClinical({ healthId, view = 'all' }) {
  const s = useSummary(healthId);
  const session = getSession();
  const isDoctor = session?.role === 'practitioner';
  const [editing,setEditing]=useState('');
  const [draft,setDraft]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [versions,setVersions]=useState({});
  const [consultations,setConsultations]=useState([]);
  const [versionBusy,setVersionBusy]=useState('');
  useEffect(()=>{ if(view==='all') platform.get(`/clinical/encounters?patient=${encodeURIComponent(healthId)}`).then(r=>setConsultations(Array.isArray(r.data)?r.data:[])).catch(()=>{}); },[healthId,view]);
  if (s.loading) return <div className="card"><p>Loading...</p></div>;
  if (s.error) return <div className="card"><div className="banner err">{s.error} {s.retry && <button type="button" onClick={s.reload}>Retry</button>}</div></div>;
  const records = [...(s.data.records||[])].reverse();
  const uploads = [...(s.data.uploads||[])].reverse();
  const meds = records.flatMap((r) => (r.medicines || []).filter((m) => m.name).map((m) => ({ ...m, system: r.system, savedAt: r.savedAt })));
  const edit = (r) => { setEditing(r.recordId); setDraft(blank(r)); setError(''); setMessage(''); };
  const setMed=(i,k,v)=>setDraft(d=>({...d,medicines:d.medicines.map((m,n)=>n===i?{...m,[k]:v}:m)}));
  const save=async(r)=>{
    setBusy(true);setError('');setMessage('');
    try { const out=await platform.patch(`/clinical/records/${encodeURIComponent(r.recordId)}`,draft); setMessage(`Prescription updated successfully. Version ${out.data.version} saved.`);setEditing('');setDraft(null);s.reload(); }
    catch(e){setError(e.response?.data?.message||'Could not update prescription. Check patient consent and try again.');}
    finally{setBusy(false);}
  };
  const downloadLatest=async(r)=>{try{const out=await platform.get(`/clinical/records/${encodeURIComponent(r.recordId)}/versions`);const latest=(out.data.versions||[])[0];if(latest)printPrescription(r,latest);else setError('No prescription version is available.');}catch(e){setError('Could not download the latest prescription.');}};
  const loadVersions=async(r)=>{
    setVersionBusy(r.recordId);
    try {const out=await platform.get(`/clinical/records/${encodeURIComponent(r.recordId)}/versions`);setVersions(v=>({...v,[r.recordId]:out.data.versions||[]}));}
    catch(e){setError(e.response?.data?.message||'Could not load prescription history.');}
    finally{setVersionBusy('');}
  };
  return <>
    {error && <div className="banner err">{error}</div>}
    {message && <div className="banner ok">{message}</div>}
    {view === 'all' && (s.data.medicalHistory?.length > 0 || s.data.concerns?.length > 0) && (
      <div className="card"><h3>Medical history and concerns</h3>
        {(s.data.medicalHistory||[]).map((h,i)=><div className="tl" key={`h${i}`}>{h.conditionName&&<div><strong>Condition:</strong> {h.conditionName}</div>}{h.allergies&&<div><strong>Allergies:</strong> {h.allergies}</div>}{h.currentMedications&&<div><strong>Current medicines:</strong> {h.currentMedications}</div>}{h.chronicConditions&&<div><strong>Chronic:</strong> {h.chronicConditions}</div>}{h.pastSurgeries&&<div><strong>Surgeries:</strong> {h.pastSurgeries}</div>}{h.familyHistory&&<div><strong>Family history:</strong> {h.familyHistory}</div>}{h.previousTreatments&&<div><strong>Previous treatments:</strong> {h.previousTreatments}</div>}</div>)}
        {(s.data.concerns||[]).map((c,i)=><div className="tl" key={`c${i}`}><strong>Concern:</strong> {c.symptoms}{c.duration?` (${c.duration})`:''}</div>)}
      </div>
    )}
    {view==='all'&&<div className="card"><h3>Previous consultation records</h3>
      {consultations.length===0?<p className="muted">No previous consultations found.</p>:consultations.map(c=><div className="tl" key={c.encounterId||c.consultationId}>
        <div className="row between"><strong>{c.consultationId||c.encounterId}</strong><span className="badge">{c.status||'Recorded'}</span></div>
        <p>{c.system||'Ayurveda'} · {c.datetime?formatIST(c.datetime):'Date not recorded'} · {c.mode||'Mode not recorded'}</p>
        <p><strong>Reason:</strong> {c.reason||'—'} · <strong>Notes:</strong> {c.notes||'—'}</p>
        {c.followUpDate&&<p><strong>Follow-up:</strong> {c.followUpDate}</p>}
      </div>)}
    </div>}
    {(view === 'all' || view === 'timeline') && <div className="card"><h3>Timeline and consultation records</h3>
      {records.length===0&&<p className="muted">No records yet.</p>}
      {records.map(r=><article className="tl" key={r.recordId}>
        <div className="tl-head"><span className="badge">{r.system}</span> <span className="muted">{r.documentType} · {formatIST(r.savedAt)}</span></div>
        <div><strong>Problem:</strong> {r.problem||'—'}</div><div><strong>Diagnosis:</strong> {r.diagnosis||'—'}</div>
        {r.prakriti&&<div><strong>Prakriti:</strong> {r.prakriti}</div>}
        <div><strong>Medicines:</strong> {(r.medicines||[]).map(m=>m.name).filter(Boolean).join(', ')||'—'}</div>
      </article>)}
    </div>}
    {(view==='all'||view==='medicines')&&<div className="card"><h3>Prescription and medicine history</h3>
      {records.length===0&&<p className="muted">No prescriptions recorded.</p>}
      {records.map(r=><article className="tl" key={r.recordId}>
        <div className="row between" style={{gap:10,flexWrap:'wrap'}}><strong>{r.documentType||'Prescription'} · {r.recordId}</strong><span className="muted">{formatIST(r.savedAt)}</span></div>
        <p><strong>Problem:</strong> {r.problem||'—'} · <strong>Diagnosis:</strong> {r.diagnosis||'—'}</p>
        <table className="tbl"><thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>For</th></tr></thead><tbody>{(r.medicines||[]).map((m,i)=><tr key={i}><td>{m.name}</td><td>{m.dose}</td><td>{m.timing}</td><td>{m.duration}</td></tr>)}</tbody></table>
        <p><strong>Advice:</strong> {r.advice||'—'}</p>
        <div className="row" style={{gap:8,flexWrap:'wrap'}}>
          {isDoctor&&<button type="button" className="secondary" onClick={()=>editing===r.recordId?setEditing(''):edit(r)}>Update prescription</button>}
          <button type="button" className="secondary" onClick={()=>loadVersions(r)} disabled={versionBusy===r.recordId}>{versionBusy===r.recordId?'Loading...':'View version history'}</button>
          <button type="button" onClick={()=>downloadLatest(r)}>Download latest PDF</button>
        </div>
        {editing===r.recordId&&draft&&<div className="card">
          <h4>Update prescription — new version will be saved</h4>
          <label>Problem</label><textarea value={draft.problem} onChange={e=>setDraft(d=>({...d,problem:e.target.value}))}/>
          <label>Diagnosis</label><textarea value={draft.diagnosis} onChange={e=>setDraft(d=>({...d,diagnosis:e.target.value}))}/>
          <h4>Medicines</h4>
          {draft.medicines.map((m,i)=><div className="medrow" key={i}>
            <input placeholder="Medicine" value={m.name} onChange={e=>setMed(i,'name',e.target.value)}/>
            <input placeholder="Dose" value={m.dose} onChange={e=>setMed(i,'dose',e.target.value)}/>
            <input placeholder="When" value={m.timing} onChange={e=>setMed(i,'timing',e.target.value)}/>
            <input placeholder="Duration" value={m.duration} onChange={e=>setMed(i,'duration',e.target.value)}/>
            <button className="secondary" type="button" onClick={()=>setDraft(d=>({...d,medicines:d.medicines.filter((_,n)=>n!==i)}))}>Remove</button>
          </div>)}
          <button className="secondary" type="button" onClick={()=>setDraft(d=>({...d,medicines:[...d.medicines,{name:'',dose:'',timing:'',duration:''}]}))}>Add medicine</button>
          <label>Advice</label><textarea rows={3} value={draft.advice} onChange={e=>setDraft(d=>({...d,advice:e.target.value}))}/>
          <div className="row" style={{gap:8}}><button disabled={busy} onClick={()=>save(r)}>{busy?'Saving...':'Save new version'}</button><button className="secondary" onClick={()=>setEditing('')}>Cancel</button></div>
        </div>}
        {versions[r.recordId]&&<div className="card"><h4>Prescription version history</h4>{versions[r.recordId].map(v=><div className="tl" key={v.version}><div className="row between"><strong>Version {v.version}</strong><span>{formatIST(v.updatedAt)}</span></div><p>Updated by: {v.doctorName||v.doctorId||'Doctor'}</p><button className="secondary" onClick={()=>printPrescription(r,v)}>Download version {v.version} PDF</button></div>)}</div>}
      </article>)}
      {meds.length>0&&<div className="muted">Total medicine entries: {meds.length}</div>}
    </div>}
    {view==='all'&&<div className="card"><h3>Uploaded patient reports</h3>
      {uploads.length===0?<p className="muted">No uploaded reports.</p>:uploads.map(u=><div className="row between tl" key={u.uploadId} style={{gap:10,flexWrap:'wrap'}}><div><strong>{u.fileName}</strong><div className="muted">{u.documentType} · {formatIST(u.uploadedAt)}</div></div><div className="row" style={{gap:6}}><button className="secondary" onClick={()=>openUpload(u.id,false).catch(e=>setError('Could not open original report.'))}>Open</button><button onClick={()=>openUpload(u.id,true).catch(e=>setError('Could not download report.'))}>Download</button></div></div>)}
    </div>}
  </>;
}
