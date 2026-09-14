export const tokens = {
  colors: {
    bg: {
      void: '#020508',
      deep: '#020B14',
      ocean: '#061A2A',
    },
    text: {
      primary: '#F5FBFF',
      secondary: 'rgba(245,251,255,.72)',
      tertiary: 'rgba(245,251,255,.48)',
    },
    accent: {
      arctic: '#8ED8FF',
      cyan: '#00BFFF',
      frost: '#D8F4FF',
    },
    glass: {
      0: 'rgba(8,12,17,.78)',
      1: 'rgba(18,24,31,.72)',
      2: 'rgba(28,34,42,.66)',
      raised: 'rgba(38,46,55,.72)',
    },
    semantic: {
      success: '#2E6F57',
      warning: '#F2C14E',
      destructive: '#FF7A8A',
      info: '#8ED8FF',
      neutral: '#C9D4E0',
    },
  },

  typography: {
    fontFamilies: {
      display: ['Orbitron', 'system-ui', 'sans-serif'],
      body: ['Rajdhani', 'Inter', 'system-ui', 'sans-serif'],
      bodyAlt: ['Inter', 'system-ui', 'sans-serif'],
      heading: ['DM Serif Display', 'Georgia', 'serif'],
      serifAccent: ['Instrument Serif', 'Georgia', 'serif'],
      system: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
    },
    scale: {
      displayXL: { desktop: 'clamp(64px, 8vw, 80px)', mobile: 'clamp(48px, 10vw, 64px)' },
      displayL: { desktop: 'clamp(48px, 6vw, 64px)', mobile: 'clamp(36px, 8vw, 48px)' },
      h1: { desktop: 'clamp(40px, 5vw, 48px)', mobile: 'clamp(32px, 7vw, 40px)' },
      h2: { desktop: 'clamp(32px, 4vw, 36px)', mobile: 'clamp(28px, 6vw, 32px)' },
      h3: { desktop: 'clamp(24px, 3vw, 28px)', mobile: 'clamp(22px, 5vw, 24px)' },
      bodyL: { desktop: 'clamp(18px, 2vw, 20px)', mobile: 'clamp(17px, 3vw, 18px)' },
      body: { desktop: 'clamp(15px, 1.5vw, 17px)', mobile: 'clamp(14px, 2.5vw, 16px)' },
      small: { desktop: '13px', mobile: '14px' },
      micro: { desktop: '11px', mobile: '12px' },
    },
    lineHeight: {
      tight: 1.04,
      normal: 1.5,
      relaxed: 1.7,
      loose: 1.8,
    },
    letterSpacing: {
      tight: '-.075em',
      normal: '-.01em',
      wide: '.04em',
      wider: '.12em',
      widest: '.22em',
    },
  },

  spacing: {
    base: 8,
    scale: {
      1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96, 10: 128,
    },
    get: (n) => `${tokens.spacing.scale[n] || n * 8}px`,
  },

  radius: {
    control: '14px',
    button: '16px',
    field: '18px',
    card: '24px',
    largeGlass: '30px',
    hero: '36px',
    sheet: '28px',
    pill: '999px',
  },

  depth: {
    z: {
      canvas: 0,
      widget: 100,
      widgetSelected: 200,
      chrome: 300,
      island: 500,
      popover: 700,
      toast: 800,
      modalBackdrop: 900,
      modal: 1000,
      security: 1200,
      tutorial: 1300,
    },
    elevation: {
      0: '0 0 0 rgba(0,0,0,0)',
      1: '0 2px 8px rgba(0,0,0,.08)',
      2: '0 8px 24px rgba(0,0,0,.12)',
      3: '0 16px 48px rgba(0,0,0,.16)',
      4: '0 24px 80px rgba(0,0,0,.22)',
      5: '0 32px 100px rgba(0,0,0,.3)',
    },
  },

  motion: {
    easing: {
      primary: 'cubic-bezier(.22, 1, .36, 1)',
      fastOut: 'cubic-bezier(.16, 1, .3, 1)',
      press: 'cubic-bezier(.2, .8, .2, 1)',
      linear: 'linear',
    },
    duration: {
      instant: '80ms',
      micro: '120ms',
      fast: '160ms',
      standard: '240ms',
      medium: '300ms',
      large: '420ms',
      panel: '500ms',
      cinematicMin: '700ms',
      cinematicMax: '1200ms',
      tutorialStepMin: '700ms',
      tutorialStepMax: '1600ms',
    },
    spring: {
      gentle: { damping: 0.8, stiffness: 120 },
      standard: { damping: 0.7, stiffness: 180 },
      snappy: { damping: 0.6, stiffness: 280 },
      morph: { damping: 0.75, stiffness: 160 },
    },
    distance: {
      micro: { min: '2px', max: '4px' },
      small: { min: '6px', max: '12px' },
      panel: { min: '16px', max: '24px' },
      page: { min: '24px', max: '40px' },
      large: { min: '40px', max: '80px' },
    },
    scale: {
      hoverLift: { min: 1.005, max: 1.015 },
      press: { min: 0.985, max: 0.995 },
      modalEnter: { from: 0.975, to: 1 },
      widgetPickup: { from: 1, to: 1.015 },
      heroMax: 1.08,
    },
    blur: {
      enterMax: '12px',
      decorativeMax: '12px',
      backdrop: '28px',
      backdropStrong: '32px',
    },
    reduced: {
      translation: 'fade',
      zoom: 'fade',
      parallax: 'none',
      breathing: 'static',
      graphDrift: 'static',
      sharedElement: 'crossfade',
      liquidMorph: 'simple',
      tutorialGesture: 'static-frames',
    },
  },

  glass: {
    blur: '24px',
    saturate: '130%',
    border: '1px solid rgba(255,255,255,.12)',
    highlight: 'rgba(255,255,255,.2)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,.14), inset 0 -1px 0 rgba(0,0,0,.2), 0 24px 80px rgba(0,0,0,.22)',
    hoverShadow: 'inset 0 1px 0 rgba(255,255,255,.3), inset 0 -1px 0 rgba(0,0,0,.22), 0 30px 90px rgba(0,0,0,.3), 0 0 42px rgba(255,255,255,.1)',
  },

  layout: {
    navHeight: '72px',
    contentMaxWidth: '1400px',
    sidebar: { collapsed: '68px', expanded: '244px' },
    gutters: { wideDesktop: '48px', desktop: '32px', tablet: '24px', mobile: '20px' },
    pagePadding: {
      x: 'clamp(20px, 5vw, 80px)',
      y: 'clamp(80px, 8vw, 140px)',
    },
  },

  breakpoints: {
    mobile: 640,
    largeMobile: 767,
    tablet: 1023,
    desktop: 1439,
    largeDesktop: 1919,
    ultraWide: 1920,
  },

  touch: {
    minTarget: '44px',
    compactTarget: '36px',
  },

  focus: {
    ring: '2px solid var(--accent-arctic, #8ED8FF)',
    offset: '2px',
  },
};

export function getToken(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], tokens);
}

export function cssVar(path) {
  return `var(--${path.replace(/\./g, '-')})`;
}

export default tokens;