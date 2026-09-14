import { Layers } from 'lucide-react';
import { useHEYTheme } from '../../context/ThemeContext.jsx';
export default function AppearanceControl() {
  const { themeId, themes, setTheme, reduceTransparency, setReduceTransparency } = useHEYTheme();
  return <div className="hey-theme-quick">
    <select value={themeId} onChange={event => setTheme(event.target.value)} aria-label="Appearance theme">
      {Object.entries(themes).map(([id, theme]) => <option key={id} value={id}>{theme.name}</option>)}
    </select>
    <button type="button" aria-label="Reduce transparency" title="Reduce transparency" aria-pressed={reduceTransparency} onClick={() => setReduceTransparency(!reduceTransparency)}><Layers size={16} /></button>
  </div>;
}
