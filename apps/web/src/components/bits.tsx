import type { ProductSummary } from '@pricetracker/shared';
import clsx from 'clsx';
import { Heart, Package } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { domainFor } from '../lib/format';
import { useT } from '../lib/preferences';
import { useMe, useToggleFavorite } from '../lib/queries';
import { useToast } from '../lib/toast';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={clsx('inline-flex items-center gap-2 text-ink', className)} aria-label="pricetrack home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="18" className="fill-ink" />
        <path
          d="M20 44V20h13a9 9 0 0 1 0 18h-7"
          fill="none"
          className="stroke-canvas"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="45" cy="44" r="5" className="fill-accent" />
      </svg>
      <span className="text-[19px] font-semibold tracking-[-0.04em]">pricetrack</span>
    </Link>
  );
}

/** Store favicon with a letter fallback. */
export function RetailerMark({ retailer, name, className }: { retailer: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const domain = domainFor(retailer);
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white',
        className ?? 'size-8',
      )}
      aria-hidden
    >
      {domain && !failed ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          className="size-[60%]"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-[#0f151d]">{name.charAt(0)}</span>
      )}
    </span>
  );
}

export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const t = useT();
  return (
    <div className={clsx('flex items-center justify-center overflow-hidden bg-tile', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-contain p-[8%] mix-blend-multiply"
        />
      ) : (
        <Package className="size-10 text-[#b9ada4]" strokeWidth={1.5} aria-label={t('noImage')} />
      )}
    </div>
  );
}

/** Heart toggle. Logged-out users are sent to log in first. */
export function FavoriteButton({
  product,
  variant = 'icon',
  className,
}: {
  product: Pick<ProductSummary, 'id' | 'isFavorite'>;
  variant?: 'icon' | 'pill';
  className?: string;
}) {
  const t = useT();
  const { data: user } = useMe();
  const toggle = useToggleFavorite();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const active = product.isFavorite;

  function onClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    toggle.mutate(
      { productId: product.id, favorite: !active },
      {
        onSuccess: () => toast(active ? t('favoriteRemoved') : t('favoriteAdded')),
        onError: () => toast(t('genericError'), 'error'),
      },
    );
  }

  const label = user ? (active ? t('tracking') : t('trackPrice')) : t('loginToTrack');

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={clsx(
          'inline-flex h-14 items-center justify-center gap-2 rounded-full border px-6 text-base font-medium transition-colors',
          active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink hover:border-ink/40',
          className,
        )}
      >
        <Heart className={clsx('size-5', active && 'fill-current')} aria-hidden />
        {active ? t('tracking') : t('trackPrice')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-10 items-center justify-center rounded-full bg-surface/95 shadow-soft backdrop-blur transition-transform hover:scale-105 active:scale-95',
        active ? 'text-accent' : 'text-ink-2 hover:text-ink',
        className,
      )}
    >
      <Heart className={clsx('size-[18px]', active && 'fill-current')} aria-hidden />
    </button>
  );
}
