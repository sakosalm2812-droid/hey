/**
 * HEY V1 — HEY Live Motion Component
 * Implements Section 13: HEY Live Motion
 */

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { useReducedMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

type LiveMode = 'guide' | 'assist' | 'act';
type LiveSource = 'screen' | 'camera' | 'window';

interface LivePointer {
  x: number;
  y: number;
  visible: boolean;
}

interface LiveAnnotation {
  id: string;
  type: 'arrow' | 'circle' | 'rectangle' | 'text';
  x: number;
  y: number;
  color: string;
  content?: string;
}

interface MotionLiveProps {
  mode: LiveMode;
  source: LiveSource;
  active: boolean;
  pointer?: LivePointer;
  annotations?: LiveAnnotation[];
  onSourceChange?: (source: LiveSource) => void;
  onModeChange?: (mode: LiveMode) => void;
  onAnnotate?: (annotation: LiveAnnotation) => void;
  className?: string;
}

const MotionLive = forwardRef(({
  mode = 'guide',
  source = 'screen',
  active = false,
  pointer,
  annotations = [],
  onSourceChange,
  onModeChange,
  onAnnotate,
  className = '',
}, ref) => {
  const reduced = useReducedMotion();
  const [currentSource, setCurrentSource] = useState(source);
  const [sensingBadgeVisible, setSensingBadgeVisible] = useState(false);
  const preset = useMotionPreset('standard');
  const fastPreset = useMotionPreset('fast');

  // Source switch animation (section 13)
  useEffect(() => {
    if (source === currentSource) return;

    if (!reduced) {
      // Current source scales to 0.985 + darkens
      // New source crossfades
      const handleSwitch = async () => {
        // Phase 1: current source scales down
        // Phase 2: new source appears
        // Phase 3: source label updates
      };
      handleSwitch();
    }

    setCurrentSource(source);
  }, [source, currentSource, reduced]);

  // Sensing badge
  useEffect(() => {
    if (!active) {
      setSensingBadgeVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      setSensingBadgeVisible(true);
    }, 160);

    return () => clearTimeout(timer);
  }, [active]);

  // Pointer guidance animation
  const [pointerHighlight, setPointerHighlight] = useState(false);
  const [pointerPath, setPointerPath] = useState([]);

  useEffect(() => {
    if (!pointer?.visible || reduced) return;

    setPointerHighlight(true);
    // Draw path over 220ms
    setTimeout(() => {
      setPointerHighlight(false);
    }, 220);
  }, [pointer?.visible, reduced]);

  // Mode-specific highlight colors
  const getModeStyles = () => {
    switch (mode) {
      case 'guide':
        return { '--live-highlight': 'var(--info)', '--live-glow': 'rgba(201,212,224,0.3)' };
      case 'assist':
        return { '--live-highlight': 'var(--accent)', '--live-glow': 'rgba(142,216,255,0.4)' };
      case 'act':
        return { '--live-highlight': 'var(--success)', '--live-glow': 'rgba(124,184,124,0.5)' };
    }
  };

  const getTargetStyles = () => {
    if (!pointer?.visible) return {};

    return {
      left: `${pointer.x}px`,
      top: `${pointer.y}px`,
      '--highlight-color': getModeStyles()['--live-highlight'],
    };
  };

  return (
    <div
      ref={ref}
      className={`hey-live hey-live-${mode} ${active ? 'active' : ''} ${className}`}
      style={getModeStyles() as React.CSSProperties}
      role="region"
      aria-label={`HEY Live - ${mode} mode`}
    >
      {/* Source indicator */}
      <div className="hey-live-source-bar">
        <button
          className={`hey-live-source-btn ${currentSource === 'screen' ? 'active' : ''}`}
          onClick={() => onSourceChange?.('screen')}
          aria-pressed={currentSource === 'screen'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
          Screen
        </button>
        <button
          className={`hey-live-source-btn ${currentSource === 'camera' ? 'active' : ''}`}
          onClick={() => onSourceChange?.('camera')}
          aria-pressed={currentSource === 'camera'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          Camera
        </button>
        <button
          className={`hey-live-source-btn ${currentSource === 'window' ? 'active' : ''}`}
          onClick={() => onSourceChange?.('window')}
          aria-pressed={currentSource === 'window'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M6 3v14" />
            <path d="M18 3v14" />
          </svg>
          Window
        </button>
      </div>

      {/* Sensing badge */}
      {sensingBadgeVisible && active && (
        <div className="hey-live-sensing-badge" role="status" aria-live="polite">
          <span className="hey-live-sensing-dot" />
          <span>HEY is watching</span>
        </div>
      )}

      {/* Video feed area */}
      <div className="hey-live-feed" role="img" aria-label="Live camera/screen feed">
        {/* Video element would go here */}
        <div className="hey-live-placeholder">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
          <p>Live feed</p>
        </div>

        {/* Pointer guidance */}
        {pointer?.visible && (
          <div
            className="hey-live-pointer-target"
            style={getTargetStyles()}
            role="presentation"
            aria-hidden="true"
          >
            <div className="hey-live-pointer-ring" />
            <div className="hey-live-pointer-dot" />
            {pointerPath.length > 0 && (
              <svg className="hey-live-pointer-path" viewBox="0 0 100 100">
                <path
                  d={pointerPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                  stroke="var(--live-highlight)"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="5,5"
                  style={{ animation: 'hey-dash 2s linear infinite' }}
                />
              </svg>
            )}
          </div>
        )}

        {/* Annotations */}
        {annotations.map((annotation) => (
          <LiveAnnotationOverlay
            key={annotation.id}
            annotation={annotation}
            reduced={reduced}
          />
        ))}
      </div>

      {/* Mode selector */}
      <div className="hey-live-mode-selector" role="radiogroup" aria-label="Live mode">
        {(['guide', 'assist', 'act'] as LiveMode[]).map((m) => (
          <button
            key={m}
            className={`hey-live-mode-btn ${mode === m ? 'active' : ''}`}
            onClick={() => onModeChange?.(m)}
            role="radio"
            aria-checked={mode === m}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
});

MotionLive.displayName = 'MotionLive';

// Annotation overlay component
const LiveAnnotationOverlay = ({ annotation, reduced }) => {
  const baseStyles = {
    left: `${annotation.x}px`,
    top: `${annotation.y}px`,
    '--annotation-color': annotation.color,
  };

  switch (annotation.type) {
    case 'arrow':
      return (
        <div className="hey-live-annotation hey-live-arrow" style={baseStyles as React.CSSProperties}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--annotation-color)" strokeWidth="3">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </div>
      );
    case 'circle':
      return (
        <div className="hey-live-annotation hey-live-circle" style={baseStyles as React.CSSProperties}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--annotation-color)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
      );
    case 'rectangle':
      return (
        <div className="hey-live-annotation hey-live-rectangle" style={baseStyles as React.CSSProperties}>
          <svg viewBox="0 0 24 24" width="60" height="40" fill="none" stroke="var(--annotation-color)" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2" />
          </svg>
        </div>
      );
    case 'text':
      return (
        <div className="hey-live-annotation hey-live-text" style={baseStyles as React.CSSProperties}>
          <span>{annotation.content}</span>
        </div>
      );
    default:
      return null;
  }
};

export default MotionLive;