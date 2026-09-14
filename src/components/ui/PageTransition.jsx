/**
 * HEY V1 — Page Transition Component
 * Implements Section 4: Page Transitions
 */

import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion, sharedTransitions, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';
import PropTypes from 'prop-types';

const PageTransition = ({
  children,
  className = '',
  transitionType = 'default',
  direction = 'forward',
}) => {
  const location = useLocation();
  const reduced = useReducedMotion();
  const [key, setKey] = useState(location.pathname);
  const preset = useMotionPreset('standard');

  // Update key when location changes to trigger transition
  useEffect(() => {
    setKey(location.pathname);
  }, [location.pathname]);

  const getTransitionStyles = () => {
    if (reduced) {
      return {
        transition: `opacity ${preset.duration}ms ${preset.easing}`,
      };
    }

    switch (transitionType) {
      case 'sibling':
        return {
          transition: `opacity ${preset.duration}ms ${preset.easing}, transform ${preset.duration}ms ${preset.easing}`,
        };
      case 'deep':
        return {
          transition: `opacity ${preset.duration}ms ${preset.easing}, transform ${preset.duration}ms ${preset.easing}`,
        };
      default:
        return {
          transition: `opacity ${preset.duration}ms ${preset.easing}, transform ${preset.duration}ms ${preset.easing}`,
        };
    }
  };

  const getInitialStyles = (isExiting = false) => {
    if (reduced) {
      return { opacity: isExiting ? 1 : 0 };
    }

    if (isExiting) {
      return {
        opacity: 0.96,
        transform: 'translateY(0)',
      };
    }

    const baseY = 10;
    const siblingX = direction === 'forward' ? 12 : -12;
    const deepX = direction === 'forward' ? 20 : -20;

    switch (transitionType) {
      case 'sibling':
        return {
          opacity: 0,
          transform: `translateX(${siblingX}px) translateY(${baseY}px)`,
        };
      case 'deep':
        return {
          opacity: 0,
          transform: `translateX(${deepX}px) translateY(${baseY}px)`,
        };
      default:
        return {
          opacity: 0,
          transform: `translateY(${baseY}px)`,
        };
    }
  };

  const getAnimateStyles = () => {
    if (reduced) {
      return { opacity: 1 };
    }
    return {
      opacity: 1,
      transform: 'translateX(0) translateY(0)',
    };
  };

  const getExitStyles = () => {
    if (reduced) {
      return { opacity: 0 };
    }
    return {
      opacity: 0.96,
      transform: 'translateY(0)',
    };
  };

  return (
    <div className={`hey-page-transition ${className}`} style={getTransitionStyles()}>
      <div
        key={key}
        className="hey-page-content"
        style={{
          ...getInitialStyles(),
          animation: reduced ? 'none' : `hey-page-enter ${preset.duration}ms ${preset.easing} forwards`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

PageTransition.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  transitionType: PropTypes.oneOf(['default', 'sibling', 'deep']),
  direction: PropTypes.oneOf(['forward', 'back']),
};

// AnimatePresence-like wrapper for page exports
export const PageTransitionGroup = ({
  children,
  className = '',
}) => {
  const location = useLocation();
  const reduced = useReducedMotion();
  const [pages, setPages] = useState([
    { key: location.pathname, pathname: location.pathname, isExiting: false },
  ]);

  useEffect(() => {
    const currentPage = pages.find(p => p.pathname === location.pathname);
    if (currentPage) {
      // Page already exists, just update
      return;
    }

    // Add new page
    setPages(prev => [
      ...prev.map(p => ({ ...p, isExiting: true })),
      { key: location.pathname, pathname: location.pathname, isExiting: false },
    ]);

    // Remove exited pages after animation
    setTimeout(() => {
      setPages(prev => prev.filter(p => !p.isExiting || p.pathname === location.pathname));
    }, reduced ? 10 : 300);
  }, [location.pathname, reduced]);

  return (
    <div className={`hey-page-transition-group ${className}`}>
      {pages.map((page) => (
        <div
          key={page.key}
          className="hey-page-content"
          style={{
            position: page.isExiting ? 'absolute' : 'relative',
            width: '100%',
            opacity: page.isExiting ? 0.96 : 1,
            transform: page.isExiting ? 'translateY(0)' : 'translateY(0)',
            transition: reduced ? 'opacity 0.01ms' : 'opacity 100ms cubic-bezier(.22,1,.36,1), transform 100ms cubic-bezier(.22,1,.36,1)',
            pointerEvents: page.isExiting ? 'none' : 'auto',
          }}
        >
          {children}
        </div>
      ))}
    </div>
  );
};

PageTransitionGroup.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default PageTransition;