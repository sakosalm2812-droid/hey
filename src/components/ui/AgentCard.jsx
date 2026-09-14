import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Bot, CheckCircle, AlertTriangle, XCircle, Zap, Trash2, Play, Pause, Settings, BarChart2, Cpu, Activity, Heart } from 'lucide-react';
import './AgentCard.css';

export const AgentCard = forwardRef((
  {
    agent,
    variant = 'default',
    selected = false,
    onSelect,
    onAction,
    showActions = true,
    showMetrics = true,
    className = '',
    ...props
  },
  ref
) => {
  const {
    name,
    description,
    category,
    model,
    status,
    health = 100,
    runs = 0,
    successRate = 0,
    avgLatency = 0,
    permissions = [],
    tools = [],
    version,
    lastRun,
    tags = [],
  } = agent;

  const statusConfig = {
    healthy: { label: 'Healthy', color: 'var(--green-accent)', icon: CheckCircle },
    degraded: { label: 'Degraded', color: 'var(--gold)', icon: AlertTriangle },
    failed: { label: 'Failed', color: 'var(--coral)', icon: XCircle },
    idle: { label: 'Idle', color: 'var(--text-tertiary)', icon: Bot },
    running: { label: 'Running', color: 'var(--accent)', icon: Zap },
  };

  const statusInfo = statusConfig[status] || statusConfig.idle;
  const StatusIcon = statusInfo.icon;

  const categoryConfig = {
    reasoning: { label: 'Reasoning', color: 'var(--accent)' },
    coding: { label: 'Coding', color: 'var(--gold)' },
    creative: { label: 'Creative', color: 'var(--lavender)' },
    analysis: { label: 'Analysis', color: 'var(--green-accent)' },
    automation: { label: 'Automation', color: 'var(--coral)' },
    research: { label: 'Research', color: 'var(--gold)' },
    default: { label: 'General', color: 'var(--text-secondary)' },
  };

  const catConfig = categoryConfig[category] || categoryConfig.default;

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(agent);
  };

  const handleActionClick = (action, e) => {
    e.stopPropagation();
    onAction?.(action, agent);
  };

  const formatLatency = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatNumber = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <motion.article
      ref={ref}
      className={`hey-agent-card hey-agent-card--${status} hey-agent-card--${variant} ${selected ? 'hey-agent-card--selected' : ''} ${className}`}
      whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}}
      onClick={handleClick}
      {...props}
    >
      <div className="hey-agent-card__header">
        <div className="hey-agent-card__avatar">
          <Bot size={28} aria-hidden="true" />
        </div>
        <div className="hey-agent-card__identity">
          <div className="hey-agent-card__name-row">
            <h3 className="hey-agent-card__name">{name}</h3>
            <span className="hey-agent-card__category" style={{ '--category-color': catConfig.color }}>{catConfig.label}</span>
          </div>
          <p className="hey-agent-card__description">{description}</p>
        </div>
        <div className="hey-agent-card__status">
          <span className={`hey-agent-card__status-badge hey-agent-card__status-badge--${status}`} style={{ '--status-color': statusInfo.color }}>
            <StatusIcon size={12} aria-hidden="true" />
            <span>{statusInfo.label}</span>
          </span>
        </div>
      </div>

      <div className="hey-agent-card__model">
        <span className="hey-agent-card__model-label">Model</span>
        <span className="hey-agent-card__model-name">{model}</span>
        {version && <span className="hey-agent-card__version">v{version}</span>}
      </div>

      {showMetrics && (
        <div className="hey-agent-card__metrics">
          <div className="hey-agent-card__metric">
            <span className="hey-agent-card__metric-icon" aria-hidden="true"><Activity size={16} /></span>
            <div className="hey-agent-card__metric-info">
              <span className="hey-agent-card__metric-value">{formatNumber(runs)}</span>
              <span className="hey-agent-card__metric-label">Runs</span>
            </div>
          </div>
          <div className="hey-agent-card__metric">
            <span className="hey-agent-card__metric-icon" aria-hidden="true"><CheckCircle size={16} /></span>
            <div className="hey-agent-card__metric-info">
              <span className="hey-agent-card__metric-value">{successRate.toFixed(1)}%</span>
              <span className="hey-agent-card__metric-label">Success</span>
            </div>
          </div>
          <div className="hey-agent-card__metric">
            <span className="hey-agent-card__metric-icon" aria-hidden="true"><Cpu size={16} /></span>
            <div className="hey-agent-card__metric-info">
              <span className="hey-agent-card__metric-value">{formatLatency(avgLatency)}</span>
              <span className="hey-agent-card__metric-label">Avg Latency</span>
            </div>
          </div>
          <div className="hey-agent-card__metric">
            <span className="hey-agent-card__metric-icon" aria-hidden="true"><Heart size={16} /></span>
            <div className="hey-agent-card__metric-info">
              <div className="hey-agent-card__health-bar" role="progressbar" aria-valuenow={health} aria-valuemin={0} aria-valuemax={100}>
                <div className="hey-agent-card__health-fill" style={{ width: `${health}%` }} />
              </div>
              <span className="hey-agent-card__metric-label">Health</span>
            </div>
          </div>
        </div>
      )}

      <div className="hey-agent-card__details">
        {permissions.length > 0 && (
          <div className="hey-agent-card__detail-row">
            <span className="hey-agent-card__detail-label">Permissions</span>
            <div className="hey-agent-card__permissions">
              {permissions.slice(0, 4).map((perm, i) => (
                <span key={i} className="hey-agent-card__permission">{perm}</span>
              ))}
              {permissions.length > 4 && <span className="hey-agent-card__permission-more">+{permissions.length - 4}</span>}
            </div>
          </div>
        )}
        {tools.length > 0 && (
          <div className="hey-agent-card__detail-row">
            <span className="hey-agent-card__detail-label">Tools</span>
            <div className="hey-agent-card__tools">
              {tools.slice(0, 4).map((tool, i) => (
                <span key={i} className="hey-agent-card__tool">{tool}</span>
              ))}
              {tools.length > 4 && <span className="hey-agent-card__tool-more">+{tools.length - 4}</span>}
            </div>
          </div>
        )}
        {tags.length > 0 && (
          <div className="hey-agent-card__detail-row">
            <span className="hey-agent-card__detail-label">Tags</span>
            <div className="hey-agent-card__tags">
              {tags.slice(0, 4).map((tag, i) => (
                <span key={i} className="hey-agent-card__tag">{tag}</span>
              ))}
              {tags.length > 4 && <span className="hey-agent-card__tag-more">+{tags.length - 4}</span>}
            </div>
          </div>
        )}
        {lastRun && (
          <div className="hey-agent-card__detail-row">
            <span className="hey-agent-card__detail-label">Last Run</span>
            <time className="hey-agent-card__last-run" dateTime={lastRun}>{formatRelativeTime(lastRun)}</time>
          </div>
        )}
      </div>

      {showActions && (
        <div className="hey-agent-card__actions">
          {status === 'idle' && (
            <button type="button" className="hey-button hey-button--primary hey-button--sm" onClick={(e) => handleActionClick('run', e)}>
              <Play size={14} /> Run
            </button>
          )}
          {status === 'running' && (
            <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('pause', e)}>
              <Pause size={14} /> Pause
            </button>
          )}
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('configure', e)}>
            <Settings size={14} /> Config
          </button>
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('metrics', e)}>
            <BarChart2 size={14} /> Metrics
          </button>
          <button type="button" className="hey-button hey-button--destructive hey-button--sm" onClick={(e) => handleActionClick('delete', e)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </motion.article>
  );
});

AgentCard.displayName = 'AgentCard';

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