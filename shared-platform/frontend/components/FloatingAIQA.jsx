import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { platform } from '../api/client';

const starters = ['What is AYUSH?', 'What can I do on this website?', 'How do I register?'];
export default function FloatingAIQA() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [open, messages, busy]);

  async function ask(value = question) {
    const text = value.trim();
    if (!text || busy) return;
    setQuestion(''); setError('');
    setMessages((old) => [...old, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const response = await platform.post('/ai/qa/ask', { question: text, category: 'general', system: 'Siddha', sessionId: sessionId || undefined });
      setSessionId(response.data.sessionId || '');
      setMessages((old) => [...old, { role: 'assistant', content: response.data.answer || 'I could not prepare an answer. Please try again.', sources: response.data.sources || [], warning: response.data.warning }]);
    } catch (err) {
      setError(err.response?.data?.message || 'The assistant is temporarily unavailable. Please try again.');
    } finally { setBusy(false); }
  }

  function startNewChat() { setMessages([]); setSessionId(''); setQuestion(''); setError(''); }
  return <>
    <button className="ai-fab" onClick={() => setOpen(true)} aria-label="Open AYUSH AI Health Assistant" aria-expanded={open}><span className="ai-fab-icon">✧</span><span>AI Health Assistant</span></button>
    {open && <div className="ai-panel" role="dialog" aria-modal="false" aria-label="AYUSH AI Health Assistant">
      <div className="ai-panel-head"><div className="ai-panel-brand"><span>✧</span><div><b>AYUSH AI Assistant</b><small>Here to help you explore AYUSH</small></div></div><div className="ai-panel-actions"><button type="button" onClick={startNewChat} title="New chat" aria-label="New chat">↻</button><button type="button" onClick={() => setOpen(false)} title="Close assistant" aria-label="Close assistant">×</button></div></div>
      <div className="ai-panel-body" ref={scrollRef}>
        {!messages.length && <div className="ai-welcome"><div className="ai-welcome-icon">✧</div><h3>Hello! Welcome to AYUSH AI Health Assistant.</h3><p>How can I help you today? Ask about AYUSH systems or how to use this platform.</p><div className="ai-starters">{starters.map((item) => <button type="button" key={item} onClick={() => ask(item)}>{item}</button>)}</div></div>}
        {messages.map((m, index) => <div className={`ai-message ${m.role}`} key={`${index}-${m.role}`}><span className="ai-message-label">{m.role === 'user' ? 'You' : 'AYUSH Assistant'}</span><p>{m.content}</p>{m.warning && <small>{m.warning}</small>}{m.sources?.length > 0 && <div className="ai-sources"><b>Sources</b>{m.sources.map((source, i) => <span key={source.id || `${source.title}-${i}`}>{source.title}{source.system ? ` · ${source.system}` : ''}</span>)}</div>}</div>)}
        {busy && <div className="ai-message assistant"><span className="ai-message-label">AYUSH Assistant</span><p className="ai-typing"><i/><i/><i/> Thinking…</p></div>}
        {error && <div className="ai-error" role="alert">{error}</div>}
      </div>
      <form className="ai-panel-form" onSubmit={(event) => { event.preventDefault(); ask(); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question…" maxLength={1500} aria-label="Your question"/><button type="submit" disabled={busy || !question.trim()} aria-label="Send question">➤</button></form>
      <div className="ai-panel-disclaimer">General information only. Not a diagnosis or substitute for professional medical advice. <Link to="/ai-assistant" onClick={() => setOpen(false)}>Open full Q&amp;A</Link></div>
    </div>}
  </>;
}
