import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Stop, RotateCcw, AlertTriangle, CheckCircle, Clock, XCircle, Zap } from 'lucide-react';
import './MissionCard.css';

export const MissionCard = forwardRef((
  {
    mission,
    variant = 'default',
    compact = false,
    onAction,
    className = '',
    ...props
  },
  ref
) => {
  const {
    name,
    description,
    status,
    progress = 0,
    stages = [],
    currentStageIndex = 0,
    startedAt,
    estimatedCompletion,
    error,
    canRetry = false,
    canCancel = true,
  } = mission;

  const statusConfig = {
    pending: { label: 'Pending', color: 'var(--text-tertiary)', icon: Clock },
    running: { label: 'Running', color: 'var(--accent)', icon: Zap },
    paused: { label: 'Paused', color: 'var(--gold)', icon: Pause },
    completed: { label: 'Completed', color: 'var(--green-accent)', icon: CheckCircle },
    failed: { label: 'Failed', color: 'var(--coral)', icon: XCircle },
    cancelled: { label: 'Cancelled', color: 'var(--text-tertiary)', icon: Stop },
    blocked: { label: 'Blocked', color: 'var(--gold)', icon: AlertTriangle },
  };

  const statusInfo = statusConfig[status] || statusConfig.pending;
  const StatusIcon = statusInfo.icon;

  const handleActionClick = (action, e) => {
    e.stopPropagation();
    onAction?.(action, mission);
  };

  const formatDuration = (start, end) => {
    // eslint-disable-next-line react-hooks/purity
    const diff = (typeof end === 'number' ? end : Date.now()) - start;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  return (
    <motion.article
      ref={ref}
      className={`hey-mission-card hey-mission-card--${status} hey-mission-card--${variant} ${compact ? 'hey-mission-card--compact' : ''} ${className}`}
      whileHover={{ y: -2, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}}
      {...props}
    >
      <div className="hey-mission-card__header">
        <div className="hey-mission-card__title-row">
          <h3 className="hey-mission-card__name">{name}</h3>
          <span className={`hey-mission-card__status hey-mission-card__status--${status}`} style={{ '--status-color': statusInfo.color }}>
            <StatusIcon size={14} aria-hidden="true" />
            <span>{statusInfo.label}</span>
          </span>
        </div>
        {description && <p className="hey-mission-card__description">{description}</p>}
      </div>

      {!compact && (
        <div className="hey-mission-card__progress">
          <div className="hey-mission-card__progress-bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
            <div className="hey-mission-card__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="hey-mission-card__progress-meta">
            <span>{Math.round(progress)}%</span>
            {startedAt && <span>Running for {formatDuration(startedAt)}</span>}
            {estimatedCompletion && <span>Est. {formatDate(estimatedCompletion)}</span>}
          </div>
        </div>
      )}

      {!compact && stages.length > 0 && (
        <div className="hey-mission-card__stages" role="list" aria-label="Mission stages">
          {stages.map((s, index) => {
            const isComplete = index < currentStageIndex;
            const isCurrent = index === currentStageIndex;
            const isFailed = status === 'failed' && isCurrent;
            return (
              <div key={s.id || index} className={`hey-mission-card__stage ${isComplete ? 'hey-mission-card__stage--complete' : ''} ${isCurrent ? 'hey-mission-card__stage--current' : ''} ${isFailed ? 'hey-mission-card__stage--failed' : ''}`} role="listitem">
                <div className="hey-mission-card__stage-marker" aria-hidden="true">
                  {isComplete ? <CheckCircle size={16} /> : isCurrent ? <Zap size={16} className="hey-pulse" /> : <span className="hey-mission-card__stage-number">{index + 1}</span>}
                </div>
                <div className="hey-mission-card__stage-content">
                  <span className="hey-mission-card__stage-name">{s.name}</span>
                  {s.description && <span className="hey-mission-card__stage-desc">{s.description}</span>}
                </div>
                {s.duration && <span className="hey-mission-card__stage-duration">{formatDuration(s.duration)}</span>}
              </div>
            );
          })}
        </div>
      )}

      {compact && (
        <div className="hey-mission-card__compact-meta">
          <div className="hey-mission-card__progress-mini" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
            <div className="hey-mission-card__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="hey-mission-card__progress-text">{Math.round(progress)}%</span>
        </div>
      )}

      {error && (
        <div className="hey-mission-card__error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="hey-mission-card__actions">
        {status === 'running' && canCancel && (
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('pause', e)}>
            <Pause size={14} /> Pause
          </button>
        )}
        {status === 'paused' && (
          <button type="button" className="hey-button hey-button--primary hey-button--sm" onClick={(e) => handleActionClick('resume', e)}>
            <Play size={14} /> Resume
          </button>
        )}
        {status === 'pending' && (
          <button type="button" className="hey-button hey-button--primary hey-button--sm" onClick={(e) => handleActionClick('start', e)}>
            <Play size={14} /> Start
          </button>
        )}
        {(status === 'failed' || status === 'cancelled') && canRetry && (
          <button type="button" className="hey-button hey-button--secondary hey-button--sm" onClick={(e) => handleActionClick('retry', e)}>
            <RotateCcw size={14} /> Retry
          </button>
        )}
        {canCancel && status !== 'completed' && status !== 'cancelled' && (
          <button type="button" className="hey-button hey-button--destructive hey-button--sm" onClick={(e) => handleActionClick('cancel', e)}>
            <Stop size={14} /> Cancel
          </button>
        )}
        {status === 'completed' && (
          <button type="button" className="hey-button hey-button--ghost hey-button--sm" onClick={(e) => handleActionClick('view', e)}>
            <CheckCircle size={14} /> View Results
          </button>
        )}
      </div>
    </motion.article>
  );
});

MissionCard.displayName = 'MissionCard';

export const MissionCardList = ({ missions, ...props }) => {
  return (
    <div className="hey-mission-card-list" role="list">
      {missions.map((mission, index) => (
        <MissionCard key={mission.id || index} mission={mission} {...props} />
      ))}
    </div>
  );
};

MissionCardList.displayName = 'MissionCardList';

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}