import { describe, expect, it } from 'vitest';
import { fingerprint, groupByProduct, MATCH_THRESHOLD, similarity } from './matching';
import { formatCents, toCents } from './money';
import { identifyRetailer } from './retailers';
import { rankOffers, type PricedOffer } from './best-price';

const same = (a: string, b: string) => similarity(fingerprint({ title: a }), fingerprint({ title: b })) >= MATCH_THRESHOLD;

describe('toCents', () => {
  it('parses provider price formats', () => {
    expect(toCents('$1,299.99')).toBe(129999);
    expect(toCents(579.99)).toBe(57999);
    expect(toCents('$115.00')).toBe(11500);
  });

  it('treats zero, empty and garbage as "no price" instead of $0', () => {
    // Amazon search returns price: 0 for items without a listed price.
    expect(toCents(0)).toBeNull();
    expect(toCents('')).toBeNull();
    expect(toCents('Free')).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents(Number.NaN)).toBeNull();
  });

  it('formats cents', () => {
    expect(formatCents(129999)).toBe('$1,299.99');
    expect(formatCents(50000)).toBe('$500');
  });
});

describe('identifyRetailer', () => {
  it('recognizes official stores by name or domain', () => {
    expect(identifyRetailer('Walmart')?.slug).toBe('walmart');
    expect(identifyRetailer('Best Buy', 'https://www.bestbuy.com/site/123.p')?.slug).toBe('bestbuy');
    expect(identifyRetailer('', 'https://www.target.com/p/abc')?.slug).toBe('target');
    expect(identifyRetailer('Newegg.com')?.slug).toBe('newegg');
  });

  it('rejects marketplace sellers and unknown stores', () => {
    expect(identifyRetailer('Walmart - HyperTech')).toBeNull();
    expect(identifyRetailer('Amazon.com - Seller', 'https://www.amazon.com/dp/B08QBBHFN5')).toBeNull();
    expect(identifyRetailer('eBay - gamecity413')).toBeNull();
    expect(identifyRetailer('Mercari')).toBeNull();
    expect(identifyRetailer('PRIME CELLUTIONS', 'https://www.amazon.com/dp/X')).toBeNull();
  });
});

describe('product matching', () => {
  it('matches the same product across naming styles', () => {
    expect(same('Sony PlayStation 5 Digital Edition', 'PlayStation®5 Digital Edition (slim)')).toBe(true);
    expect(same('Sony - PlayStation 5 Slim Console Digital Edition - White', 'Sony PlayStation 5 Digital Edition')).toBe(true);
    expect(same('Apple AirPods Pro 2 Wireless Earbuds', 'Apple - AirPods Pro 2, Wireless Active Noise Cancelling Earbuds')).toBe(true);
  });

  it('never matches different variants', () => {
    expect(same('PlayStation 5 Digital Edition (slim)', 'PlayStation 5 Disc Edition Console (slim)')).toBe(false);
    expect(same('PlayStation 5 Pro Console', 'PlayStation 5 Console')).toBe(false);
    expect(same('Apple AirPods Pro 2', 'Apple AirPods 4')).toBe(false);
    expect(same('Samsung 65" Class QN90C Neo QLED 4K Smart TV', 'Samsung 55" Class QN90C Neo QLED 4K Smart TV')).toBe(false);
    expect(same('iPhone 16 Pro 256GB', 'iPhone 16 Pro 512GB')).toBe(false);
    expect(same('Sony PlayStation 5 Portal Remote Player', 'Sony PlayStation 5 Console')).toBe(false);
    expect(same('DualSense Wireless Controller for PS5 - White', 'PlayStation 5 Console - White')).toBe(false);
    expect(same('Xbox Series X', 'Xbox Series S')).toBe(false);
    expect(same('PlayStation 5', 'PlayStation 5 Astro Bot Game Standard')).toBe(false);
  });

  it('uses model numbers and GTINs when present', () => {
    const a = fingerprint({ title: 'Sony WH-1000XM5 Wireless Headphones' });
    const b = fingerprint({ title: 'Sony - WH1000XM5 Noise Canceling Over-the-Ear Headphones' });
    const c = fingerprint({ title: 'Sony WH-1000XM4 Wireless Headphones' });
    expect(similarity(a, b)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(similarity(a, c)).toBe(0);
    expect(similarity(fingerprint({ title: 'x', gtin: '711719577294' }), fingerprint({ title: 'y', gtin: '00711719577294' }))).toBe(1);
  });

  it('groups items onto anchors, one per source', () => {
    const anchors = [{ title: 'Sony PlayStation 5 Digital Edition' }, { title: 'Sony PlayStation 5 Pro Console' }];
    const items = [
      { title: 'Sony - PlayStation 5 Slim Console Digital Edition - White', source: 'bestbuy' },
      { title: 'PlayStation®5 Digital Edition (slim)', source: 'amazon' },
      { title: 'PlayStation 5 Digital Edition 825GB', source: 'amazon' },
      { title: 'Nintendo Switch 2', source: 'amazon' },
    ];
    const groups = groupByProduct(anchors, items);
    expect(groups[0]!.members.map((m) => m.source)).toEqual(['bestbuy', 'amazon']);
    expect(groups[1]!.members).toEqual([]);
    // Second Amazon digital listing can't join group 0 (already has Amazon), so it starts its own.
    expect(groups.slice(2).map((g) => g.members[0]!.title)).toEqual(['PlayStation 5 Digital Edition 825GB', 'Nintendo Switch 2']);
  });
});

describe('rankOffers', () => {
  const offer = (retailer: string, priceCents: number | null, extra: Partial<PricedOffer> = {}): PricedOffer => ({
    retailer, priceCents, inStock: true, condition: 'new', currency: 'USD', source: 'shopping', checkedAt: '2026-01-01T00:00:00Z', ...extra,
  });

  it('picks the cheapest buyable new offer', () => {
    const { best, savingsCents, ranked } = rankOffers([
      offer('walmart', 49900),
      offer('amazon', 45900, { condition: 'used' }),
      offer('target', 47900),
      offer('newegg', 39900, { inStock: false }),
      offer('gamestop', null),
    ]);
    expect(best?.retailer).toBe('target');
    expect(savingsCents).toBe(2000);
    expect(ranked.map((o) => o.retailer)).toEqual(['target', 'walmart', 'newegg', 'amazon', 'gamestop']);
  });

  it('prefers the retailer API over the aggregator for the same store', () => {
    const { ranked } = rankOffers([
      offer('bestbuy', 49900, { source: 'shopping' }),
      offer('bestbuy', 47900, { source: 'bestbuy' }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.source).toBe('bestbuy');
  });

  it('ranks confirmed prices above unconfirmed search snippets', () => {
    const { best, ranked } = rankOffers([
      offer('amazon', 45900, { source: 'amazon', verified: false }),
      offer('walmart', 49900),
    ]);
    expect(best?.retailer).toBe('walmart');
    expect(ranked.map((o) => o.retailer)).toEqual(['walmart', 'amazon']);
  });

  it('returns no best price when nothing is eligible', () => {
    expect(rankOffers([offer('amazon', null), offer('walmart', 100, { condition: 'refurbished' })]).best).toBeNull();
  });
});
