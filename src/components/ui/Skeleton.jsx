import './Skeleton.css';

export function Skeleton({ variant = 'text', width, height, className = '', count = 1, gap = 'md' }) {
  const gapVar = `var(--space-${gap})`;

  if (count > 1) {
    return (
      <div
        className={`hey-skeleton-group ${className}`}
        style={{ display: 'flex', flexDirection: 'column', gap: gapVar }}
        aria-hidden="true"
      >
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} variant={variant} width={width} height={height} />
        ))}
      </div>
    );
  }

  const variants = {
    text: 'hey-skeleton--text',
    circular: 'hey-skeleton--circular',
    rectangular: 'hey-skeleton--rectangular',
    card: 'hey-skeleton--card',
    button: 'hey-skeleton--button',
    input: 'hey-skeleton--input',
    avatar: 'hey-skeleton--avatar',
  };

  return (
    <div
      className={`hey-skeleton ${variants[variant] || variants.text} ${className}`}
      style={{
        width: width || (variant === 'text' ? '100%' : undefined),
        height: height || undefined,
      }}
      aria-hidden="true"
    />
  );
}

Skeleton.displayName = 'Skeleton';

export function SkeletonCard({ lines = 3, showImage = true, showAction = false, className = '' }) {
  return (
    <div className={`hey-skeleton-card ${className}`} aria-hidden="true">
      {showImage && <div className="hey-skeleton-card__image" />}
      <div className="hey-skeleton-card__content">
        <div className="hey-skeleton-card__header">
          <Skeleton variant="text" width="40%" height="24px" />
          <Skeleton variant="text" width="30%" height="14px" />
        </div>
        <div className="hey-skeleton-card__body">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} variant="text" width={i === lines - 1 ? '60%' : '100%'} height="16px" />
          ))}
        </div>
        {showAction && (
          <div className="hey-skeleton-card__actions">
            <Skeleton variant="button" width="100px" />
            <Skeleton variant="button" width="100px" />
          </div>
        )}
      </div>
    </div>
  );
}

SkeletonCard.displayName = 'SkeletonCard';

export function SkeletonChat({ messageCount = 3, className = '' }) {
  return (
    <div className={`hey-skeleton-chat ${className}`} aria-hidden="true">
      {Array.from({ length: messageCount }).map((_, i) => (
        <div key={i} className="hey-skeleton-chat__message">
          <Skeleton variant="avatar" size="sm" />
          <div className="hey-skeleton-chat__bubble">
            <Skeleton variant="text" width="80%" height="20px" />
            <Skeleton variant="text" width="60%" height="20px" />
          </div>
        </div>
      ))}
    </div>
  );
}

SkeletonChat.displayName = 'SkeletonChat';