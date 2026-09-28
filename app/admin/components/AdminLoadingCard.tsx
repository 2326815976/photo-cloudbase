'use client';

type AdminLoadingCardVariant = 'page' | 'inline' | 'compact';

interface AdminLoadingCardProps {
  description?: string;
  variant?: AdminLoadingCardVariant;
  className?: string;
}

export default function AdminLoadingCard({
  description,
  variant = 'inline',
  className = '',
}: AdminLoadingCardProps) {
  const classes = ['admin-loading-card', `admin-loading-card--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="admin-loading-card__orb" aria-hidden="true">
        <div className="admin-loading-card__spinner" />
      </div>
      <p className="admin-loading-card__title">拾光中...</p>
      {description ? <p className="admin-loading-card__desc">{description}</p> : null}
    </div>
  );
}
