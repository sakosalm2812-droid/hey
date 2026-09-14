import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  MessageCircle,
  Globe2,
  Hammer,
  Sparkles,
  Settings,
  Menu,
  Palette,
  Brain,
  CheckSquare,
  CalendarDays,
  BarChart3,
  LockKeyhole,
  Search,
  ChevronLeft,
  ChevronRight,
  Bell,
  Mic2,
  Moon,
  HelpCircle,
  CreditCard,
  HardDrive,
  Terminal,
  Activity,
  FileText,
  FolderGit2,
  Bot,
  ZapIcon,
  BookOpen,
  Target,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";

import { useHEYTheme } from "../../context/ThemeContext";
import { buzz, confirmSound } from "../../lib/heyFeedback";
import { springs } from "../../lib/heyMotion";
import DynamicIsland from "./DynamicIsland";
import BlockBackground from "../BlockBackground";
import { CommandPalette } from "../CommandPalette";

const sidebarNavItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ['user', 'admin'] },
  { label: "HEY Chat", path: "/chat", icon: MessageCircle, roles: ['user', 'admin'] },
  { label: "Voice Live", path: "/voice/live", icon: Mic2, roles: ['user', 'admin'] },
  { label: "Cosmos", path: "/cosmos", icon: Globe2, roles: ['user', 'admin'] },
  { label: "Forge", path: "/forge", icon: Hammer, roles: ['user', 'admin'] },
  { label: "Memory", path: "/memory", icon: Brain, roles: ['user', 'admin'] },
  { label: "Tasks", path: "/tasks", icon: CheckSquare, roles: ['user', 'admin'] },
  { label: "Calendar", path: "/calendar", icon: CalendarDays, roles: ['user', 'admin'] },
  { label: "Projects", path: "/projects", icon: FolderGit2, roles: ['user', 'admin'] },
  { label: "Studio", path: "/studio", icon: Sparkles, roles: ['user', 'admin'] },
  { label: "Analytics", path: "/analytics", icon: BarChart3, roles: ['user', 'admin'] },
  { label: "Deen", path: "/deen", icon: Moon, roles: ['user', 'admin'] },
  { label: "Learn", path: "/learn", icon: BookOpen, roles: ['user', 'admin'] },
  { label: "Finance", path: "/finance", icon: CreditCard, roles: ['user', 'admin'] },
  { label: "Goals", path: "/goals", icon: Target, roles: ['user', 'admin'] },
  { label: "Habits", path: "/habits", icon: CheckSquare, roles: ['user', 'admin'] },
  { label: "Health", path: "/health", icon: Activity, roles: ['user', 'admin'] },
  { label: "Journal", path: "/journal", icon: FileText, roles: ['user', 'admin'] },
  { label: "Notes", path: "/notes", icon: FileText, roles: ['user', 'admin'] },
  { label: "Modes", path: "/modes", icon: SlidersHorizontal, roles: ['user', 'admin'] },
];

const advancedNavItems = [
  { label: "Agents", path: "/agents", icon: Bot, roles: ['admin', 'developer'] },
  { label: "Capabilities", path: "/capabilities", icon: ZapIcon, roles: ['admin', 'developer'] },
  { label: "Devices", path: "/device", icon: HardDrive, roles: ['admin', 'developer'] },
  { label: "Permissions", path: "/permissions", icon: LockKeyhole, roles: ['admin', 'developer'] },
  { label: "Debug", path: "/debug", icon: Terminal, roles: ['developer'] },
];

const bottomNavItems = [
  { label: "Settings", path: "/settings", icon: Settings, roles: ['user', 'admin'] },
  { label: "Help", path: "/support", icon: HelpCircle, roles: ['user', 'admin'] },
];

