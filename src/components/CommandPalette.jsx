import { AnimatePresence, motion } from "framer-motion";
import { Command, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startTutorial } from "../core/onboardingEngine.js";

const commands = [
  ["Open Studio", "/studio", "Create images and videos"],
  ["Open HEY Chat", "/chat", "Ask, think, and create"],
  ["Open Dashboard", "/dashboard", "Your command center"],
  ["Open Cosmos", "/cosmos", "Explore connected memory"],
  ["Open Forge", "/forge", "Build intelligence and tools"],
  ["Open Capabilities", "/capabilities", "See the HEY universe"],
  ["Open Tasks", "/tasks", "Move work forward"],
  ["Open Calendar", "/calendar", "See what is next"],
  ["Open Memory", "/memory", "Review what HEY remembers"],
  ["Open Settings", "/settings", "Control your HEY experience"],
  ["Open Goals", "/goals", "Choose what you want to achieve"],
  ["Open Habits", "/habits", "Build a daily rhythm"],
  ["Open Notes", "/notes", "Capture a thought"],
  ["Open Projects", "/projects", "Manage your projects"],
  ["Open Analytics", "/analytics", "View insights and metrics"],
  ["Open Health", "/health", "Track wellness and vitals"],
  ["Open Journal", "/journal", "Reflect and write"],
  ["Open Learn", "/learn", "Discover and study"],
  ["Open Agents", "/agents", "Manage AI agents"],
  ["Open Forge", "/forge", "Build custom capabilities"],
  ["Open Devices", "/device", "Connect and manage devices"],
  ["Open Voice", "/voice", "Voice and Live sessions"],
  ["Open Deen", "/deen", "Prayer and Islamic tools"],
  ["Open Crisis", "/crisis", "Crisis support and resources"],
  ["Open Debug", "/debug", "System diagnostics"],
];

function CommandPalette() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const visibleCommands = useMemo(() => {
    return commands.filter(([label, path, desc]) =>
      label.toLowerCase().includes(query.toLowerCase()) ||
      path.toLowerCase().includes(query.toLowerCase()) ||
      desc.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const runEntry = (entry) => {
    if (entry[1] === "tutorial") {
      startTutorial({ capabilityId: "command_palette" });
      setIsOpen(false);
      return;
    }
    navigate(entry[1]);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen && visibleCommands.length > 0) {
      setSelected(0);
    }
  }, [isOpen, visibleCommands]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="hey-command-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={() => setIsOpen(false)}
      >
        <motion.div
          className="hey-command"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hey-command-header">
            <Search className="hey-command-icon" size={20} />
            <input
              type="text"
              className="hey-command-input"
              placeholder="Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              spellCheck={false}
            />
          </div>
          <div className="hey-command-list">
            {visibleCommands.map((entry, index) => (
              <button
                key={entry[0]}
                type="button"
                className={index === selected ? "hey-command-item selected" : "hey-command-item"}
                onMouseEnter={() => setSelected(index)}
                onClick={() => runEntry(entry)}
              >
                <span className="hey-command-item-icon"><Command size={15} /></span>
                <span><strong>{entry[1]}</strong><small>{entry[2]}</small></span>
                <kbd>{index === selected ? "↵" : entry[1].replace("/", "").slice(0, 4)}</kbd>
              </button>
            ))}
            {!visibleCommands.length && <div className="hey-command-empty">No HEY destination matches that search.</div>}
          </div>
          <div className="hey-command-footer"><span>Navigate with ↑ ↓</span><span>Press <kbd>Esc</kbd> to close</span></div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export { CommandPalette };
export default CommandPalette;