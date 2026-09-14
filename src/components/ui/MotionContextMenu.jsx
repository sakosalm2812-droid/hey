/**
 * HEY V1 — Motion Context Menu Component
 * Implements Section 8: Tooltip / Popover / Context Menu
 */

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  divider?: boolean;
  dangerous?: boolean;
  shortcut?: string;
  submenu?: ContextMenuItem[];
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  trigger?: React.ReactElement;
  onClose?: () => void;
  className?: string;
}

const ContextMenu = ({ items, trigger, onClose, className = '' }) => {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [submenuPosition, setSubmenuPosition] = useState(null);
  const menuRef = useRef(null);
  const preset = useMotionPreset('fast');

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSubmenuPosition(null);
    onClose?.();
  }, [onClose]);

  const handleItemClick = useCallback((item) => {
    if (item.disabled) return;
    if (!item.submenu) {
      item.onClick();
      handleClose();
    }
  }, [handleClose]);

  const handleSubmenuHover = useCallback((item, index) => {
    if (!item.submenu) return;
    setSubmenuPosition({ item, index });
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('contextmenu', handlePreventContextMenu);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('contextmenu', handlePreventContextMenu);
    };
  }, [open]);

  const handleOutsideClick = useCallback((e) => {
    if (menuRef.current?.contains(e.target)) return;
    handleClose();
  }, [handleClose]);

  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  const handlePreventContextMenu = useCallback((e) => {
    if (open) e.preventDefault();
  }, [open]);

  if (!trigger) {
    return <div ref={menuRef} className={`hey-context-menu ${className}`} />;
  }

  const childWithContext = React.cloneElement(trigger, {
    onContextMenu: handleContextMenu,
  });

  const renderItems = (itemsToRender, isSubmenu = false) => (
    <div className="hey-context-menu-items" role="menu">
      {itemsToRender.map((item, index) => (
        item.divider ? (
          <div key={`divider-${index}`} className="hey-context-menu-divider" role="separator" />
        ) : (
          <button
            key={index}
            className={`hey-context-menu-item ${item.disabled ? 'disabled' : ''} ${item.dangerous ? 'dangerous' : ''} ${item.submenu ? 'has-submenu' : ''}`}
            role="menuitem"
            aria-disabled={item.disabled}
            aria-haspopup={item.submenu ? 'true' : 'false'}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => handleSubmenuHover(item, index)}
            disabled={item.disabled}
          >
            {item.icon && <span className="hey-context-menu-icon">{item.icon}</span>}
            <span className="hey-context-menu-label">{item.label}</span>
            {item.shortcut && <span className="hey-context-menu-shortcut">{item.shortcut}</span>}
            {item.submenu && (
              <svg className="hey-context-menu-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>
        )
      ))}
    </div>
  );

  return (
    <>
      {childWithContext}
      {open && createPortal(
        <div
          ref={menuRef}
          className={`hey-context-menu ${className}`}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          } as React.CSSProperties}
          role="menu"
        >
          {renderItems(items)}
          {submenuPosition && createPortal(
            <div
              className="hey-context-menu-submenu"
              style={{
                left: `${position.x + 200}px`,
                top: `${position.y + submenuPosition.index * 36}px`,
              } as React.CSSProperties}
              role="menu"
            >
              {renderItems(submenuPosition.item.submenu!, true)}
            </div>,
            document.body
          )}
        </div>,
        document.body
      )}
    </>
  );
};

ContextMenu.displayName = 'ContextMenu';

export default ContextMenu;