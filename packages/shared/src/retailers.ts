/**
 * The retailers we treat as "official". Offers from any other store (resellers,
 * marketplace third-party sellers, eBay listings, ...) are dropped, so a random
 * reseller can never become the "best price".
 */
export interface Retailer {
  slug: string;
  name: string;
  domains: string[];
  /** Lower-case store names as they appear in Google Shopping. */
  aliases: string[];
}

export const RETAILERS: readonly Retailer[] = [
  { slug: 'amazon', name: 'Amazon', domains: ['amazon.com'], aliases: ['amazon', 'amazon.com'] },
  { slug: 'bestbuy', name: 'Best Buy', domains: ['bestbuy.com'], aliases: ['best buy', 'bestbuy', 'bestbuy.com'] },
  { slug: 'walmart', name: 'Walmart', domains: ['walmart.com'], aliases: ['walmart', 'walmart.com'] },
  { slug: 'target', name: 'Target', domains: ['target.com'], aliases: ['target', 'target.com'] },
  { slug: 'newegg', name: 'Newegg', domains: ['newegg.com'], aliases: ['newegg', 'newegg.com'] },
  { slug: 'costco', name: 'Costco', domains: ['costco.com'], aliases: ['costco', 'costco wholesale'] },
  { slug: 'samsclub', name: "Sam's Club", domains: ['samsclub.com'], aliases: ["sam's club", 'sams club'] },
  { slug: 'bjs', name: "BJ's", domains: ['bjs.com'], aliases: ["bj's wholesale club", "bj's"] },
  { slug: 'bhphoto', name: 'B&H Photo', domains: ['bhphotovideo.com'], aliases: ['b&h photo-video-audio', 'b&h photo video', 'b&h photo', 'b&h'] },
  { slug: 'adorama', name: 'Adorama', domains: ['adorama.com'], aliases: ['adorama'] },
  { slug: 'microcenter', name: 'Micro Center', domains: ['microcenter.com'], aliases: ['micro center', 'microcenter'] },
  { slug: 'gamestop', name: 'GameStop', domains: ['gamestop.com'], aliases: ['gamestop'] },
  { slug: 'apple', name: 'Apple', domains: ['apple.com'], aliases: ['apple', 'apple store'] },
  { slug: 'samsung', name: 'Samsung', domains: ['samsung.com'], aliases: ['samsung', 'samsung.com', 'samsung electronics'] },
  { slug: 'microsoft', name: 'Microsoft', domains: ['microsoft.com', 'xbox.com'], aliases: ['microsoft', 'microsoft store', 'xbox'] },
  { slug: 'playstation', name: 'PlayStation Direct', domains: ['playstation.com'], aliases: ['playstation direct', 'playstation', 'playstation.com'] },
  { slug: 'nintendo', name: 'Nintendo', domains: ['nintendo.com'], aliases: ['nintendo', 'my nintendo store'] },
  { slug: 'dell', name: 'Dell', domains: ['dell.com'], aliases: ['dell', 'dell technologies'] },
  { slug: 'hp', name: 'HP', domains: ['hp.com'], aliases: ['hp', 'hp.com', 'hp store'] },
  { slug: 'lenovo', name: 'Lenovo', domains: ['lenovo.com'], aliases: ['lenovo'] },
  { slug: 'homedepot', name: 'The Home Depot', domains: ['homedepot.com'], aliases: ['the home depot', 'home depot'] },
  { slug: 'lowes', name: "Lowe's", domains: ['lowes.com'], aliases: ["lowe's", 'lowes'] },
  { slug: 'staples', name: 'Staples', domains: ['staples.com'], aliases: ['staples'] },
  { slug: 'officedepot', name: 'Office Depot', domains: ['officedepot.com'], aliases: ['office depot', 'office depot officemax'] },
  { slug: 'crutchfield', name: 'Crutchfield', domains: ['crutchfield.com'], aliases: ['crutchfield'] },
  { slug: 'kohls', name: "Kohl's", domains: ['kohls.com'], aliases: ["kohl's", 'kohls'] },
  { slug: 'macys', name: "Macy's", domains: ['macys.com'], aliases: ["macy's", 'macys'] },
];

const bySlug = new Map(RETAILERS.map((r) => [r.slug, r]));

export function retailerName(slug: string): string {
  return bySlug.get(slug)?.name ?? slug;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matchesDomain(host: string, retailer: Retailer): boolean {
  return retailer.domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Maps a store (as named by an aggregator) to one of our official retailers.
 *
 * Google Shopping names marketplace sellers "<Marketplace> - <Seller>"
 * (e.g. "Walmart - HyperTech", "Amazon.com - Seller", "eBay - gamecity413").
 * Those are third parties, not the retailer itself, so they're rejected.
 */
export function identifyRetailer(storeName: string | null | undefined, url?: string | null): Retailer | null {
  const name = (storeName ?? '').trim().toLowerCase();
  if (/\s[-–]\s/.test(name)) return null;

  const host = hostOf(url);
  const byName = name ? RETAILERS.find((r) => r.aliases.includes(name)) : undefined;

  if (host && !host.endsWith('google.com')) {
    const byHost = RETAILERS.find((r) => matchesDomain(host, r));
    // On a retailer's domain, the store name must be the retailer itself (or
    // absent). Any other name there is a marketplace seller.
    if (byHost && (!name || byName === byHost)) return byHost;
    return null;
  }
  return byName ?? null;
}
