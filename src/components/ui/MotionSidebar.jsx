/**
 * HEY V1 — Motion Sidebar Component
 * Implements Section 5: Sidebar / Navigation Motion
 */

import { useState, useRef, useEffect, forwardRef } from 'react';
import { useReducedMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: string | number;
  onClick?: () => void;
  submenu?: NavItem[];
}

interface MotionSidebarProps {
  items: NavItem[];
  collapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  onNavigate?: (itemId: string) => void;
  className?: string;
  'aria-label'?: string;
}

const MotionSidebar = forwardRef(({
  items,
  collapsed = false,
  onToggle,
  onNavigate,
  className = '',
  'aria-label': ariaLabel = 'Navigation',
}, ref) => {
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(!collapsed);
  const [activeItem, setActiveItem] = useState(null);
  const [openSubmenus, setOpenSubmenus] = useState({});
  const sidebarRef = useRef(null);
  const preset = useMotionPreset('standard');

  useEffect(() => {
    setExpanded(!collapsed);
  }, [collapsed]);

  const handleItemClick = (item) => {
    if (item.submenu) {
      setOpenSubmenus(prev => ({
        ...prev,
        [item.id]: !prev[item.id],
      }));
    } else {
      setActiveItem(item.id);
      onNavigate?.(item.id);
    }
  };

  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onToggle?.(newExpanded);
  };

  return (
    <aside
      ref={sidebarRef}
      className={`hey-motion-sidebar ${expanded ? 'expanded' : 'collapsed'} ${className}`}
      role="navigation"
      aria-label={ariaLabel}
      style={{
        width: expanded ? '244px' : '68px',
        transition: reduced ? 'none' : `width ${preset.duration}ms cubic-bezier(.22,1,.36,1)`,
      }}
    >
      <div className="hey-sidebar-header">
        {expanded && (
          <div className="hey-sidebar-brand">
            <span className="hey-script">HEY</span>
          </div>
        )}
        <button
          className="hey-sidebar-toggle"
          onClick={handleToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            {expanded ? (
              <polyline points="15 18 9 12 15 6" />
            ) : (
              <polyline points="9 18 15 12 9 6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="hey-sidebar-nav" role="list">
        {items.map((item) => (
          <div key={item.id} className="hey-sidebar-item" role="listitem">
            {item.submenu ? (
              <>
                <button
                  className={`hey-sidebar-item-button ${activeItem === item.id ? 'active' : ''} ${openSubmenus[item.id] ? 'open' : ''}`}
                  onClick={() => handleItemClick(item)}
                  aria-expanded={openSubmenus[item.id]}
                  style={{
                    paddingLeft: expanded ? '16px' : '12px',
                  }}
                >
                  <span className="hey-sidebar-icon">{item.icon}</span>
                  {expanded && (
                    <>
                      <span className="hey-sidebar-label">{item.label}</span>
                      {item.badge && <span className="hey-sidebar-badge">{item.badge}</span>}
                      <svg className="hey-sidebar-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </>
                  )}
                </button>
                {expanded && openSubmenus[item.id] && (
                  <div
                    className="hey-sidebar-submenu"
                    role="group"
                    style={{
                      maxHeight: reduced ? 'none' : '0',
                      opacity: reduced ? 1 : 0,
                      transition: reduced ? 'none' : `max-height ${preset.duration}ms cubic-bezier(.22,1,.36,1), opacity ${preset.duration}ms cubic-bezier(.22,1,.36,1)`,
                    }}
                  >
                    {item.submenu.map((subItem, index) => (
                      <button
                        key={subItem.id || index}
                        className={`hey-sidebar-subitem ${activeItem === subItem.id ? 'active' : ''}`}
                        onClick={() => handleItemClick(subItem)}
                        style={{ paddingLeft: '40px' }}
                      >
                        {subItem.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button
                className={`hey-sidebar-item-button ${activeItem === item.id ? 'active' : ''}`}
                onClick={() => handleItemClick(item)}
                style={{
                  paddingLeft: expanded ? '16px' : '12px',
                }}
              >
                <span className="hey-sidebar-icon">{item.icon}</span>
                {expanded && (
                  <>
                    <span className="hey-sidebar-label">{item.label}</span>
                    {item.badge && <span className="hey-sidebar-badge">{item.badge}</span>}
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </nav>

      {expanded && (
        <div className="hey-sidebar-footer">
          <button className="hey-sidebar-footer-item">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" className="hey-sidebar-icon">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="hey-sidebar-label">Settings</span>
          </button>
        </div>
      )}
    </aside>
  );
});

MotionSidebar.displayName = 'MotionSidebar';

export default MotionSidebar;