import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Popover.css';

export function Popover({
  trigger,
  content,
  open: controlledOpen,
  onOpenChange,
  position = 'bottom',
  offset = 8,
  closeOnClickOutside = true,
  closeOnEscape = true,
  className = '',
  ...props
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);
  const isControlled = controlledOpen !== undefined;
  const popoverOpen = isControlled ? controlledOpen : open;

  const openPopover = useCallback(() => {
    setOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const closePopover = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const togglePopover = useCallback(() => {
    if (popoverOpen) {
      closePopover();
    } else {
      openPopover();
    }
  }, [popoverOpen, closePopover, openPopover]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && closeOnEscape) {
      closePopover();
      triggerRef.current?.focus();
    }
  }, [closeOnEscape, closePopover]);

  const handleOutsideClick = useCallback((e) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target) && triggerRef.current && !triggerRef.current.contains(e.target)) {
      closePopover();
    }
  }, [closePopover]);

  useEffect(() => {
    if (popoverOpen) {
      document.addEventListener('keydown', handleKeyDown);
      if (closeOnClickOutside) {
        document.addEventListener('pointerdown', handleOutsideClick);
      }
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [popoverOpen, closeOnClickOutside, handleKeyDown, handleOutsideClick]);

  const positionStyles = {
    top: { bottom: `calc(100% + ${offset}px)`, left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: `calc(100% + ${offset}px)`, left: '50%', transform: 'translateX(-50%)' },
    left: { right: `calc(100% + ${offset}px)`, top: '50%', transform: 'translateY(-50%)' },
    right: { left: `calc(100% + ${offset}px)`, top: '50%', transform: 'translateY(-50%)' },
    'top-start': { bottom: `calc(100% + ${offset}px)`, left: 0, transform: 'none' },
    'top-end': { bottom: `calc(100% + ${offset}px)`, right: 0, transform: 'none' },
    'bottom-start': { top: `calc(100% + ${offset}px)`, left: 0, transform: 'none' },
    'bottom-end': { top: `calc(100% + ${offset}px)`, right: 0, transform: 'none' },
    'left-start': { right: `calc(100% + ${offset}px)`, top: 0, transform: 'none' },
    'left-end': { right: `calc(100% + ${offset}px)`, bottom: 0, transform: 'none' },
    'right-start': { left: `calc(100% + ${offset}px)`, top: 0, transform: 'none' },
    'right-end': { left: `calc(100% + ${offset}px)`, bottom: 0, transform: 'none' },
  };

  const arrowStyles = {
    top: { bottom: '-6px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', borderTopColor: 'var(--border)', borderLeftColor: 'var(--border)' },
    bottom: { top: '-6px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', borderBottomColor: 'var(--border)', borderRightColor: 'var(--border)' },
    left: { right: '-6px', top: '50%', transform: 'translateY(-50%) rotate(45deg)', borderTopColor: 'var(--border)', borderRightColor: 'var(--border)' },
    right: { left: '-6px', top: '50%', transform: 'translateY(-50%) rotate(45deg)', borderBottomColor: 'var(--border)', borderLeftColor: 'var(--border)' },
  };

  const basePosition = position.split('-')[0];
  const style = positionStyles[position] || positionStyles[basePosition];
  const arrowStyle = arrowStyles[basePosition] || arrowStyles.bottom;

  const renderTrigger = () => {
    if (typeof trigger === 'function') {
      return trigger({ open: popoverOpen, openPopover, closePopover, togglePopover });
    }
    return (
      <span ref={triggerRef} {...props} onClick={togglePopover}>{trigger}</span>
    );
  };

  return (
    <>
      {renderTrigger()}
      <AnimatePresence>
        {popoverOpen && (
          <motion.div
            ref={popoverRef}
            className={`hey-popover hey-popover--${position} ${className}`}
            role="dialog"
            aria-modal="false"
            initial={{ opacity: 0, scale: 0.95, y: basePosition === 'top' ? 8 : basePosition === 'bottom' ? -8 : 0, x: basePosition === 'left' ? 8 : basePosition === 'right' ? -8 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: basePosition === 'top' ? 8 : basePosition === 'bottom' ? -8 : 0, x: basePosition === 'left' ? 8 : basePosition === 'right' ? -8 : 0 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            style={style}
          >
            <div className="hey-popover__arrow" style={arrowStyle} aria-hidden="true" />
            <div className="hey-popover__content">{content}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

Popover.displayName = 'Popover';

export function PopoverTrigger({ children, ...props }) {
  return <Popover trigger={(api) => <span {...api} {...props}>{children}</span>} />;
}

PopoverTrigger.displayName = 'PopoverTrigger';