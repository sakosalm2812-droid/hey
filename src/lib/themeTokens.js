export function validAccent(value, fallback = '#B9C6FF') {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

export function luminance(hex) {
  const rgb = validAccent(hex).slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}

export function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

export function themeTokens(theme, customAccent) {
  const accent = validAccent(customAccent || theme.accent);
  const ink = contrast(accent, '#FFFFFF') > contrast(accent, '#000000') ? '#FFFFFF' : '#000000';
  const light = Boolean(theme.light);
  return {
    '--bg-primary': theme.bg, '--bg-secondary': theme.surface, '--bg-tertiary': theme.surface,
    '--accent': accent, '--accent-hover': accent, '--accent-2': theme.accent2,
    '--on-accent': ink, '--text-primary': theme.text,
    '--text-secondary': light ? 'rgba(8,24,38,.76)' : 'rgba(255,255,255,.76)',
    '--text-muted': light ? 'rgba(8,24,38,.68)' : 'rgba(255,255,255,.68)',
    '--text-tertiary': light ? 'rgba(8,24,38,.62)' : 'rgba(255,255,255,.62)',
    '--border': light ? 'rgba(8,24,38,.16)' : 'rgba(255,255,255,.16)',
    '--border-subtle': light ? 'rgba(8,24,38,.09)' : 'rgba(255,255,255,.09)',
    '--glass-bg': light ? 'rgba(255,255,255,.64)' : `${theme.surface}b8`,
    '--glass-bg-strong': light ? 'rgba(255,255,255,.86)' : `${theme.surface}ed`,
    '--surface-hover': light ? 'rgba(8,24,38,.06)' : 'rgba(255,255,255,.07)',
    '--surface-elevated': theme.surface, '--surface': theme.surface,
    '--glass-highlight': light ? 'rgba(255,255,255,.94)' : 'rgba(255,255,255,.20)',
    '--field-bg': light ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.16)',
    '--accent-glow': `${accent}38`, '--accent-glow-soft': `${accent}16`,
    '--ambient-one': `${accent}20`, '--ambient-two': `${theme.accent2}18`, '--ambient-three': `${theme.surface}cc`,
    '--shadow-medium': light ? '0 18px 60px rgba(30,45,70,.08)' : '0 18px 60px rgba(0,0,0,.23)',
    '--error': light ? '#B42338' : '#FF9AA8', '--success': light ? '#19734C' : '#91DEB5',
    '--info': light ? '#2755A8' : '#BDCEFF', '--warning': light ? '#885B00' : '#F2CD7B',
  };
}
