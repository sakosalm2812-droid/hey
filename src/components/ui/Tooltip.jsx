import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Tooltip.css';

export function Tooltip({
  children,
  content,
  position = 'top',
  delay = 300,
  className = '',
  arrow = true,
  interactive = false,
}) {
  const [visible, setVisible] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);

  const show = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
      requestAnimationFrame(() => setPositioned(true));
    }, delay);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setPositioned(false);
    setTimeout(() => setVisible(false), 150);
  };

  const handleMouseEnter = () => show();
  const handleMouseLeave = (e) => {
    if (interactive && e.relatedTarget && tooltipRef.current?.contains(e.relatedTarget)) return;
    hide();
  };
  const handleFocus = () => show();
  const handleBlur = () => hide();

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const triggerProps = {
    ref: triggerRef,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
  };

  return (
    <>
      <span {...triggerProps} className="hey-tooltip__trigger">{children}</span>
      <AnimatePresence>
        {visible && (
          <motion.div
            ref={tooltipRef}
            className={`hey-tooltip hey-tooltip--${position} ${className} ${positioned ? 'hey-tooltip--visible' : ''}`}
            role="tooltip"
            initial={{ opacity: 0, scale: 0.9, y: position === 'top' ? 8 : position === 'bottom' ? -8 : 0, x: position === 'left' ? 8 : position === 'right' ? -8 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: position === 'top' ? 8 : position === 'bottom' ? -8 : 0, x: position === 'left' ? 8 : position === 'right' ? -8 : 0 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={() => clearTimeout(timeoutRef.current)}
            onMouseLeave={hide}
          >
            {arrow && <span className="hey-tooltip__arrow" aria-hidden="true" />}
            <div className="hey-tooltip__content">{content}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

Tooltip.displayName = 'Tooltip';