export default function AppLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const themeRef = useRef(null);
  const sidebarRef = useRef(null);

  const {
    themeId,
    themes,
    setTheme,
    customAccent,
    setCustomAccent,
    mode,
    setMode,
    modes,
  } = useHEYTheme();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setThemeOpen(false);
        setMobileSidebarOpen(false);
        setCommandPaletteOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
        event.preventDefault();
        setMobileSidebarOpen(!mobileSidebarOpen);
      }
    };
    const outsideClick = (event) => {
      if (!themeRef.current?.contains(event.target)) setThemeOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', outsideClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', outsideClick);
    };
  }, [mobileSidebarOpen]);

  const handleThemeChange = (id) => {
    setTheme(id);
    buzz("light");
    confirmSound();
    setThemeOpen(false);
  };

  const handleModeChange = (modeId) => {
    setMode(modeId);
    buzz("light");
    confirmSound();
  };

  const handleCommandPaletteOpen = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  return (
    <div className="hey-app-shell">
      <BlockBackground />
      
      {/* SIDEBAR */}
      <aside
        ref={sidebarRef}
        className={`hey-sidebar ${sidebarCollapsed ? 'hey-sidebar--collapsed' : ''} ${mobileSidebarOpen ? 'hey-sidebar--mobile-open' : ''}`}
        style={{ width: sidebarCollapsed ? 68 : 244 }}
        aria-label="Main navigation"
      >
        <div className="hey-sidebar__header">
          <NavLink
            to="/dashboard"
            className="hey-sidebar__brand"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="HEY Dashboard"
          >
            <span className="hey-sidebar__logo">H</span>
            {!sidebarCollapsed && <span className="hey-script hey-sidebar__title">HEY</span>}
          </NavLink>
          {!sidebarCollapsed && (
            <button
              type="button"
              className="hey-sidebar__toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>

        <nav className="hey-sidebar__nav" aria-label="Main navigation">
          <ul className="hey-sidebar__list" role="list">
            {sidebarNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <li key={item.path} className="hey-sidebar__item">
                  <NavLink
                    to={item.path}
                    onPointerDown={() => buzz("light")}
                    className={({ isActive: active }) =>
                      `hey-sidebar__link ${active ? 'hey-sidebar__link--active' : ''}`
                    }
                    onClick={() => setMobileSidebarOpen(false)}
                  >
                    <Icon size={20} className="hey-sidebar__icon" aria-hidden="true" />
                    {!sidebarCollapsed && <span className="hey-sidebar__label">{item.label}</span>}
                    {isActive && !sidebarCollapsed && <span className="hey-sidebar__indicator" aria-hidden="true" />}
                  </NavLink>
                </li>
              );
            })}
          </ul>

          {!sidebarCollapsed && (
            <>
              <li className="hey-sidebar__divider">
                <span>Advanced</span>
              </li>
              <ul className="hey-sidebar__list" role="list">
                {advancedNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={item.path} className="hey-sidebar__item">
                      <NavLink
                        to={item.path}
                        onPointerDown={() => buzz("light")}
                        className={({ isActive: active }) =>
                          `hey-sidebar__link ${active ? 'hey-sidebar__link--active' : ''}`
                        }
                        onClick={() => setMobileSidebarOpen(false)}
                      >
                        <Icon size={20} className="hey-sidebar__icon" aria-hidden="true" />
                        <span className="hey-sidebar__label">{item.label}</span>
                        {isActive && <span className="hey-sidebar__indicator" aria-hidden="true" />}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>

              <li className="hey-sidebar__divider">
                <span>Account</span>
              </li>
              <ul className="hey-sidebar__list" role="list">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={item.path} className="hey-sidebar__item">
                      <NavLink
                        to={item.path}
                        onPointerDown={() => buzz("light")}
                        className={({ isActive: active }) =>
                          `hey-sidebar__link ${active ? 'hey-sidebar__link--active' : ''}`
                        }
                        onClick={() => setMobileSidebarOpen(false)}
                      >
                        <Icon size={20} className="hey-sidebar__icon" aria-hidden="true" />
                        <span className="hey-sidebar__label">{item.label}</span>
                        {isActive && <span className="hey-sidebar__indicator" aria-hidden="true" />}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        <div className="hey-sidebar__footer">
          {!sidebarCollapsed && (
            <div className="hey-sidebar__mode-selector">
              <label className="hey-sidebar__mode-label">Mode</label>
              <select
                value={mode}
                onChange={(e) => handleModeChange(e.target.value)}
                className="hey-sidebar__mode-select"
                aria-label="Select mode"
              >
                {Object.entries(modes || {}).map(([id, m]) => (
                  <option key={id} value={id}>{m?.name || id}</option>
                ))}
              </select>
            </div>
          )}
          <div className="hey-sidebar__user">
            {!sidebarCollapsed && (
              <div className="hey-sidebar__user-info">
                <div className="hey-sidebar__avatar" aria-hidden="true">U</div>
                <div className="hey-sidebar__user-details">
                  <span className="hey-sidebar__user-name">User</span>
                  <span className="hey-sidebar__user-plan">Pro</span>
                </div>
              </div>
            )}
            <NavLink
              to="/settings"
              className="hey-sidebar__settings"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Settings"
            >
              <Settings size={20} />
            </NavLink>
          </div>
        </div>
      </aside>

      {/* MOBILE SIDEBAR OVERLAY */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            className="hey-sidebar__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* TOP BAR */}
      <header className="hey-topbar">
        <button
          type="button"
          className="hey-topbar__menu-toggle"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileSidebarOpen}
        >
          <Menu size={22} />
        </button>

        <div className="hey-topbar__search" onClick={handleCommandPaletteOpen}>
          <Search size={18} className="hey-topbar__search-icon" aria-hidden="true" />
          <span className="hey-topbar__search-placeholder">Search HEY…</span>
          <kbd className="hey-topbar__search-shortcut">⌘K</kbd>
        </div>

        <div className="hey-topbar__actions">
          <div className="hey-topbar__theme" ref={themeRef}>
            <button
              type="button"
              className="hey-topbar__theme-trigger"
              onClick={() => setThemeOpen(!themeOpen)}
              aria-expanded={themeOpen}
              aria-label="Choose theme"
            >
              <Palette size={18} />
            </button>
            <AnimatePresence>
              {themeOpen && (
                <motion.div
                  className="hey-topbar__theme-menu"
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={springs.snappy}
                >
                  <div className="hey-topbar__theme-header">
                    <strong>HEY Themes</strong>
                    <span>Choose your world</span>
                  </div>
                  <div className="hey-topbar__theme-list">
                    {Object.entries(themes || {}).map(([id, theme]) => (
                      <button
                        key={id}
                        type="button"
                        className={`hey-topbar__theme-option ${themeId === id ? 'active' : ''}`}
                        onClick={() => handleThemeChange(id)}
                      >
                        <span className="hey-topbar__theme-swatch" style={{ background: theme?.accent || customAccent }} />
                        <span>{theme?.name || id}</span>
                        {themeId === id && <span className="hey-topbar__theme-check">✓</span>}
                      </button>
                    ))}
                  </div>
                  {themeId === "custom" && (
                    <div className="hey-topbar__custom-theme">
                      <label>Custom accent</label>
                      <input
                        type="color"
                        value={customAccent}
                        onChange={(e) => setCustomAccent(e.target.value)}
                        className="hey-color-picker"
                        aria-label="Custom HEY accent"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            className="hey-topbar__icon-btn"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Command palette"
          >
            <Search size={18} />
          </button>

          <button
            type="button"
            className="hey-topbar__icon-btn"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </button>

          <div className="hey-topbar__avatar">
            <div className="hey-topbar__avatar-ring" aria-hidden="true">U</div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <a className="hey-skip-link" href="#main-content">Skip to content</a>
      <main id="main-content" tabIndex={-1} className="hey-main-content" style={{ marginLeft: sidebarCollapsed ? 68 : 244 }}>
        <Outlet />
      </main>

      <DynamicIsland />

      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  );
}