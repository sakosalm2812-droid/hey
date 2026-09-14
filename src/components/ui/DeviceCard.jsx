import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Monitor, Smartphone, Tablet, Laptop, Server, Wifi, WifiOff, Zap, Shield, Trash2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import './DeviceCard.css';

export const DeviceCard = forwardRef((
  {
    device,
    variant = 'default',
    selected = false,
    onSelect,
    onAction,
    showActions = true,
    className = '',
    ...props
  },
  ref
) => {
  const {
    name,
    type,
    role,
    online,
    battery,
    trustLevel,
    capabilities = [],
    lastSeen,
    os,
    version,
    storage,
    network,
    localModels = [],
    recentActivity,
  } = device;

  const typeConfig = {
    desktop: { icon: Monitor, label: 'Desktop' },
    mobile: { icon: Smartphone, label: 'Mobile' },
    tablet: { icon: Tablet, label: 'Tablet' },
    laptop: { icon: Laptop, label: 'Laptop' },
    server: { icon: Server, label: 'Server' },
    default: { icon: Monitor, label: 'Device' },
  };

  const config = typeConfig[type] || typeConfig.default;
  const Icon = config.icon;

  const trustConfig = {
    trusted: { label: 'Trusted', color: 'var(--green-accent)', icon: CheckCircle },
    pending: { label: 'Pending', color: 'var(--gold)', icon: AlertTriangle },
    revoked: { label: 'Revoked', color: 'var(--coral)', icon: XCircle },
    untrusted: { label: 'Untrusted', color: 'var(--text-tertiary)', icon: XCircle },
  };

  const trustInfo = trustConfig[trustLevel] || trustConfig.untrusted;
  const TrustIcon = trustInfo.icon;

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(device);
  };

  const handleActionClick = (action, e) => {
    e.stopPropagation();
    onAction?.(action, device);
  };

  const formatLastSeen = (date) => {
    if (!date) return 'Never';
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <motion.article
      ref={ref}
      className={`hey-device-card hey-device-card--${variant} ${online ? 'hey-device-card--online' : 'hey-device-card--offline'} ${selected ? 'hey-device-card--selected' : ''} ${className}`}
      whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}}
      onClick={handleClick}
      {...props}
    >
      <div className="hey-device-card__header">
        <div className="hey-device-card__avatar">
          <Icon size={28} aria-hidden="true" />
        </div>
        <div className="hey-device-card__identity">
          <h3 className="hey-device-card__name">{name}</h3>
          <div className="hey-device-card__badges">
            <span className={`hey-device-card__role hey-device-card__role--${role}`}>{role}</span>
            <span className={`hey-device-card__trust hey-device-card__trust--${trustLevel}`} style={{ '--trust-color': trustInfo.color }}>
              <TrustIcon size={12} aria-hidden="true" />
              <span>{trustInfo.label}</span>
            </span>
          </div>
        </div>
        <div className="hey-device-card__status">
          <span className={`hey-device-card__online ${online ? 'hey-device-card__online--connected' : 'hey-device-card__online--disconnected'}`} aria-label={online ? 'Online' : 'Offline'}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          </span>
        </div>
      </div>

      <div className="hey-device-card__metrics">
        <div className="hey-device-card__metric">
          <span className="hey-device-card__metric-label">Battery</span>
          <div className="hey-device-card__battery">
            <div className="hey-device-card__battery-track">
              <div className="hey-device-card__battery-level" style={{ width: `${battery || 0}%`, '--battery-color': battery > 20 ? 'var(--green-accent)' : 'var(--coral)' }} />
            </div>
            <span className="hey-device-card__battery-text">{battery || 0}%</span>
          </div>
        </div>
        <div className="hey-device-card__metric">
          <span className="hey-device-card__metric-label">Storage</span>
          <div className="hey-device-card__storage">
            <div className="hey-device-card__storage-bar" role="progressbar" aria-valuenow={storage?.usedPercent || 0} aria-valuemin={0} aria-valuemax={100}>
              <div className="hey-device-card__storage-fill" style={{ width: `${storage?.usedPercent || 0}%` }} />
            </div>
            <span className="hey-device-card__storage-text">{formatBytes(storage?.used)} / {formatBytes(storage?.total)}</span>
          </div>
        </div>
        <div className="hey-device-card__metric">
          <span className="hey-device-card__metric-label">Last seen</span>
          <span className="hey-device-card__last-seen">{formatLastSeen(lastSeen)}</span>
        </div>
      </div>

      <div className="hey-device-card__details">
        <div className="hey-device-card__detail-row">
          <span className="hey-device-card__detail-label">OS</span>
          <span className="hey-device-card__detail-value">{os} {version ? `v${version}` : ''}</span>
        </div>
        <div className="hey-device-card__detail-row">
          <span className="hey-device-card__detail-label">Network</span>
          <span className="hey-device-card__detail-value">{network}</span>
        </div>
        {localModels.length > 0 && (
          <div className="hey-device-card__detail-row">
            <span className="hey-device-card__detail-label">Local Models</span>
            <div className="hey-device-card__models">
              {localModels.slice(0, 3).map((model, i) => (
                <span key={i} className="hey-device-card__model">{model}</span>
              ))}
              {localModels.length > 3 && <span className="hey-device-card__model-more">+{localModels.length - 3}</span>}
            </div>
          </div>
        )}
        {capabilities.length > 0 && (
          <div className="hey-device-card__detail-row">
            <span className="hey-device-card__detail-label">Capabilities</span>
            <div className="hey-device-card__capabilities">
              {capabilities.slice(0, 4).map((cap, i) => (
                <span key={i} className="hey-device-card__capability">{cap}</span>
              ))}
              {capabilities.length > 4 && <span className="hey-device-card__capability-more">+{capabilities.length - 4}</span>}
            </div>
          </div>
        )}
      </div>

      {recentActivity && (
        <div className="hey-device-card__activity">
          <span className="hey-device-card__activity-label">Recent</span>
          <span className="hey-device-card__activity-text">{recentActivity}</span>
        </div>
      )}

      {showActions && (
        <div className="hey-device-card__actions">
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('handoff', e)}>
            <Zap size={14} /> Handoff
          </button>
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('settings', e)}>
            <Shield size={14} /> Trust
          </button>
          <button type="button" className="hey-button hey-button--destructive hey-button--sm" onClick={(e) => handleActionClick('remove', e)}>
            <Trash2 size={14} /> Remove
          </button>
        </div>
      )}
    </motion.article>
  );
});

DeviceCard.displayName = 'DeviceCard';

function formatBytes(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}