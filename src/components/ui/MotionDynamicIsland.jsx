/**
 * HEY V1 — Dynamic Island Component
 * Implements Section 14: Dynamic Island Motion
 */

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { useReducedMotion, springPresets, useInterruptibleAnimation } from '../../lib/motion';
import '../../styles/motion.css';

type IslandState = 'collapsed' | 'listening' | 'thinking' | 'expanded' | 'progress' | 'success' | 'error';
type IslandSize = 'compact' | 'full';

interface DynamicIslandProps {
  state: IslandState;
  size?: IslandSize;
  onExpand?: () => void;
  onCollapse?: () => void;
  onAction?: (action: string) => void;
  children?: React.ReactNode;
  className?: string;
  // Listening state
  audioLevel?: number; // 0-1
  // Thinking state
  thinkingMessage?: string;
  // Progress state
  progress?: number; // 0-1
  // Success state
  successMessage?: string;
  // Error state
  errorMessage?: string;
}

const DynamicIsland = forwardRef(({
  state = 'collapsed',
  size = 'compact',
  onExpand,
  onCollapse,
  onAction,
  children,
  className = '',
  audioLevel = 0,
  thinkingMessage,
  progress = 0,
  successMessage,
  errorMessage,
}, ref) => {
  const reduced = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(size === 'full');
  const [width, setWidth] = useState(120);
  const islandRef = useRef(null);
  const { startAnimation, interrupt } = useInterruptibleAnimation();
  const spring = springPresets.island;

  // Handle state changes with proper transitions
  useEffect(() => {
    const handleStateChange = async () => {
      if (reduced) {
        // Instant transitions in reduced motion
        switch (state) {
          case 'collapsed':
            setIsExpanded(false);
            setWidth(120);
            break;
          case 'listening':
            setWidth(140);
            break;
          case 'expanded':
            setIsExpanded(true);
            setWidth(320);
            break;
          default:
            break;
        }
        return;
      }

      // Animated transitions
      await startAnimation(async () => {
        switch (state) {
          case 'collapsed':
            setIsExpanded(false);
            setWidth(120);
            break;
          case 'listening':
            setWidth(120 + audioLevel * 20);
            break;
          case 'thinking':
            // Light travels across surface
            break;
          case 'expanded':
            setIsExpanded(true);
            setWidth(320);
            break;
          case 'progress':
            break;
          case 'success':
            // Check morph animation
            break;
          case 'error':
            break;
        }
      });
    };

    handleStateChange();
  }, [state, audioLevel, reduced, startAnimation]);

  // Handle expanded content hierarchy fade-in
  useEffect(() => {
    if (!isExpanded || reduced) return;

    const hierarchy = ['status', 'primaryControl', 'secondaryInfo'];
    hierarchy.forEach((item, index) => {
      setTimeout(() => {
        // Trigger fade-in for each hierarchy level
      }, index * 80);
    });
  }, [isExpanded, reduced]);

  // Collapse order: secondary info fades first, then shape morphs
  const handleCollapse = useCallback(async () => {
    if (reduced) {
      setIsExpanded(false);
      setWidth(120);
      onCollapse?.();
      return;
    }

    await startAnimation(async () => {
      // Fade out secondary info
      // Then morph shape
      setTimeout(() => {
        setIsExpanded(false);
        setWidth(120);
        onCollapse?.();
      }, 200);
    });
  }, [reduced, startAnimation, onCollapse]);

  const handleClick = useCallback(() => {
    if (state === 'collapsed' || state === 'listening') {
      setIsExpanded(true);
      setWidth(320);
      onExpand?.();
    } else if (isExpanded) {
      handleCollapse();
    }
  }, [state, isExpanded, onExpand, handleCollapse]);

  // Keyboard activation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    } else if (e.key === 'Escape' && isExpanded) {
      handleCollapse();
    }
  }, [handleClick, handleCollapse, isExpanded]);

  const getStateClass = () => {
    const classes = ['hey-dynamic-island'];
    if (isExpanded) classes.push('expanded');
    classes.push(`state-${state}`);
    if (className) classes.push(className);
    return classes.join(' ');
  };

  return (
    <div
      ref={ref}
      className={getStateClass()}
      style={{
        width: `${width}px`,
        borderRadius: isExpanded ? 'var(--glass-radius-large)' : '9999px',
        transition: reduced
          ? 'none'
          : `width 300ms cubic-bezier(.75,.05,.85,.06), border-radius 300ms cubic-bezier(.75,.05,.85,.06)`,
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="HEY Dynamic Island"
      aria-expanded={isExpanded}
    >
      {/* Collapsed state */}
      <div className="hey-island-collapsed">
        <div className="hey-island-indicator">
          {state === 'listening' && (
            <div className="hey-island-waveform" style={{ opacity: audioLevel }}>
              <span style={{ height: `${20 + audioLevel * 40}%` }} />
              <span style={{ height: `${15 + audioLevel * 35}%` }} />
              <span style={{ height: `${25 + audioLevel * 45}%` }} />
              <span style={{ height: `${10 + audioLevel * 30}%` }} />
              <span style={{ height: `${30 + audioLevel * 50}%` }} />
            </div>
          )}
          {state === 'thinking' && (
            <div className="hey-island-thinking">
              <div className="hey-island-light-beam" />
            </div>
          )}
          {state === 'progress' && (
            <div className="hey-island-progress-bar" style={{ width: `${progress * 100}%` }} />
          )}
          {state === 'success' && (
            <div className="hey-island-success">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--success)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
          {state === 'error' && (
            <div className="hey-island-error">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--error)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
          )}
          {state === 'collapsed' && (
            <div className="hey-island-idle" />
          )}
        </div>
      </div>

      {/* Expanded state */}
      {isExpanded && (
        <div className="hey-island-expanded">
          <div className="hey-island-status" data-hierarchy="status">
            {state === 'listening' && <span>Listening...</span>}
            {state === 'thinking' && <span>{thinkingMessage || 'Thinking...'}</span>}
            {state === 'progress' && <span>Working... {Math.round(progress * 100)}%</span>}
            {state === 'success' && <span>{successMessage || 'Done'}</span>}
            {state === 'error' && <span>{errorMessage || 'Error'}</span>}
          </div>

          <div className="hey-island-primary" data-hierarchy="primaryControl">
            {children}
          </div>

          <div className="hey-island-secondary" data-hierarchy="secondaryInfo">
            {state === 'expanded' && (
              <div className="hey-island-actions">
                <button
                  className="hey-island-action"
                  onClick={(e) => { e.stopPropagation(); onAction?.('minimize'); }}
                >
                  Minimize
                </button>
                <button
                  className="hey-island-action"
                  onClick={(e) => { e.stopPropagation(); onAction?.('close'); }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

DynamicIsland.displayName = 'DynamicIsland';

export default DynamicIsland;