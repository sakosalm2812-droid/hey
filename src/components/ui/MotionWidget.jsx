/**
 * HEY V1 — Motion Widget Component
 * Implements Section 15: Widget Motion
 */

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { useReducedMotion, useFLIP, springPresets, useInterruptibleAnimation } from '../../lib/motion';
import '../../styles/motion.css';

interface WidgetProps {
  id: string;
  title: string;
  children: React.ReactNode;
  minimizable?: boolean;
  maximizable?: boolean;
  closable?: boolean;
  resizable?: boolean;
  draggable?: boolean;
  defaultSize?: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  onMinimize?: (id: string) => void;
  onMaximize?: (id: string) => void;
  onClose?: (id: string) => void;
  onResize?: (id: string, size: { width: number; height: number }) => void;
  onMove?: (id: string, position: { x: number; y: number }) => void;
  className?: string;
}

const MotionWidget = forwardRef(({
  id,
  title,
  children,
  minimizable = true,
  maximizable = true,
  closable = true,
  resizable = true,
  draggable = true,
  defaultSize = { width: 320, height: 240 },
  defaultPosition = { x: 100, y: 100 },
  onMinimize,
  onMaximize,
  onClose,
  onResize,
  onMove,
  className = '',
}, ref) => {
  const reduced = useReducedMotion();
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [size, setSize] = useState(defaultSize);
  const [position, setPosition] = useState(defaultPosition);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const widgetRef = useRef(null);
  const headerRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const { flip } = useFLIP();
  const { startAnimation, interrupt } = useInterruptibleAnimation();

  // Initialize position
  useEffect(() => {
    if (widgetRef.current) {
      widgetRef.current.style.left = `${position.x}px`;
      widgetRef.current.style.top = `${position.y}px`;
      widgetRef.current.style.width = `${size.width}px`;
      widgetRef.current.style.height = `${size.height}px`;
    }
  }, []);

  const handleDragStart = useCallback((e) => {
    if (!draggable || minimized || maximized) return;
    if (e.target.closest('.hey-widget-header-button')) return;

    const rect = widgetRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDragging(true);
    widgetRef.current?.classList.add('hey-widget-dragging');

    if (!reduced) {
      widgetRef.current.style.transition = 'none';
      widgetRef.current.style.zIndex = 'var(--z-widget-selected)';
    }
  }, [draggable, minimized, maximized, reduced]);

  const handleDragMove = useCallback((e) => {
    if (!dragging) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Direct 1:1 pointer response - no easing while dragging
    setPosition({ x: newX, y: newY });
    widgetRef.current.style.left = `${newX}px`;
    widgetRef.current.style.top = `${newY}px`;
  }, [dragging, dragOffset]);

  const handleDragEnd = useCallback(async () => {
    if (!dragging) return;
    setDragging(false);
    widgetRef.current?.classList.remove('hey-widget-dragging');

    if (!reduced) {
      // Snap animation
      await startAnimation(async () => {
        widgetRef.current.style.transition = 'transform 200ms cubic-bezier(.75,.05,.85,.06)';
        widgetRef.current.style.zIndex = 'var(--z-widget)';
      });
    }

    onMove?.(id, position);
  }, [dragging, id, onMove, reduced, startAnimation]);

  const handleResizeStart = useCallback((e) => {
    if (!resizable || minimized || maximized) return;
    e.stopPropagation();
    setResizing(true);
    widgetRef.current?.classList.add('hey-widget-resizing');
    if (!reduced) {
      widgetRef.current.style.transition = 'none';
    }
  }, [resizable, minimized, maximized, reduced]);

  const handleResizeMove = useCallback((e) => {
    if (!resizing) return;

    const rect = widgetRef.current?.getBoundingClientRect();
    if (!rect) return;

    const newWidth = Math.max(200, e.clientX - rect.left);
    const newHeight = Math.max(150, e.clientY - rect.top);

    setSize({ width: newWidth, height: newHeight });
    widgetRef.current.style.width = `${newWidth}px`;
    widgetRef.current.style.height = `${newHeight}px`;
  }, [resizing]);

  const handleResizeEnd = useCallback(async () => {
    if (!resizing) return;
    setResizing(false);
    widgetRef.current?.classList.remove('hey-widget-resizing');

    if (!reduced) {
      await startAnimation(async () => {
        widgetRef.current.style.transition = 'width 200ms cubic-bezier(.22,1,.36,1), height 200ms cubic-bezier(.22,1,.36,1)';
      });
    }

    onResize?.(id, size);
  }, [resizing, id, onResize, reduced, startAnimation]);

  // Global mouse handlers
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
    }
    if (resizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [dragging, resizing, handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd]);

  const handleMinimize = useCallback(async () => {
    if (!minimizable) return;
    setMinimized(true);
    widgetRef.current?.classList.add('hey-widget-minimizing');

    if (!reduced) {
      await startAnimation(async () => {
        widgetRef.current.style.transition = 'transform 250ms cubic-bezier(.22,1,.36,1), opacity 250ms cubic-bezier(.22,1,.36,1)';
        widgetRef.current.style.transform = 'scale(0.8) translateY(20px)';
        widgetRef.current.style.opacity = '0';
      });
    }

    onMinimize?.(id);
  }, [minimizable, id, onMinimize, reduced, startAnimation]);

  const handleMaximize = useCallback(async () => {
    if (!maximizable) return;
    const wasMinimized = minimized;
    setMaximized(true);
    setMinimized(false);

    if (!reduced) {
      await startAnimation(async () => {
        widgetRef.current.style.transition = 'width 350ms cubic-bezier(.75,.05,.85,.06), height 350ms cubic-bezier(.75,.05,.85,.06), left 350ms cubic-bezier(.75,.05,.85,.06), top 350ms cubic-bezier(.75,.05,.85,.06)';
        widgetRef.current.style.width = 'calc(100vw - 40px)';
        widgetRef.current.style.height = 'calc(100vh - 120px)';
        widgetRef.current.style.left = '20px';
        widgetRef.current.style.top = '60px';
      });
    } else {
      widgetRef.current.style.width = 'calc(100vw - 40px)';
      widgetRef.current.style.height = 'calc(100vh - 120px)';
      widgetRef.current.style.left = '20px';
      widgetRef.current.style.top = '60px';
    }

    onMaximize?.(id);
  }, [maximizable, minimized, id, onMaximize, reduced, startAnimation]);

  const handleClose = useCallback(async () => {
    if (!closable) return;
    widgetRef.current?.classList.add('hey-widget-closing');

    if (!reduced) {
      await startAnimation(async () => {
        widgetRef.current.style.transition = 'transform 160ms cubic-bezier(.22,1,.36,1), opacity 160ms cubic-bezier(.22,1,.36,1)';
        widgetRef.current.style.transform = 'scale(0.98)';
        widgetRef.current.style.opacity = '0';
      });
    }

    onClose?.(id);
  }, [closable, id, onClose, reduced, startAnimation]);

  const getWidgetClass = () => {
    const classes = ['hey-motion-widget'];
    if (minimized) classes.push('minimized');
    if (maximized) classes.push('maximized');
    if (dragging) classes.push('dragging');
    if (resizing) classes.push('resizing');
    if (className) classes.push(className);
    return classes.join(' ');
  };

  return (
    <div
      ref={widgetRef}
      className={getWidgetClass()}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        transition: reduced ? 'none' : 'transform 200ms cubic-bezier(.22,1,.36,1), box-shadow 200ms cubic-bezier(.22,1,.36,1)',
      }}
      role="region"
      aria-label={title}
    >
      <header
        ref={headerRef}
        className="hey-widget-header"
        onMouseDown={handleDragStart}
      >
        <h3 className="hey-widget-title">{title}</h3>
        <div className="hey-widget-controls">
          {minimizable && (
            <button
              className="hey-widget-header-button"
              onClick={handleMinimize}
              aria-label="Minimize"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          {maximizable && (
            <button
              className="hey-widget-header-button"
              onClick={handleMaximize}
              aria-label={maximized ? 'Restore' : 'Maximize'}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                {maximized ? (
                  <>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                    <path d="M21 8V5a2 2 0 0 0-2-2H8" />
                    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                  </>
                ) : (
                  <>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                    <path d="M21 8V5a2 2 0 0 0-2-2H8" />
                    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                  </>
                )}
              </svg>
            </button>
          )}
          {closable && (
            <button
              className="hey-widget-header-button hey-widget-close"
              onClick={handleClose}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="hey-widget-content">
        {children}
      </div>

      {resizable && !minimized && !maximized && (
        <div
          ref={resizeHandleRef}
          className="hey-widget-resize-handle"
          onMouseDown={handleResizeStart}
          aria-label="Resize"
        />
      )}
    </div>
  );
});

MotionWidget.displayName = 'MotionWidget';

export default MotionWidget;