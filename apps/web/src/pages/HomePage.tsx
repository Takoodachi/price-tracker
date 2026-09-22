import { ArrowUpRight, BadgePercent, Heart, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../lib/api';
import { useT } from '../lib/preferences';
import { useMe, useSearch } from '../lib/queries';
import { ProductCard, ProductCardSkeleton, SearchBar, SourceStatusRow } from '../components/search';
import { ButtonLink, Container, Spinner } from '../components/ui';

const EXAMPLES = ['PlayStation 5', 'AirPods Pro 2', 'Nintendo Switch 2', 'Sony WH-1000XM5'];

function Hero() {
  const t = useT();
  const { data: user } = useMe();
  return (
    <>
      <Container className="flex flex-col items-center pt-10 pb-20 text-center sm:pt-16 sm:pb-28">
        <p className="animate-rise mb-8 inline-flex max-w-full items-center rounded-full bg-ink px-3.5 py-2 text-[11px] font-medium text-canvas sm:px-4 sm:text-[13px]">
          <span className="truncate">{t('heroBadge')}</span>
        </p>
        <h1 className="animate-rise display-tight text-[44px] font-medium text-ink sm:text-[72px] lg:text-[84px]">
          {t('heroTitle1')}
          <br />
          <span className="text-accent-display">{t('heroTitle2')}</span>
        </h1>
        <p className="animate-rise mt-7 max-w-xl text-lg leading-relaxed text-muted [animation-delay:80ms]">
          {t('heroSubtitle')}
        </p>
        <div className="animate-rise mt-10 w-full max-w-2xl [animation-delay:140ms]">
          <SearchBar autoFocus />
        </div>
        <div className="animate-rise mt-5 flex flex-wrap items-center justify-center gap-2 text-sm [animation-delay:200ms]">
          <span className="text-muted">{t('tryLabel')}:</span>
          {EXAMPLES.map((example) => (
            <Link
              key={example}
              to={`/?q=${encodeURIComponent(example)}`}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              {example}
            </Link>
          ))}
        </div>
      </Container>

      <Container className="py-12">
        <h2 className="display-tight mx-auto max-w-2xl text-center text-4xl font-medium sm:text-5xl">{t('howTitle')}</h2>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            { icon: Search, title: t('how1Title'), body: t('how1Body') },
            { icon: BadgePercent, title: t('how2Title'), body: t('how2Body') },
            { icon: Heart, title: t('how3Title'), body: t('how3Body') },
          ].map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="rounded-[28px] border border-line bg-surface p-7">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-medium text-muted tabular-nums">0{i + 1}</span>
              </div>
              <h3 className="mt-8 text-xl font-medium tracking-tight">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Container>

      {!user && (
        <Container className="pt-12">
          <div className="flex flex-col items-center rounded-[32px] bg-ink px-6 py-16 text-center text-canvas">
            <h2 className="display-tight max-w-xl text-4xl font-medium sm:text-5xl">{t('ctaTitle')}</h2>
            <p className="mt-4 max-w-md text-canvas/70">{t('ctaBody')}</p>
            <ButtonLink to="/register" size="lg" className="mt-8">
              {t('ctaButton')} <ArrowUpRight className="size-5" aria-hidden />
            </ButtonLink>
          </div>
        </Container>
      )}
    </>
  );
}

function Results({ q }: { q: string }) {
  const t = useT();
  const search = useSearch(q);
  const data = search.data;

  return (
    <Container className="pt-4">
      <div className="mx-auto max-w-3xl">
        <SearchBar initial={q} size="md" />
      </div>

      <div className="mt-10">
        <h1 className="text-3xl font-medium tracking-tight break-words sm:text-4xl">{t('resultsFor', { q })}</h1>
        <div className="mt-3 flex min-h-8 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {data && (
            <p className="flex items-center gap-2 text-muted" aria-live="polite">
              {t('productsCount', { n: data.products.length })}
              {data.pending && (
                <>
                  <span aria-hidden>·</span>
                  <Spinner className="size-4 text-accent-ink" /> {t('checkingStores')}
                </>
              )}
            </p>
          )}
          {data && <SourceStatusRow sources={data.sources} />}
        </div>
      </div>

      <div className="mt-8">
        {search.isError ? (
          <div className="rounded-[28px] border border-line bg-surface p-10 text-center">
            <p className="text-lg font-medium">{t('searchFailed')}</p>
            <p className="mt-2 text-muted">
              {search.error instanceof ApiError && search.error.code === 'network' ? t('networkError') : search.error.message}
            </p>
            <button onClick={() => search.refetch()} className="mt-5 font-medium text-accent-ink hover:underline">
              {t('retry')}
            </button>
          </div>
        ) : !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : data.products.length === 0 && !data.pending ? (
          <div className="rounded-[28px] border border-line bg-surface px-6 py-16 text-center">
            <p className="text-xl font-medium">{t('noResults')}</p>
            <p className="mx-auto mt-2 max-w-sm text-muted">{t('noResultsHint')}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.products.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
            {data.pending && data.products.length < 4 && <ProductCardSkeleton />}
          </div>
        )}
      </div>
    </Container>
  );
}

export function HomePage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  return q.length >= 2 ? <Results q={q} /> : <Hero />;
}
