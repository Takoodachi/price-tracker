import type { ProductSummary, SourceState } from '@pricetracker/shared';
import clsx from 'clsx';
import { ArrowRight, Check, CircleAlert, CircleDashed, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { price } from '../lib/format';
import { useT } from '../lib/preferences';
import { FavoriteButton, ProductImage } from './bits';
import { Chip, Spinner } from './ui';

export function SearchBar({ initial = '', size = 'lg', autoFocus }: { initial?: string; size?: 'lg' | 'md'; autoFocus?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = value.trim();
    if (q.length >= 2) navigate(`/?q=${encodeURIComponent(q)}`);
  }

  return (
    <form role="search" onSubmit={submit} className="w-full">
      <div
        className={clsx(
          'flex items-center gap-2 rounded-full border border-line bg-surface pl-5 shadow-soft transition-shadow focus-within:border-ink/30',
          size === 'lg' ? 'h-16 pr-2 sm:h-[72px]' : 'h-14 pr-1.5',
        )}
      >
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          autoFocus={autoFocus}
          minLength={2}
          maxLength={120}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none sm:text-[17px]"
        />
        <button
          type="submit"
          className={clsx(
            'inline-flex shrink-0 items-center gap-2 rounded-full bg-accent font-medium text-on-accent transition-colors hover:bg-accent-hover',
            size === 'lg' ? 'h-12 px-4 sm:h-14 sm:px-6' : 'h-11 px-4',
          )}
        >
          <span className="hidden sm:inline">{t('searchButton')}</span>
          <ArrowRight className="size-5 sm:hidden" aria-label={t('searchButton')} />
        </button>
      </div>
    </form>
  );
}

export function SourceStatusRow({ sources }: { sources: SourceState[] }) {
  const t = useT();
  const labels = { ok: t('sourceOk'), pending: t('sourcePending'), error: t('sourceError'), disabled: t('sourceDisabled') };
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Stores">
      {sources.map((s) => (
        <li
          key={s.source}
          title={s.message ?? labels[s.status]}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
            s.status === 'ok' && 'border-line bg-surface text-ink-2',
            s.status === 'pending' && 'border-line bg-surface text-ink-2',
            (s.status === 'error' || s.status === 'disabled') && 'border-dashed border-line-strong text-muted',
          )}
        >
          {s.status === 'ok' && <Check className="size-3.5 text-positive" aria-hidden />}
          {s.status === 'pending' && <Spinner className="size-3.5 text-accent-ink" />}
          {s.status === 'error' && <CircleAlert className="size-3.5" aria-hidden />}
          {s.status === 'disabled' && <CircleDashed className="size-3.5" aria-hidden />}
          {s.label}
          <span className="sr-only">: {labels[s.status]}</span>
        </li>
      ))}
    </ul>
  );
}

function CardPrice({ product }: { product: ProductSummary }) {
  const t = useT();
  const best = product.best;
  const stores = product.offers.filter((o) => o.priceCents !== null).length;

  if (best) {
    return (
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{t('bestPrice')}</p>
          <p className="text-2xl font-semibold tracking-tight text-ink">
            {!best.verified && <span title={t('unconfirmedHint')}>≈</span>}
            {price(best.priceCents)}
          </p>
          <p className="truncate text-sm text-ink-2">{t('atStore', { store: best.retailerName })}</p>
        </div>
        <Chip>{stores === 1 ? t('oneStore') : t('storesCount', { n: stores })}</Chip>
      </div>
    );
  }

  if (product.moreOffersAvailable) {
    return (
      <div>
        {product.teaser && (
          <p className="text-sm text-ink-2">
            {t('fromAt', { price: price(product.teaser.priceCents), store: product.teaser.retailerName })}
          </p>
        )}
        <p className="mt-1 inline-flex items-center gap-1 text-[15px] font-medium text-accent-ink">
          {t('comparePrices')} <ArrowRight className="size-4" aria-hidden />
        </p>
      </div>
    );
  }

  return <p className="text-sm text-muted">{t('unavailable')}</p>;
}

export function ProductCard({ product, index = 0 }: { product: ProductSummary; index?: number }) {
  const t = useT();
  const demo = product.offers.some((o) => o.source === 'demo');
  return (
    <article
      className="animate-rise group relative flex flex-col rounded-[28px] border border-line bg-surface p-2.5 transition-shadow duration-200 hover:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <Link to={`/product/${product.id}`} className="flex flex-1 flex-col rounded-[22px] focus-visible:outline-offset-4">
        <ProductImage src={product.imageUrl} alt="" className="aspect-[4/3] rounded-[20px]" />
        <div className="flex flex-1 flex-col gap-4 px-2.5 pt-4 pb-2.5">
          <h3 className="line-clamp-2 min-h-[2.6em] text-[15px] leading-snug font-medium text-ink">{product.title}</h3>
          <div className="mt-auto">
            <CardPrice product={product} />
            {product.savingsCents !== null && (
              <Chip tone="positive" className="mt-3">
                {t('saveAmount', { amount: price(product.savingsCents) })} {t('vsNextStore')}
              </Chip>
            )}
          </div>
        </div>
      </Link>
      <div className="absolute top-5 right-5 flex items-center gap-2">
        {demo && <Chip tone="accent">{t('demoPrice')}</Chip>}
        <FavoriteButton product={product} />
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col rounded-[28px] border border-line bg-surface p-2.5" aria-hidden>
      <div className="skeleton aspect-[4/3] rounded-[20px]" />
      <div className="space-y-3 px-2.5 pt-4 pb-2.5">
        <div className="skeleton h-4 w-11/12 rounded-full" />
        <div className="skeleton h-4 w-2/3 rounded-full" />
        <div className="skeleton mt-6 h-7 w-1/3 rounded-full" />
      </div>
    </div>
  );
}
