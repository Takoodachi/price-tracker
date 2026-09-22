import type { Favorite } from '@pricetracker/shared';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Heart, Trash2 } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { ProductImage } from '../components/bits';
import { Sparkline } from '../components/charts';
import { ButtonLink, Chip, Container } from '../components/ui';
import { price } from '../lib/format';
import { useT } from '../lib/preferences';
import { useFavorites, useMe, useToggleFavorite } from '../lib/queries';
import { useToast } from '../lib/toast';

function Change({ favorite }: { favorite: Favorite }) {
  const t = useT();
  const now = favorite.product.best?.priceCents;
  const then = favorite.savedPriceCents;
  if (now == null || then == null) return null;
  const diff = now - then;
  if (diff === 0) return <span className="text-sm text-muted">{t('noChange')}</span>;
  const down = diff < 0;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-sm font-medium', down ? 'text-positive' : 'text-negative')}>
      {down ? <ArrowDownRight className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
      {t(down ? 'lower' : 'higher', { amount: price(Math.abs(diff)) })}
      <span className="font-normal text-muted">{t('sinceSaved')}</span>
    </span>
  );
}

function FavoriteRow({ favorite }: { favorite: Favorite }) {
  const t = useT();
  const toast = useToast();
  const toggle = useToggleFavorite();
  const { product } = favorite;
  return (
    <li className="animate-rise flex flex-col gap-4 rounded-[28px] border border-line bg-surface p-3 sm:flex-row sm:items-center sm:gap-5 sm:pr-5">
      <Link to={`/product/${product.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <ProductImage src={product.imageUrl} alt="" className="size-20 shrink-0 rounded-[20px]" />
        <div className="min-w-0">
          <p className="line-clamp-2 font-medium text-ink">{product.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {product.best ? (
              <span className="text-ink-2">
                <span className="font-semibold text-ink">{price(product.best.priceCents)}</span>{' '}
                {t('atStore', { store: product.best.retailerName })}
              </span>
            ) : (
              <span className="text-muted">{t('unavailable')}</span>
            )}
            <Change favorite={favorite} />
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-5 border-t border-line pt-3 sm:border-0 sm:pt-0">
        <Sparkline points={favorite.history} label={t('trend')} />
        <div className="w-32 text-right">
          <p className="text-xs text-muted">{t('target')}</p>
          {favorite.targetPriceCents ? (
            <p className="flex items-center justify-end gap-1.5 font-medium tabular-nums">
              {price(favorite.targetPriceCents)}
            </p>
          ) : (
            <Link to={`/product/${product.id}`} className="text-sm font-medium text-accent-ink hover:underline">
              {t('setTarget')}
            </Link>
          )}
          {favorite.belowTarget && (
            <Chip tone="positive" className="mt-1">
              {t('belowTarget')}
            </Chip>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            toggle.mutate(
              { productId: product.id, favorite: false },
              { onSuccess: () => toast(t('favoriteRemoved')), onError: () => toast(t('genericError'), 'error') },
            )
          }
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-negative-soft hover:text-negative"
          aria-label={`${t('remove')}: ${product.title}`}
        >
          <Trash2 className="size-4.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function DashboardPage() {
  const t = useT();
  const { data: user, isPending: userPending } = useMe();
  const favorites = useFavorites(Boolean(user));

  if (!userPending && !user) return <Navigate to="/login?next=/dashboard" replace />;

  const list = favorites.data ?? [];
  const stats = [
    { label: t('statTracking'), value: list.length },
    { label: t('statBelowTarget'), value: list.filter((f) => f.belowTarget).length },
    {
      label: t('statDropped'),
      value: list.filter((f) => f.product.best?.priceCents != null && f.savedPriceCents != null && f.product.best.priceCents < f.savedPriceCents).length,
    },
  ];

  return (
    <Container>
      <h1 className="display-tight text-4xl font-medium sm:text-5xl">{t('dashTitle')}</h1>
      <p className="mt-3 text-muted">{t('dashSubtitle')}</p>

      <dl className="mt-10 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-3xl border border-line bg-surface px-4 py-4 sm:px-6 sm:py-5">
            <dt className="text-xs text-muted sm:text-sm">{s.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight">{favorites.isPending ? '–' : s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        {favorites.isPending ? (
          <ul className="space-y-3" aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="skeleton h-[104px] rounded-[28px]" />
            ))}
          </ul>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center rounded-[28px] border border-line bg-surface px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <Heart className="size-6" aria-hidden />
            </span>
            <p className="mt-5 text-xl font-medium">{t('emptyTitle')}</p>
            <p className="mt-2 max-w-sm text-muted">{t('emptyBody')}</p>
            <ButtonLink to="/" className="mt-7">
              {t('startSearching')}
            </ButtonLink>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((favorite) => (
              <FavoriteRow key={favorite.product.id} favorite={favorite} />
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
