import { useEffect, useRef, useState } from 'react';
import { Sparkles, Image as ImageIcon, Film, ArrowUpRight, RefreshCw } from 'lucide-react';
import PageHeader from './components/layout/PageHeader.jsx';
import { studioRequest } from './lib/studioClient.js';
import { useAuth } from './AuthContext.jsx';

const starters = {
  image: 'A handmade ceramic cup on a limestone table, soft morning light from the left, warm neutral colors, ample negative space.',
  video: 'A slow camera push toward a handmade ceramic cup on a limestone table. Steam rises naturally in warm morning light. Keep the cup and background consistent.',
};

function StudioWorkspace() {
  const [type, setType] = useState('image');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('natural');
  const [ratio, setRatio] = useState('1:1');
  const [quality, setQuality] = useState('high');
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState(null);
  const requestRef = useRef(null);
  const mounted = useRef(true);
  const previewSequence = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    Promise.all([studioRequest({ operation: 'status' }, { signal: controller.signal }), studioRequest({ operation: 'list' }, { signal: controller.signal })])
      .then(([status, data]) => { if (mounted.current) { setAvailability(status); setHistory(data.jobs); } })
      .catch(err => { if (mounted.current) setError(err.message); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  useEffect(() => {
    if (job?.status !== 'processing') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      studioRequest({ operation: 'get', id: job.id }, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setJob(data.job); })
        .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    }, 5000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [job]);
  async function create(event) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;
    setBusy(true); setError('');
    const signature = JSON.stringify({ type, prompt, style, ratio, quality });
    if (requestRef.current?.signature !== signature) requestRef.current = { signature, id: crypto.randomUUID() };
    const sequence = ++previewSequence.current;
    try {
      const data = await studioRequest({ operation: 'create', type, prompt, style, ratio, quality, requestId: requestRef.current.id });
      if (mounted.current && sequence === previewSequence.current) {
        setJob(data.job);
        setHistory(items => [data.job, ...items.filter(item => item.id !== data.job.id)].slice(0, 12));
        requestRef.current = null;
      }
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function openJob(id) {
    const sequence = ++previewSequence.current;
    setError('');
    try { const data = await studioRequest({ operation: 'get', id }); if (sequence === previewSequence.current && mounted.current) setJob(data.job); }
    catch (err) { if (mounted.current) setError(err.message); }
  }
  return <div className="hey-studio">
    <PageHeader title="Studio" subtitle="Give an idea a little more shape." icon={<Sparkles size={22} />} />
    <div className="hey-studio-grid">
      <form onSubmit={create} className="hey-glass" style={{ padding: 28, borderRadius: 24 }}>
        <div className="hey-chat-toolbar" style={{ marginBottom: 24 }}>
          {['image','video'].map(value => <button key={value} disabled={busy} aria-pressed={type === value} type="button" onClick={() => { setType(value); setRatio(value === 'image' ? '1:1' : '16:9'); }} style={{ borderColor: type === value ? 'var(--accent)' : undefined }}>{value === 'image' ? <ImageIcon size={15} /> : <Film size={15} />} {value === 'image' ? 'Image' : 'Video'}</button>)}
        </div>
        <label>Your creative brief<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={4000} required disabled={busy} placeholder="Describe the subject, composition, lighting, and details that matter." /><small>{prompt.length.toLocaleString()} / 4,000</small></label>
        <button className="hey-btn-ghost" type="button" disabled={busy} onClick={() => setPrompt(starters[type])}>Try a starting point</button>
        <div style={{ marginTop: 24 }}>
          <label>Art direction<select disabled={busy} value={style} onChange={event => setStyle(event.target.value)}><option value="natural">Follow my brief</option><option value="editorial">Editorial</option><option value="illustration">Illustration</option><option value="product">Product photography</option><option value="cinematic">Cinematic</option></select></label>
          <label>Format<select disabled={busy} value={ratio} onChange={event => setRatio(event.target.value)}><option value="1:1">Square</option><option value={type === 'image' ? '3:2' : '16:9'}>Landscape {type === 'image' ? '3:2' : '16:9'}</option><option value={type === 'image' ? '2:3' : '9:16'}>Portrait {type === 'image' ? '2:3' : '9:16'}</option></select></label>
          {type === 'image' && <label>Detail<select disabled={busy} value={quality} onChange={event => setQuality(event.target.value)}><option value="high">High detail</option><option value="medium">Balanced</option></select></label>}
        </div>
        {error && <p className="hey-studio-error" role="alert">{error}</p>}
        {availability?.[type] === false && <p className="hey-studio-error">{type === 'image' ? 'Image' : 'Video'} creation is awaiting a provider connection.</p>}
        <button className="hey-btn-primary" type="submit" disabled={busy || !prompt.trim() || availability?.[type] === false}><Sparkles size={16} /> {busy ? 'Creating…' : `Create ${type}`}</button>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>Your brief goes to the connected generation provider. {type === 'video' ? 'Videos are 5 seconds at 720p. Pro or Elite is required.' : 'One image per creation.'} Daily limits apply.</p>
      </form>
      <section className="hey-glass hey-studio-result" style={{ padding: 28, borderRadius: 24 }} aria-live="polite" aria-busy={busy || job?.status === 'processing'}>
        {job?.status === 'completed' && job.result?.images?.[0] ? <><img src={job.result.images[0]} alt={job.prompt} /><a className="hey-btn-ghost" href={job.result.images[0]} target="_blank" rel="noreferrer">Open image <ArrowUpRight size={15} /></a></>
          : job?.status === 'completed' && job.result?.video ? <><video src={job.result.video} controls playsInline style={{ width: '100%', borderRadius: 16 }} /><a className="hey-btn-ghost" href={job.result.video} target="_blank" rel="noreferrer">Open video <ArrowUpRight size={15} /></a></>
          : <div><Sparkles size={30} /><h2>{busy || job?.status === 'processing' ? 'Taking shape.' : job?.status === 'failed' ? 'Let’s try another direction.' : 'A new possibility starts here.'}</h2><p>{job?.error || (busy || job?.status === 'processing' ? 'Your creation is processing. You can return to it from recent creations.' : 'Describe what you see in your mind. Your result will appear here.')}</p>{job?.id && <button className="hey-btn-ghost" type="button" onClick={() => openJob(job.id)}><RefreshCw size={15} /> Check progress</button>}</div>}
      </section>
    </div>
    {history.length > 0 && <section style={{ marginTop: 36 }}><h2>Recent creations</h2><div className="hey-chat-toolbar">{history.map(item => <button key={item.id} type="button" disabled={busy} onClick={() => openJob(item.id)}>{item.kind === 'image' ? <ImageIcon size={14} /> : <Film size={14} />} {item.prompt.slice(0, 42)}{item.prompt.length > 42 ? '…' : ''}</button>)}</div></section>}
  </div>;
}

export default function StudioPage() {
  const { user } = useAuth();
  return <StudioWorkspace key={user?.id || 'signed-out'} />;
}
