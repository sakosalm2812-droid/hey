import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Check } from 'lucide-react';
import './ContextMenu.css';

export function ContextMenu({
  trigger,
  items = [],
  open: controlledOpen,
  onOpenChange,
  className = '',
  align = 'start',
  ...props
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const isControlled = controlledOpen !== undefined;

  const openMenu = (e, pos) => {
    e.preventDefault();
    const coords = pos || { x: e.clientX, y: e.clientY };
    setPosition(coords);
    setOpen(true);
    onOpenChange?.(true);
  };

  const closeMenu = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      closeMenu();
      triggerRef.current?.focus();
    }
  }, [closeMenu]);

  const handleOutsideClick = useCallback((e) => {
    if (menuRef.current && !menuRef.current.contains(e.target) && triggerRef.current && !triggerRef.current.contains(e.target)) {
      closeMenu();
    }
  }, [closeMenu]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('pointerdown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [open, handleKeyDown, handleOutsideClick]);

  const handleItemClick = (item, e) => {
    if (item.disabled) return;
    item.onClick?.(e);
    if (!item.submenu) closeMenu();
  };

  const RenderItem = ({ item, depth = 0 }) => {
    if (item.type === 'separator') {
      return <div className="hey-context-menu__separator" role="separator" />;
    }

    if (item.submenu) {
      return <SubmenuItem item={item} depth={depth} renderItem={RenderItem} />;
    }

    return (
      <button
        type="button"
        className={`hey-context-menu__item ${item.selected ? 'hey-context-menu__item--selected' : ''} ${item.danger ? 'hey-context-menu__item--danger' : ''} ${item.disabled ? 'hey-context-menu__item--disabled' : ''}`}
        onClick={(e) => handleItemClick(item, e)}
        disabled={item.disabled}
        role="menuitem"
        aria-disabled={item.disabled}
        aria-selected={item.selected}
      >
        {item.icon && <span className="hey-context-menu__icon">{item.icon}</span>}
        <span className="hey-context-menu__label">{item.label}</span>
        {item.shortcut && <kbd className="hey-context-menu__shortcut">{item.shortcut}</kbd>}
        {item.selected && <Check size={14} className="hey-context-menu__check" />}
      </button>
    );
  };

  const menuContent = (
    <motion.div
      ref={menuRef}
      className={`hey-context-menu ${className} hey-context-menu--${align}`}
      role="menu"
      initial={{ opacity: 0, scale: 0.97, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 4 }}
      transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
      style={{
        left: position.x,
        top: position.y,
        transformOrigin: align === 'start' ? 'top left' : 'top right',
      }}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => (
        <RenderItem key={index} item={item} />
      ))}
    </motion.div>
  );

  if (typeof trigger === 'function') {
    return trigger({ open: isControlled ? controlledOpen : open, openMenu, closeMenu, menuContent });
  }

  return (
    <>
      <span ref={triggerRef} {...props}>{trigger}</span>
      <AnimatePresence>
        {(isControlled ? controlledOpen : open) && menuContent}
      </AnimatePresence>
    </>
  );
}

ContextMenu.displayName = 'ContextMenu';

function SubmenuItem({ item, depth, renderItem }) {
  const [subOpen, setSubOpen] = useState(false);
  return (
    <div className="hey-context-menu__submenu-wrapper">
      <button
        type="button"
        className={`hey-context-menu__item ${item.disabled ? 'hey-context-menu__item--disabled' : ''}`}
        onClick={() => setSubOpen(!subOpen)}
        onMouseEnter={() => !item.disabled && setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
        disabled={item.disabled}
        aria-haspopup="true"
        aria-expanded={subOpen}
      >
        {item.icon && <span className="hey-context-menu__icon">{item.icon}</span>}
        <span className="hey-context-menu__label">{item.label}</span>
        {item.shortcut && <kbd className="hey-context-menu__shortcut">{item.shortcut}</kbd>}
        <ChevronRight size={12} className="hey-context-menu__submenu-indicator" />
      </button>
      <AnimatePresence>
        {subOpen && (
          <motion.div
            className="hey-context-menu__submenu"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.1 }}
          >
            {item.submenu.map((subItem, index) => (
              <div key={index}>
                {renderItem({ item: subItem, depth: depth + 1 })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ContextMenuTrigger({ children, ...props }) {
  return <ContextMenu trigger={(api) => <span {...api} {...props}>{children}</span>} />;
}

ContextMenuTrigger.displayName = 'ContextMenuTrigger';