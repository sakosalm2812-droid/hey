import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MessageCircle,
  Globe2,
  Hammer,
  Sparkles,
  Settings,
  Brain,
  CheckSquare,
  CalendarDays,
  BarChart3,
  LockKeyhole,
  FolderGit2,
  Moon,
  BookOpen,
  CreditCard,
  Target,
  Activity,
  FileText,
  Bot,
  Zap,
  HardDrive,
  Terminal,
  HelpCircle,
  SlidersHorizontal,
  Mic2,
  ChevronLeft,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { buzz } from "../../lib/heyFeedback";

const navSections = [
  {
    label: "Core",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "HEY Chat", path: "/chat", icon: MessageCircle },
      { label: "Voice Live", path: "/voice/live", icon: Mic2 },
      { label: "Cosmos", path: "/cosmos", icon: Globe2 },
      { label: "Forge", path: "/forge", icon: Hammer },
      { label: "Memory", path: "/memory", icon: Brain },
      { label: "Tasks", path: "/tasks", icon: CheckSquare },
      { label: "Calendar", path: "/calendar", icon: CalendarDays },
      { label: "Projects", path: "/projects", icon: FolderGit2 },
      { label: "Studio", path: "/studio", icon: Sparkles },
    ],
  },
  {
    label: "Productivity",
    items: [
      { label: "Analytics", path: "/analytics", icon: BarChart3 },
      { label: "Deen", path: "/deen", icon: Moon },
      { label: "Learn", path: "/learn", icon: BookOpen },
      { label: "Finance", path: "/finance", icon: CreditCard },
      { label: "Goals", path: "/goals", icon: Target },
      { label: "Habits", path: "/habits", icon: CheckSquare },
      { label: "Health", path: "/health", icon: Activity },
      { label: "Journal", path: "/journal", icon: FileText },
      { label: "Notes", path: "/notes", icon: FileText },
      { label: "Modes", path: "/modes", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Advanced",
    items: [
      { label: "Agents", path: "/agents", icon: Bot },
      { label: "Capabilities", path: "/capabilities", icon: Zap },
      { label: "Devices", path: "/device", icon: HardDrive },
      { label: "Permissions", path: "/permissions", icon: LockKeyhole },
      { label: "Debug", path: "/debug", icon: Terminal },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Settings", path: "/settings", icon: Settings },
      { label: "Help", path: "/support", icon: HelpCircle },
    ],
  },
];

export function Sidebar({ collapsed = false, onToggle, className = '' }) {
  const location = useLocation();

  return (
    <aside
      className={`hey-sidebar ${collapsed ? 'hey-sidebar--collapsed' : ''} ${className}`}
      style={{ width: collapsed ? 68 : 244 }}
      aria-label="Main navigation"
    >
      <div className="hey-sidebar__header">
        <NavLink
          to="/dashboard"
          className="hey-sidebar__brand"
          aria-label="HEY Dashboard"
        >
          <span className="hey-sidebar__logo">H</span>
          {!collapsed && <span className="hey-script hey-sidebar__title">HEY</span>}
        </NavLink>
        {!collapsed && (
          <button
            type="button"
            className="hey-sidebar__toggle"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      <nav className="hey-sidebar__nav" aria-label="Main navigation">
        {navSections.map((section) => (
          <div key={section.label} className="hey-sidebar__section">
            {!collapsed && (
              <li className="hey-sidebar__divider">
                <span>{section.label}</span>
              </li>
            )}
            <ul className="hey-sidebar__list" role="list">
              {section.items.map((item) => {
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
                    >
                      <Icon size={20} className="hey-sidebar__icon" aria-hidden="true" />
                      {!collapsed && <span className="hey-sidebar__label">{item.label}</span>}
                      {isActive && !collapsed && <span className="hey-sidebar__indicator" aria-hidden="true" />}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="hey-sidebar__footer">
        {!collapsed && (
          <div className="hey-sidebar__user">
            <div className="hey-sidebar__user-info">
              <div className="hey-sidebar__avatar" aria-hidden="true">U</div>
              <div className="hey-sidebar__user-details">
                <span className="hey-sidebar__user-name">User</span>
                <span className="hey-sidebar__user-plan">Pro</span>
              </div>
            </div>
          </div>
        )}
        <NavLink
          to="/settings"
          className="hey-sidebar__settings"
          aria-label="Settings"
        >
          <Settings size={20} />
        </NavLink>
      </div>
    </aside>
  );
}

Sidebar.displayName = 'Sidebar';