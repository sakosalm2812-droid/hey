import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Eye, Edit, MoreHorizontal, Check, X, Clock, AlertTriangle, Star, Image, Video, Music, FileText, Code, Archive, File } from 'lucide-react';
import './ArtifactCard.css';

export const ArtifactCard = forwardRef((
  {
    artifact,
    variant = 'default',
    selected = false,
    onSelect,
    onAction,
    showActions = true,
    showVersion = true,
    showStatus = true,
    className = '',
    ...props
  },
  ref
) => {
  const {
    name,
    type,
    thumbnail,
    version,
    status,
    size,
    modified,
    createdBy,
    tags = [],
    locked = false,
    approved = false,
  } = artifact;

  const typeConfig = {
    image: { icon: Image, color: 'var(--accent)' },
    video: { icon: Video, color: 'var(--lavender)' },
    audio: { icon: Music, color: 'var(--coral)' },
    document: { icon: FileText, color: 'var(--green-accent)' },
    code: { icon: Code, color: 'var(--gold)' },
    archive: { icon: Archive, color: 'var(--text-secondary)' },
    default: { icon: File, color: 'var(--text-secondary)' },
  };

  const config = typeConfig[type] || typeConfig.default;
  const Icon = config.icon;

  const statusConfig = {
    draft: { label: 'Draft', color: 'var(--text-tertiary)', icon: Clock },
    generating: { label: 'Generating', color: 'var(--accent)', icon: Clock },
    reviewing: { label: 'In Review', color: 'var(--gold)', icon: Clock },
    approved: { label: 'Approved', color: 'var(--green-accent)', icon: Check },
    rejected: { label: 'Rejected', color: 'var(--coral)', icon: X },
    failed: { label: 'Failed', color: 'var(--coral)', icon: AlertTriangle },
    archived: { label: 'Archived', color: 'var(--text-tertiary)', icon: Archive },
  };

  const statusInfo = statusConfig[status] || statusConfig.draft;
  const StatusIcon = statusInfo.icon;

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(artifact);
  };

  const handleActionClick = (action, e) => {
    e.stopPropagation();
    onAction?.(action, artifact);
  };

  return (
    <motion.article
      ref={ref}
      className={`hey-artifact-card hey-artifact-card--${variant} ${selected ? 'hey-artifact-card--selected' : ''} ${locked ? 'hey-artifact-card--locked' : ''} ${className}`}
      whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      {...props}
    >
      <div className="hey-artifact-card__media">
        {thumbnail ? (
          <img src={thumbnail} alt={name} className="hey-artifact-card__thumbnail" loading="lazy" />
        ) : (
          <div className="hey-artifact-card__placeholder" style={{ '--artifact-color': config.color }}>
            <Icon size={32} aria-hidden="true" />
          </div>
        )}
        {showStatus && (
          <div className="hey-artifact-card__status-badge" style={{ '--status-color': statusInfo.color }}>
            <StatusIcon size={12} aria-hidden="true" />
            <span>{statusInfo.label}</span>
          </div>
        )}
        {locked && <div className="hey-artifact-card__lock" aria-label="Locked"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div>}
        {approved && <div className="hey-artifact-card__approved" aria-label="Approved"><Star size={16} fill="currentColor" /></div>}
        {showActions && (
          <div className="hey-artifact-card__actions">
            <button type="button" className="hey-artifact-card__action" onClick={(e) => handleActionClick('view', e)} aria-label="View"><Eye size={16} /></button>
            <button type="button" className="hey-artifact-card__action" onClick={(e) => handleActionClick('edit', e)} aria-label="Edit" disabled={locked}><Edit size={16} /></button>
            <button type="button" className="hey-artifact-card__action" onClick={(e) => handleActionClick('download', e)} aria-label="Download"><Download size={16} /></button>
            <button type="button" className="hey-artifact-card__action hey-artifact-card__action--menu" onClick={(e) => handleActionClick('more', e)} aria-label="More actions"><MoreHorizontal size={16} /></button>
          </div>
        )}
      </div>
      <div className="hey-artifact-card__info">
        <div className="hey-artifact-card__header">
          <h3 className="hey-artifact-card__name" title={name}>{name}</h3>
          {showVersion && version && <span className="hey-artifact-card__version">v{version}</span>}
        </div>
        <div className="hey-artifact-card__meta">
          {size && <span className="hey-artifact-card__size">{formatSize(size)}</span>}
          {modified && <time className="hey-artifact-card__modified" dateTime={modified}>{formatDate(modified)}</time>}
          {createdBy && <span className="hey-artifact-card__author">by {createdBy}</span>}
        </div>
        {tags.length > 0 && (
          <div className="hey-artifact-card__tags">
            {tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="hey-artifact-card__tag">{tag}</span>
            ))}
            {tags.length > 3 && <span className="hey-artifact-card__tag-more">+{tags.length - 3}</span>}
          </div>
        )}
      </div>
    </motion.article>
  );
});

ArtifactCard.displayName = 'ArtifactCard';

export const ArtifactCardList = ({ artifacts, ...props }) => {
  return (
    <div className="hey-artifact-card-list" role="list">
      {artifacts.map((artifact, index) => (
        <ArtifactCard key={artifact.id || index} artifact={artifact} {...props} />
      ))}
    </div>
  );
};

ArtifactCardList.displayName = 'ArtifactCardList';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}