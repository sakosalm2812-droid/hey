import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

function CodeBlock({ children }) {
  const codeRef = useRef(null);
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(codeRef.current?.textContent || '');
      setStatus('Copied');
    } catch { setStatus('Select the code to copy it.'); }
  }
  return <div className="hey-code-block"><div className="hey-code-bar"><span aria-live="polite">{status || 'Code'}</span><button type="button" onClick={copy} aria-label="Copy code">{status === 'Copied' ? <Check size={14} /> : <Copy size={14} />}</button></div><pre ref={codeRef}>{children}</pre></div>;
}
const components = {
  pre: CodeBlock,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ src, alt }) => <a href={src} target="_blank" rel="noopener noreferrer">{alt || 'Open referenced image'}</a>,
  table: ({ children }) => <div className="hey-markdown-table" tabIndex={0} role="region" aria-label="Response table"><table>{children}</table></div>,
};
export default function MarkdownResponse({ children }) {
  return <div className="hey-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>{String(children || '')}</ReactMarkdown></div>;
}
