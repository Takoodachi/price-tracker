import type { Offer, PricePoint, ProductDetail } from '@pricetracker/shared';
import clsx from 'clsx';
import { ArrowLeft, ArrowUpRight, Target } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FavoriteButton, ProductImage, RetailerMark } from '../components/bits';
import { PriceChart } from '../components/charts';
import { Button, Chip, Container, ExternalButton, Segmented, Spinner } from '../components/ui';
import { ApiError } from '../lib/api';
import { parseDollars, price, relativeTime, shortDate } from '../lib/format';
import { usePreferences, useT } from '../lib/preferences';
import { useProduct, useUpdateTarget } from '../lib/queries';
import { useToast } from '../lib/toast';

function OfferRow({ offer, isBest }: { offer: Offer; isBest: boolean }) {
  const t = useT();
  const { lang } = usePreferences();
  const dimmed = offer.inStock === false || offer.priceCents === null;
  return (
    <li
      className={clsx(
        'flex items-center gap-3 rounded-2xl px-3 py-3 sm:gap-4 sm:px-4',
        isBest ? 'bg-accent-soft' : 'hover:bg-surface-2',
      )}
    >
      <RetailerMark retailer={offer.retailer} name={offer.retailerName} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
          {offer.retailerName}
          {isBest && <Chip tone="accent">{t('bestPrice')}</Chip>}
          {offer.source === 'demo' && <Chip>{t('demoPrice')}</Chip>}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
          {offer.condition !== 'new' && <span>{offer.condition === 'used' ? t('used') : t('refurbished')}</span>}
          {offer.inStock === false && <span>{t('outOfStock')}</span>}
          {!offer.verified && <span title={t('unconfirmedHint')}>{t('unconfirmed')}</span>}
          <span>{t('checked', { time: relativeTime(offer.checkedAt, lang) })}</span>
        </p>
      </div>
      <p className={clsx('text-right text-lg font-semibold tabular-nums', dimmed ? 'text-muted line-through decoration-1' : 'text-ink')}>
        {!offer.verified && offer.priceCents !== null && '≈'}
        {price(offer.priceCents)}
      </p>
      <a
        href={offer.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-2 transition-colors hover:border-ink/40 hover:text-ink"
        aria-label={`${t('visit')} ${offer.retailerName}`}
      >
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </li>
  );
}

function TargetPriceForm({ product }: { product: ProductDetail }) {
  const t = useT();
  const toast = useToast();
  const update = useUpdateTarget();
  const [value, setValue] = useState(product.targetPriceCents ? (product.targetPriceCents / 100).toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);

  function save(event: FormEvent) {
    event.preventDefault();
    const cents = value.trim() ? parseDollars(value) : null;
    if (value.trim() && cents === null) return setError(t('targetInvalid'));
    setError(null);
    update.mutate(
      { productId: product.id, targetPriceCents: cents },
      { onSuccess: () => toast(t('targetSaved')), onError: () => toast(t('genericError'), 'error') },
    );
  }

  const reached = product.targetPriceCents !== null && product.best?.priceCents != null && product.best.priceCents <= product.targetPriceCents;

  return (
    <form onSubmit={save} className="mt-6 rounded-3xl border border-line bg-surface p-4">
      <label htmlFor="target" className="flex items-center gap-2 text-sm font-medium text-ink">
        <Target className="size-4 text-accent-ink" aria-hidden /> {t('targetLabel')}
        {reached && <Chip tone="positive">{t('belowTarget')}</Chip>}
      </label>
      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
          <input
            id="target"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={product.best?.priceCents ? ((product.best.priceCents * 0.9) / 100).toFixed(2) : '0.00'}
            aria-invalid={error ? true : undefined}
            className="h-11 w-full rounded-full border border-line-strong bg-surface pr-4 pl-8 text-ink tabular-nums outline-none focus:border-ink/50 focus-visible:outline-none"
          />
        </div>
        <Button type="submit" variant="ink" loading={update.isPending}>
          {t('saveTarget')}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
    </form>
  );
}

type Range = '30' | '90' | '180';

function HistoryCard({ history }: { history: PricePoint[] }) {
  const t = useT();
  const { lang } = usePreferences();
  const [range, setRange] = useState<Range>('90');
  const [showTable, setShowTable] = useState(false);

  const points = useMemo(() => {
    const cutoff = new Date(Date.now() - Number(range) * 86_400_000).toISOString().slice(0, 10);
    return history.filter((p) => p.date >= cutoff);
  }, [history, range]);

  const values = points.map((p) => p.priceCents);
  const stats = values.length
    ? {
        current: values.at(-1)!,
        lowest: Math.min(...values),
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      }
    : null;

  return (
    <section className="rounded-[28px] border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-medium tracking-tight">{t('historyTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('historySubtitle')}</p>
        </div>
        <Segmented
          label={t('historyTitle')}
          size="sm"
          value={range}
          onChange={setRange}
          options={(['30', '90', '180'] as Range[]).map((r) => ({ value: r, label: t('days', { n: r }) }))}
        />
      </div>

      {stats && (
        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            [t('current'), stats.current],
            [t('lowestInRange'), stats.lowest],
            [t('average'), stats.average],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl bg-surface-2 px-4 py-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tracking-tight">{price(value as number)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-6">
        {points.length >= 2 ? (
          <PriceChart points={points} />
        ) : (
          <p className="rounded-2xl bg-surface-2 px-4 py-8 text-center text-sm text-muted">
            {points.length === 1 ? t('historyOne') : t('historyEmpty')}
          </p>
        )}
      </div>

      {points.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowTable((s) => !s)} className="text-sm font-medium text-ink-2 hover:text-ink">
            {showTable ? t('hideTable') : t('showTable')}
          </button>
          {showTable && (
            <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t('date')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('price')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.date} className="border-t border-line">
                      <td className="px-4 py-2">{shortDate(p.date, lang)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{price(p.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-10 md:grid-cols-[5fr_7fr]" aria-hidden>
      <div className="skeleton aspect-square rounded-[32px]" />
      <div className="space-y-4 pt-4">
        <div className="skeleton h-9 w-4/5 rounded-full" />
        <div className="skeleton h-9 w-3/5 rounded-full" />
        <div className="skeleton mt-10 h-14 w-2/5 rounded-full" />
        <div className="skeleton mt-8 h-14 w-full rounded-full" />
      </div>
    </div>
  );
}

export function ProductPage() {
  const t = useT();
  const { lang } = usePreferences();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const { data: product, error, isPending } = useProduct(id);

  const back = (
    <button
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
      className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden /> {t('back')}
    </button>
  );

  if (error) {
    return (
      <Container>
        {back}
        <div className="rounded-[28px] border border-line bg-surface px-6 py-16 text-center">
          <p className="text-xl font-medium">
            {error instanceof ApiError && error.status === 404 ? t('productNotFound') : t('genericError')}
          </p>
          <Link to="/" className="mt-4 inline-block font-medium text-accent-ink hover:underline">
            {t('goHome')}
          </Link>
        </div>
      </Container>
    );
  }

  if (isPending || !product) {
    return (
      <Container>
        {back}
        <ProductSkeleton />
      </Container>
    );
  }

  const best = product.best;
  const pricedOffers = product.offers.filter((o) => o.priceCents !== null);

  return (
    <Container>
      {back}
      <div className="grid gap-8 md:grid-cols-[5fr_7fr] md:gap-12">
        <ProductImage src={product.imageUrl} alt={product.title} className="aspect-square rounded-[32px] border border-line" />

        <div className="flex flex-col">
          {product.brand && <p className="text-sm font-medium tracking-wide text-muted uppercase">{product.brand}</p>}
          <h1 className="mt-2 text-3xl leading-tight font-medium tracking-tight text-ink sm:text-4xl">{product.title}</h1>

          <div className="mt-8">
            {best ? (
              <>
                <p className="text-sm text-muted">{t('bestPrice')}</p>
                <p className="mt-1 text-5xl font-semibold tracking-[-0.03em] text-ink sm:text-6xl">
                  {!best.verified && <span title={t('unconfirmedHint')}>≈</span>}
                  {price(best.priceCents)}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-ink-2">
                  {t('atStore', { store: best.retailerName })} · {t('checked', { time: relativeTime(best.checkedAt, lang) })}
                  {product.savingsCents !== null && (
                    <Chip tone="positive">
                      {t('saveAmount', { amount: price(product.savingsCents) })} {t('vsNextStore')}
                    </Chip>
                  )}
                </p>
              </>
            ) : product.pending ? (
              <p className="flex items-center gap-2 text-ink-2">
                <Spinner className="size-5 text-accent-ink" /> {t('checkingPrices')}
              </p>
            ) : (
              <p className="text-lg text-muted">{t('unavailable')}</p>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {best && (
              <ExternalButton href={best.url} size="lg">
                {t('goToStore', { store: best.retailerName })}
              </ExternalButton>
            )}
            <FavoriteButton product={product} variant="pill" />
          </div>

          {product.isFavorite && <TargetPriceForm key={product.targetPriceCents ?? 'none'} product={product} />}
        </div>
      </div>

      <section className="mt-14">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-medium tracking-tight">
            {pricedOffers.length === 1 ? t('pricesAtOne') : t('pricesAt', { n: pricedOffers.length })}
          </h2>
          {product.pending && (
            <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
              <Spinner className="size-4 text-accent-ink" /> {t('checkingPrices')}
            </p>
          )}
        </div>
        <ul className="rounded-[28px] border border-line bg-surface p-2">
          {product.offers.length === 0 ? (
            product.pending ? (
              Array.from({ length: 3 }, (_, i) => <li key={i} className="skeleton m-2 h-12 rounded-2xl" />)
            ) : (
              <li className="px-4 py-8 text-center text-sm text-muted">{t('unavailable')}</li>
            )
          ) : (
            product.offers.map((offer) => <OfferRow key={offer.id} offer={offer} isBest={offer.id === best?.id} />)
          )}
        </ul>
      </section>

      <div className="mt-8">
        <HistoryCard history={product.history} />
      </div>
    </Container>
  );
}
