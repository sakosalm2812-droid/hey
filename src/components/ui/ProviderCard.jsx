import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, XCircle, Settings, Trash2, ExternalLink, Zap, Shield, Key, Database, Globe, Server, Cpu } from 'lucide-react';
import './ProviderCard.css';

export const ProviderCard = forwardRef((
  {
    provider,
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
    status,
    apiKey,
    models = [],
    usage,
    limits,
    rateLimit,
    lastChecked,
    region,
    latency,
  } = provider;

  const statusConfig = {
    active: { label: 'Active', color: 'var(--green-accent)', icon: CheckCircle },
    degraded: { label: 'Degraded', color: 'var(--gold)', icon: AlertTriangle },
    failed: { label: 'Failed', color: 'var(--coral)', icon: XCircle },
    unconfigured: { label: 'Not Configured', color: 'var(--text-tertiary)', icon: AlertTriangle },
    rate_limited: { label: 'Rate Limited', color: 'var(--gold)', icon: Shield },
  };

  const statusInfo = statusConfig[status] || statusConfig.unconfigured;
  const StatusIcon = statusInfo.icon;

  const typeConfig = {
    ai: { label: 'AI Provider', color: 'var(--accent)', icon: Cpu },
    database: { label: 'Database', color: 'var(--gold)', icon: Database },
    storage: { label: 'Storage', color: 'var(--green-accent)', icon: Server },
    api: { label: 'API Service', color: 'var(--lavender)', icon: Globe },
    auth: { label: 'Authentication', color: 'var(--coral)', icon: Key },
    default: { label: 'Service', color: 'var(--text-secondary)', icon: Zap },
  };

  const typeInfo = typeConfig[type] || typeConfig.default;
  const TypeIcon = typeInfo.icon;

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(provider);
  };

  const handleActionClick = (action, e) => {
    e.stopPropagation();
    onAction?.(action, provider);
  };

  const formatUsage = (value, limit) => {
    if (!limit) return formatNumber(value);
    const percent = (value / limit) * 100;
    if (percent > 90) return `${formatNumber(value)} / ${formatNumber(limit)} ⚠️`;
    return `${formatNumber(value)} / ${formatNumber(limit)}`;
  };

  const formatNumber = (n) => {
    if (n >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <motion.article
      ref={ref}
      className={`hey-provider-card hey-provider-card--${status} hey-provider-card--${variant} ${selected ? 'hey-provider-card--selected' : ''} ${className}`}
      whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}}
      onClick={handleClick}
      {...props}
    >
      <div className="hey-provider-card__header">
        <div className="hey-provider-card__avatar" style={{ '--type-color': typeInfo.color }}>
          <TypeIcon size={24} aria-hidden="true" />
        </div>
        <div className="hey-provider-card__identity">
          <div className="hey-provider-card__name-row">
            <h3 className="hey-provider-card__name">{name}</h3>
            <span className="hey-provider-card__type" style={{ '--type-color': typeInfo.color }}>{typeInfo.label}</span>
          </div>
          {region && <p className="hey-provider-card__region">Region: {region}</p>}
        </div>
        <div className="hey-provider-card__status">
          <span className={`hey-provider-card__status-badge hey-provider-card__status-badge--${status}`} style={{ '--status-color': statusInfo.color }}>
            <StatusIcon size={12} aria-hidden="true" />
            <span>{statusInfo.label}</span>
          </span>
        </div>
      </div>

      <div className="hey-provider-card__details">
        {apiKey && (
          <div className="hey-provider-card__detail-row">
            <span className="hey-provider-card__detail-label">API Key</span>
            <span className="hey-provider-card__detail-value hey-provider-card__detail-value--masked">
              {apiKey.slice(0, 8)}...{apiKey.slice(-4)}
            </span>
          </div>
        )}
        {latency && (
          <div className="hey-provider-card__detail-row">
            <span className="hey-provider-card__detail-label">Latency</span>
            <span className="hey-provider-card__detail-value">{latency}ms</span>
          </div>
        )}
        {lastChecked && (
          <div className="hey-provider-card__detail-row">
            <span className="hey-provider-card__detail-label">Last Checked</span>
            <span className="hey-provider-card__detail-value">{formatRelativeTime(lastChecked)}</span>
          </div>
        )}
        {models.length > 0 && (
          <div className="hey-provider-card__detail-row">
            <span className="hey-provider-card__detail-label">Models</span>
            <div className="hey-provider-card__models">
              {models.slice(0, 4).map((model, i) => (
                <span key={i} className="hey-provider-card__model">{model}</span>
              ))}
              {models.length > 4 && <span className="hey-provider-card__model-more">+{models.length - 4}</span>}
            </div>
          </div>
        )}
        {usage && (
          <div className="hey-provider-card__detail-row">
            <span className="hey-provider-card__detail-label">Usage</span>
            <div className="hey-provider-card__usage">
              {usage.requests !== undefined && (
                <div className="hey-provider-card__usage-row">
                  <span className="hey-provider-card__usage-label">Requests</span>
                  <span className="hey-provider-card__usage-value">{formatUsage(usage.requests, limits?.requests)}</span>
                </div>
              )}
              {usage.tokens !== undefined && (
                <div className="hey-provider-card__usage-row">
                  <span className="hey-provider-card__usage-label">Tokens</span>
                  <span className="hey-provider-card__usage-value">{formatUsage(usage.tokens, limits?.tokens)}</span>
                </div>
              )}
              {usage.cost !== undefined && (
                <div className="hey-provider-card__usage-row">
                  <span className="hey-provider-card__usage-label">Cost</span>
                  <span className="hey-provider-card__usage-value">${usage.cost.toFixed(4)}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {rateLimit && (
          <div className="hey-provider-card__detail-row">
            <span className="hey-provider-card__detail-label">Rate Limit</span>
            <span className="hey-provider-card__detail-value">{rateLimit.requests}/min, {rateLimit.tokens}/min tokens</span>
          </div>
        )}
      </div>

      {showActions && (
        <div className="hey-provider-card__actions">
          <button type="button" className="hey-button hey-button--primary hey-button--sm" onClick={(e) => handleActionClick('configure', e)}>
            <Settings size={14} /> Configure
          </button>
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('test', e)}>
            <Zap size={14} /> Test
          </button>
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('docs', e)}>
            <ExternalLink size={14} /> Docs
          </button>
          <button type="button" className="hey-button hey-button--destructive hey-button--sm" onClick={(e) => handleActionClick('delete', e)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </motion.article>
  );
});

ProviderCard.displayName = 'ProviderCard';

function formatRelativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}