import { forwardRef } from 'react';
import './Avatar.css';

export const Avatar = forwardRef((
  {
    src,
    alt,
    name,
    size = 'md',
    shape = 'circle',
    status,
    statusPosition = 'bottom-right',
    className = '',
    ...props
  },
  ref
) => {
  const initials = name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const hasImage = !!src;

  return (
    <div
      ref={ref}
      className={`hey-avatar hey-avatar--${size} hey-avatar--${shape} ${className}`}
      {...props}
    >
      {hasImage ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          className="hey-avatar__image"
          loading="lazy"
        />
      ) : (
        <span className="hey-avatar__initials" aria-hidden="true">{initials}</span>
      )}
      {status && (
        <span
          className={`hey-avatar__status hey-avatar__status--${status} hey-avatar__status--${statusPosition}`}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
});

Avatar.displayName = 'Avatar';

export const AvatarGroup = ({ avatars = [], max = 5, size = 'md', className = '' }) => {
  const visibleAvatars = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={`hey-avatar-group ${className}`} role="group" aria-label={`${avatars.length} people`}>
      {visibleAvatars.map((avatar, index) => (
        <Avatar
          key={avatar.id || index}
          src={avatar.src}
          alt={avatar.alt}
          name={avatar.name}
          size={size}
          status={avatar.status}
          className="hey-avatar-group__avatar"
          style={{ zIndex: max - index }}
        />
      ))}
      {remaining > 0 && (
        <div className={`hey-avatar-group__more hey-avatar-group__more--${size}`} aria-label={`${remaining} more`}>
          +{remaining}
        </div>
      )}
    </div>
  );
};

AvatarGroup.displayName = 'AvatarGroup';