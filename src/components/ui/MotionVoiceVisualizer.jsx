/**
 * HEY V1 — Voice Visualizer Component
 * Implements Section 12: Voice Visualizer Motion
 */

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { useReducedMotion, voiceVisualizerMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'muted';

interface VoiceVisualizerProps {
  state: VoiceState;
  audioLevel?: number; // 0-1 for listening
  audioData?: Float32Array; // For speaking visualization
  className?: string;
  size?: number;
}

const VoiceVisualizer = forwardRef(({
  state = 'idle',
  audioLevel = 0,
  audioData,
  className = '',
  size = 80,
}, ref) => {
  const reduced = useReducedMotion();
  const [orbScale, setOrbScale] = useState(1);
  const [ringRadius, setRingRadius] = useState(1);
  const animationRef = useRef(null);
  const idlePreset = useMotionPreset('custom', 4250);
  const fastPreset = useMotionPreset('fast');

  // Idle breathing animation
  useEffect(() => {
    if (state !== 'idle' || reduced) return;

    const animate = () => {
      setOrbScale(prev => prev === 1 ? 1.015 : 1);
      animationRef.current = requestAnimationFrame(animate);
    };

    // Slow breathing cycle
    const cycle = setInterval(() => {
      setOrbScale(1.015);
      setTimeout(() => setOrbScale(1), idlePreset.duration / 2);
    }, idlePreset.duration);

    return () => {
      clearInterval(cycle);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state, reduced, idlePreset.duration]);

  // Listening - amplitude reacts to microphone
  useEffect(() => {
    if (state !== 'listening' || reduced) return;

    const maxExcursion = voiceVisualizerMotion.listening.maxRadiusExcursion;
    const targetRadius = 1 + audioLevel * maxExcursion;
    setRingRadius(targetRadius);
    setOrbScale(1 + audioLevel * 0.05);
  }, [state, audioLevel, reduced]);

  // Thinking - ordered, inward/outward energy
  useEffect(() => {
    if (state !== 'thinking' || reduced) return;

    const animate = () => {
      setRingRadius(prev => prev > 1 ? 0.95 : 1.05);
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state, reduced]);

  // Speaking - driven by audio envelope
  useEffect(() => {
    if (state !== 'speaking' || reduced || !audioData) return;

    const animate = () => {
      if (audioData.length > 0) {
        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
          sum += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sum / audioData.length);
        setOrbScale(1 + rms * 5);
        setRingRadius(1 + rms * 3);
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state, audioData, reduced]);

  // Interrupted - quick contract
  useEffect(() => {
    if (state !== 'interrupted' || reduced) return;

    setOrbScale(0.9);
    setRingRadius(0.9);
    const timer = setTimeout(() => {
      setOrbScale(1);
      setRingRadius(1);
    }, voiceVisualizerMotion.interrupted.contractDuration);

    return () => clearTimeout(timer);
  }, [state, reduced]);

  // Muted - dampened
  useEffect(() => {
    if (state !== 'muted' || reduced) return;
    setOrbScale(0.95);
    setRingRadius(0.95);
  }, [state, reduced]);

  // Reduced motion - static orb with opacity states
  const getStyles = () => {
    if (reduced) {
      const opacities = {
        idle: 0.4,
        listening: 1,
        thinking: 0.7,
        speaking: 1,
        interrupted: 0.5,
        muted: 0.3,
      };
      return {
        transform: 'scale(1)',
        opacity: opacities[state],
      };
    }

    return {
      transform: `scale(${orbScale})`,
      '--ring-radius': ringRadius,
    };
  };

  const getStateColors = () => {
    switch (state) {
      case 'idle': return 'var(--text-muted)';
      case 'listening': return 'var(--accent)';
      case 'thinking': return 'var(--warning)';
      case 'speaking': return 'var(--success)';
      case 'interrupted': return 'var(--error)';
      case 'muted': return 'var(--text-tertiary)';
    }
  };

  return (
    <div
      ref={ref}
      className={`hey-voice-visualizer hey-voice-${state} ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ...getStyles(),
      } as React.CSSProperties}
      role="img"
      aria-label={`Voice state: ${state}`}
    >
      {/* Outer ring */}
      <div
        className="hey-voice-ring"
        style={{
          '--ring-radius': reduced ? 1 : ringRadius,
        } as React.CSSProperties}
      >
        <div className="hey-voice-ring-inner" />
      </div>

      {/* Core orb */}
      <div
        className="hey-voice-orb"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${getStateColors()}20, ${getStateColors()} 50%, #070710)`,
          boxShadow: `0 0 ${size * 0.3}px ${getStateColors()}`,
        } as React.CSSProperties}
      >
        {state === 'listening' && (
          <div className="hey-voice-mic-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
        )}
        {state === 'muted' && (
          <div className="hey-voice-muted-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="8" x2="16" y2="16" />
            </svg>
          </div>
        )}
      </div>

      {/* Particle field for listening/speaking */}
      {(state === 'listening' || state === 'speaking') && !reduced && (
        <div className="hey-voice-particles" aria-hidden="true">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="hey-voice-particle"
              style={{
                '--angle': `${i * 45}deg`,
                '--distance': `${40 + Math.random() * 20}px`,
                '--delay': `${Math.random() * 2}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}
    </div>
  );
});

VoiceVisualizer.displayName = 'VoiceVisualizer';

export default VoiceVisualizer;