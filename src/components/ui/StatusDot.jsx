import './StatusDot.css';

export function StatusDot({
  status = 'neutral',
  size = 'md',
  label,
  pulse = false,
  className = '',
  ...props
}) {
  const classNames = [
    'hey-status-dot',
    `hey-status-dot--${status}`,
    `hey-status-dot--${size}`,
    pulse && 'hey-status-dot--pulse',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames} {...props}>
      <span className="hey-status-dot__indicator" aria-hidden="true" />
      {label && <span className="hey-status-dot__label">{label}</span>}
    </span>
  );
}

StatusDot.displayName = 'StatusDot';

export function StatusBadge({ status = 'neutral', label, size = 'md', className = '' }) {
  const statusConfig = {
    online: { variant: 'success', icon: '●' },
    away: { variant: 'warning', icon: '●' },
    busy: { variant: 'destructive', icon: '●' },
    offline: { variant: 'neutral', icon: '○' },
    active: { variant: 'success', icon: '●' },
    inactive: { variant: 'neutral', icon: '○' },
    pending: { variant: 'warning', icon: '◐' },
    running: { variant: 'info', icon: '◑' },
    completed: { variant: 'success', icon: '✓' },
    failed: { variant: 'destructive', icon: '✕' },
    blocked: { variant: 'warning', icon: '◼' },
    neutral: { variant: 'default', icon: '●' },
  };

  const config = statusConfig[status] || statusConfig.neutral;

  return (
    <span className={`hey-status-badge hey-status-badge--${config.variant} hey-status-badge--${size} ${className}`}>
      <span className="hey-status-badge__icon" aria-hidden="true">{config.icon}</span>
      <span className="hey-status-badge__label">{label || status}</span>
    </span>
  );
}

StatusBadge.displayName = 'StatusBadge';