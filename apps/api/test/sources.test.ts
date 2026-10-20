import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Polling waits are real sleeps; skip them in tests.
vi.mock('../src/resilience', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/resilience')>()),
  sleep: () => Promise.resolve(),
}));

const { amazon } = await import('../src/sources/amazon');
const { bestbuy } = await import('../src/sources/bestbuy');
const { shopping, clusterKey } = await import('../src/sources/shopping');

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Replies to each fetch with the next body in the list. */
function mockFetch(...bodies: (string | { status: number; body: string })[]) {
  const calls: string[] = [];
  const queue = [...bodies];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    const next = queue.shift() ?? '{}';
    const { status, body } = typeof next === 'string' ? { status: 200, body: next } : next;
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

const signal = new AbortController().signal;
const jobStarted = JSON.stringify({ error: false, job_id: 'job-1' });
const working = JSON.stringify({ status: 'working' });

afterEach(() => vi.unstubAllGlobals());

describe('amazon source (recorded Price Analytics responses)', () => {
  it('parses search results, treating price 0 as "no price" and Renewed as refurbished', async () => {
    mockFetch(jobStarted, working, fixture('amazon-search.json'));
    const { offers } = await amazon.search('playstation 5 console', signal);
    expect(offers).toHaveLength(4);
    expect(offers[0]).toMatchObject({ externalId: 'B0FRGMYJMG', priceCents: null, verified: false });
    expect(offers[1]).toMatchObject({ externalId: 'B0CP4F9J4W', priceCents: 57999, condition: 'refurbished' });
    expect(offers[0]!.url).toBe('https://www.amazon.com/dp/B0FRGMYJMG');
  });

  it('uses the Buy Box price on lookup even when the API returns an empty asin', async () => {
    mockFetch(jobStarted, fixture('amazon-lookup-buybox.json'));
    const offer = await amazon.lookup!('B09XSDMT4F', signal);
    expect(offer).toMatchObject({ externalId: 'B09XSDMT4F', priceCents: 29800, inStock: true, verified: true });
    expect(offer!.url).toBe('https://www.amazon.com/dp/B09XSDMT4F');
  });

  it('ignores used offers: without a Buy Box, the cheapest NEW offer wins', async () => {
    // Search showed $589 for this ASIN, but that was a "Used - Very Good" seller.
    mockFetch(jobStarted, fixture('amazon-lookup-used.json'));
    const offer = await amazon.lookup!('B0CL5KNB9M', signal);
    expect(offer).toMatchObject({ priceCents: 59995, verified: true });
  });

  it('reports a failed job', async () => {
    mockFetch(jobStarted, JSON.stringify({ status: 'finished', results: [{ success: false, reason: 'parameter value invalid' }] }));
    await expect(amazon.search('x', signal)).rejects.toThrow('parameter value invalid');
  });
});

describe('best buy source', () => {
  it('builds the keyword query and maps products', async () => {
    const calls = mockFetch(
      JSON.stringify({
        products: [
          {
            sku: 6604616,
            name: 'Sony - PlayStation 5 Slim Console Digital Edition - White',
            salePrice: 449.99,
            upc: '711719577294',
            modelNumber: 'CFI-2015',
            manufacturer: 'Sony',
            url: 'https://www.bestbuy.com/site/6604616.p?skuId=6604616',
            image: 'https://pisces.bbystatic.com/image.jpg',
            onlineAvailability: true,
            condition: 'New',
          },
          { sku: 1, name: 'Refurb thing', salePrice: 10, condition: 'Refurbished', onlineAvailability: false },
        ],
      }),
    );
    const { offers } = await bestbuy.search('PS5 "Slim" digital!', signal);
    expect(calls[0]).toContain('/v1/products((search=ps5&search=slim&search=digital))?');
    expect(offers[0]).toMatchObject({ externalId: '6604616', priceCents: 44999, gtin: '711719577294', inStock: true });
    expect(offers[1]).toMatchObject({ condition: 'refurbished', inStock: false });
  });

  it('returns null from lookup when the SKU no longer exists', async () => {
    mockFetch({ status: 404, body: '{"errorMessage":"not found"}' });
    expect(await bestbuy.lookup!('123', signal)).toBeNull();
  });
});

describe('google shopping source', () => {
  it('derives a stable cluster key from Google product ids', () => {
    expect(clusterKey('catalogid:111,productid:222,gpcid:333,headlineOfferDocid:444')).toBe('gpcid:333');
    expect(clusterKey('catalogid:111,productid:,headlineOfferDocid:444')).toBe('catalogid:111');
  });

  it('keeps only official retailers and one offer per store', async () => {
    mockFetch(
      JSON.stringify({
        status: 'OK',
        data: {
          offers: [
            { offer_page_url: 'https://www.walmart.com/ip/1', price: '$499.00', store_name: 'Walmart', product_condition: 'NEW' },
            { offer_page_url: 'https://www.walmart.com/ip/2', price: '$399.00', store_name: 'Walmart - HyperTech', product_condition: 'NEW' },
            { offer_page_url: 'https://www.target.com/p/1', price: '$489.99', store_name: 'Target', product_condition: 'NEW' },
            { offer_page_url: 'https://www.target.com/p/2', price: '$399.99', store_name: 'Target', product_condition: 'USED' },
            { offer_page_url: 'https://www.mercari.com/x', price: '$300.00', store_name: 'Mercari', product_condition: 'NEW' },
            { offer_page_url: 'https://www.amazon.com/dp/B0', price: '$100.00', store_name: 'Amazon.com - Seller', product_condition: 'NEW' },
          ],
        },
      }),
    );
    const offers = await shopping.offersFor!('catalogid:1,gpcid:9', signal);
    expect(offers.map((o) => [o.retailer, o.priceCents, o.condition])).toEqual([
      ['walmart', 49900, 'new'],
      ['target', 48999, 'new'],
    ]);
    expect(offers[0]!.externalId).toBe('gpcid:9|walmart');
  });

  it('ranks clusters headlined by an official retailer first, keeping Google order otherwise', async () => {
    const product = (id: number, store: string) => ({
      product_id: `catalogid:${id},gpcid:${id}`,
      product_title: `Product ${id}`,
      price: '$100.00',
      store_name: store,
    });
    mockFetch(
      JSON.stringify({
        status: 'OK',
        data: { products: [product(1, 'Mercari'), product(2, 'Best Buy'), product(3, 'eBay - seller'), product(4, 'Walmart')] },
      }),
    );
    const { clusters } = await shopping.search('x', signal);
    expect(clusters.map((c) => [c.title, c.teaser?.retailerName ?? null])).toEqual([
      ['Product 2', 'Best Buy'],
      ['Product 4', 'Walmart'],
      ['Product 1', null],
      ['Product 3', null],
    ]);
  });

  it('explains how to fix a missing RapidAPI subscription', async () => {
    mockFetch({ status: 403, body: '{"message":"You are not subscribed to this API."}' });
    await expect(shopping.search('ps5', signal)).rejects.toThrow(/subscribe to the free plan/);
  });
});
