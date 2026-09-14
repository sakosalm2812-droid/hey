/**
 * HEY V1 — Performance Tier Provider
 * Applies performance tier classes to document for CSS targeting
 */

import { useEffect } from 'react';
import { usePerformanceTier, useReducedMotion, useReducedTransparency } from '../lib/motion';

export const PerformanceTierProvider = ({ children }) => {
  const tier = usePerformanceTier();
  const reducedMotion = useReducedMotion();
  const reducedTransparency = useReducedTransparency();

  useEffect(() => {
    const html = document.documentElement;

    // Apply performance tier
    html.classList.remove('hey-tier-full', 'hey-tier-balanced', 'hey-tier-lightweight');
    html.classList.add(`hey-tier-${tier}`);

    // Apply reduced motion
    if (reducedMotion) {
      html.classList.add('hey-reduced-motion');
    } else {
      html.classList.remove('hey-reduced-motion');
    }

    // Apply reduced transparency
    if (reducedTransparency) {
      html.classList.add('hey-reduced-transparency');
    } else {
      html.classList.remove('hey-reduced-transparency');
    }

    // Battery saver detection
    if ('getBattery' in navigator) {
      navigator.getBattery?.().then((battery) => {
        const handleChange = () => {
          if (battery.savingMode) {
            html.classList.add('hey-battery-saver');
          } else {
            html.classList.remove('hey-battery-saver');
          }
        };
        handleChange();
        battery.addEventListener('chargingchange', handleChange);
        battery.addEventListener('levelchange', handleChange);
        return () => {
          battery.removeEventListener('chargingchange', handleChange);
          battery.removeEventListener('levelchange', handleChange);
        };
      });
    }
  }, [tier, reducedMotion, reducedTransparency]);

  return children;
};

export default PerformanceTierProvider;