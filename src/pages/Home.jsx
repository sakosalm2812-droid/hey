import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, MessageCircle, Brain, Sparkles, ShieldCheck, Layers, Compass } from 'lucide-react';
import AppearanceControl from '../components/Theme/AppearanceControl.jsx';
const tools = [
  { icon: MessageCircle, title: 'Think it through', description: 'A conversation that meets you where you are.', path: '/chat' },
  { icon: Sparkles, title: 'Make something yours', description: 'Turn a clear creative brief into an image.', path: '/studio' },
  { icon: Compass, title: 'Find your next step', description: 'Give your tasks, ideas, and goals a home.', path: '/dashboard' },
];
function LiveProductWindow() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 720);
    return () => window.clearTimeout(timer);
  }, []);
  if (!ready) {
    return (
      <div className="hey-home-window hey-home-window-skeleton" role="status" aria-label="Loading HEY preview">
        <div className="hey-home-window-head"><strong className="hey-script">HEY</strong><span className="hey-skeleton-bar" /></div>
        <div className="hey-home-window-body">
          <div className="hey-skeleton-block" />
          <div className="hey-skeleton-block short" />
          <div className="hey-skeleton-block" />
          <div className="hey-skeleton-block short" />
        </div>
      </div>
    );
  }
  return (
    <div className="hey-home-window">
      <div className="hey-home-window-head"><strong className="hey-script">HEY</strong><span>YOUR SPACE, CONNECTED</span></div>
      <h2>What’s on your mind?</h2>
      <p>A good place for your next beginning.</p>
      <div className="hey-home-tools">{tools.map(({ icon: Icon, title, description, path }) =>
        <Link key={path} to={path} className="hey-home-tool"><Icon size={20} /><span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={16} /></Link>
      )}</div>
      <div className="hey-home-window-foot"><ShieldCheck size={14} /> You choose what HEY remembers.</div>
    </div>
  );
}
export default function Home() {
  return <div className="hey-home-new">
    <section className="hey-home-hero">
      <div>
        <span className="hey-home-eyebrow"><i /> Your second brain</span>
        <h1 className="hey-hero-display">There are no limits to <em>anything.</em></h1>
        <p>One intelligence that thinks, remembers, and creates with you — across your devices, your projects, and your day.</p>
        <div className="hey-home-actions">
          <Link className="hey-btn-primary" to="/signup">Start with HEY <ArrowRight size={16} /></Link>
          <Link className="hey-btn-ghost" to="/features">See what HEY can do <ArrowUpRight size={16} /></Link>
        </div>
        <span className="hey-home-note">Already with us? <Link className="hey-home-login" to="/login">Sign in</Link></span>
      </div>
      <LiveProductWindow />
    </section>
    <div className="hey-home-strip"><span>01 / Think with clarity</span><span>02 / Create with intention</span><span>03 / Build your rhythm</span><span>04 / Make it yours</span></div>
    <section className="hey-home-section">
      <span className="hey-home-eyebrow">Less scattered. More you.</span>
      <h2>Good tools make space<br />for what matters.</h2>
      <div className="hey-home-grid">
        <article className="hey-home-feature"><MessageCircle size={24} /><h3>A conversation that fits.</h3><p>A quick answer when you need one. A thoughtful explanation when it matters. Honest pushback when an idea needs another look.</p></article>
        <article className="hey-home-feature"><Brain size={24} /><h3>Context you can keep.</h3><p>Save useful details, revisit your conversations, and organize ideas. Review what you choose to remember from your Cosmos memory space.</p></article>
        <article className="hey-home-feature"><Layers size={24} /><h3>Your day, with direction.</h3><p>Bring notes, habits, goals, and projects into the same place. Spend less energy looking for things and more doing them.</p></article>
      </div>
    </section>
    <section className="hey-home-section" style={{ paddingTop: 0 }}>
      <div className="hey-home-themes"><div><h3>A space that feels like you.</h3><p>Try a different palette. Every surface follows your lead.</p></div><AppearanceControl /></div>
    </section>
  </div>;
}
