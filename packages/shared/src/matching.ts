/**
 * Deciding whether two listings from different stores are the same product.
 *
 * Google Shopping already clusters offers into products (using GTINs), so it
 * is the primary source of truth. This module attaches listings from retailer
 * APIs (Best Buy, Amazon) to those clusters, or to each other.
 *
 * It is deliberately conservative: merging two different products produces a
 * wrong "best price", while failing to merge only produces a duplicate card.
 * So any hard conflict (different model number, digital vs disc, 55" vs 65",
 * Pro vs non-Pro, 256GB vs 512GB, ...) vetoes a match.
 */

export interface MatchInput {
  title: string;
  gtin?: string | null;
  model?: string | null;
}

export interface Fingerprint {
  tokens: Set<string>;
  flags: Set<string>;
  colors: Set<string>;
  storageGb: Set<number>;
  sizes: Set<string>;
  models: Set<string>;
  gtin: string | null;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'with', 'for', 'of', 'in', 'on', 'by', 'to', 'from', 'w',
  'new', 'brand', 'edition', 'version', 'console', 'gaming', 'model', 'system', 'official',
  'renewed', 'refurbished', 'used', 'certified', 'premium', 'latest', 'us', 'usa', 'slim',
  // Brands: one store writes "Sony PlayStation 5", another just "PlayStation 5".
  'sony', 'apple', 'samsung', 'microsoft', 'nintendo', 'lg', 'google', 'dell', 'hp', 'lenovo',
  'asus', 'acer', 'msi', 'bose', 'jbl', 'beats', 'canon', 'nikon', 'dji', 'logitech', 'razer',
  'anker', 'dyson', 'vizio', 'tcl', 'hisense', 'garmin', 'fitbit', 'amazon',
]);

/** Words that turn a product into a different product when only one title has them. */
const VARIANT_FLAGS = new Set([
  'pro', 'max', 'mini', 'plus', 'ultra', 'lite', 'air', 'oled', 'digital', 'disc', 'bundle',
  'controller', 'case', 'cover', 'charger', 'cable', 'adapter', 'stand', 'mount', 'skin',
  'protector', 'remote', 'headset', 'portal', 'replacement', 'refill', 'kit',
]);

const COLORS = new Map<string, string>([
  ['black', 'black'], ['white', 'white'], ['silver', 'silver'], ['gray', 'gray'], ['grey', 'gray'],
  ['gold', 'gold'], ['blue', 'blue'], ['red', 'red'], ['green', 'green'], ['pink', 'pink'],
  ['purple', 'purple'], ['yellow', 'yellow'], ['orange', 'orange'], ['navy', 'navy'],
  ['beige', 'beige'], ['graphite', 'graphite'], ['midnight', 'midnight'], ['starlight', 'starlight'],
]);

const NOT_A_MODEL = /^(gen|wifi|usb|ddr|gddr|lpddr|hdmi|pcie|ipx|ip|dp|bt|sd|hd|uhd|fhd|qhd)\d/;

function normalize(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[®™©]/g, '')
    .replace(/(\d+)(?:st|nd|rd|th)\s*gen(?:eration)?\b/g, 'gen$1')
    .replace(/\bgen(?:eration)?\s*(\d+)\b/g, 'gen$1')
    .replace(/(\d+)\s*(gb|tb)\b/g, '$1$2')
    .replace(/(\d{2,3}(?:\.\d)?)\s*(?:"|”|''|-?\s?inch(?:es)?\b|-?in\b)/g, '$1in')
    .replace(/(\d{2,3})\s*(?:"|-)?\s*class\b/g, '$1in');
}

function splitTokens(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}.]+/u)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .flatMap((t) => {
      // "playstation5" -> "playstation 5", but keep short prefixes like "ps5" intact.
      const m = t.match(/^(\p{L}{3,})(\d+)$/u);
      return m ? [m[1]!, m[2]!] : [t];
    })
    .filter(Boolean);
}

/**
 * The part of a title that names the product, without the marketing tail.
 * "Sony - PlayStation 5 Slim Console Digital Edition - White" -> first two
 * segments (Best Buy's "Brand - Name - Variant" pattern), while Amazon-style
 * "Name, feature, feature, ..." keeps just the name.
 */
function headOf(normalized: string): string {
  const segments = normalized.split(/\s[-–|]\s|,|\s\|\s/);
  let head = '';
  for (const segment of segments) {
    head = head ? `${head} ${segment}` : segment;
    if (splitTokens(head).filter((t) => !STOPWORDS.has(t)).length >= 4) break;
  }
  return head;
}

function extractModels(normalized: string): Set<string> {
  const models = new Set<string>();
  const patterns = [/\b[a-z]{1,5}-?\d{2,5}[a-z0-9-]*\b/g, /\b\d{2,4}[a-z]{1,4}\d{1,4}[a-z0-9]*\b/g];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const model = match[0].replace(/-/g, '');
      if (model.length >= 4 && !NOT_A_MODEL.test(model) && !/^\d+(gb|tb|in|hz|mah|w|mm|k)$/.test(model)) {
        models.add(model);
      }
    }
  }
  return models;
}

export function normalizeModel(model: string | null | undefined): string | null {
  const m = (model ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return m.length >= 4 ? m : null;
}

export function normalizeGtin(gtin: string | null | undefined): string | null {
  const digits = (gtin ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  return digits.padStart(14, '0');
}

export function fingerprint(input: MatchInput): Fingerprint {
  const normalized = normalize(input.title);
  const head = headOf(normalized);
  const headTokens = splitTokens(head);
  const allTokens = splitTokens(normalized);

  const tokens = new Set(headTokens.filter((t) => !STOPWORDS.has(t) && !VARIANT_FLAGS.has(t) && !COLORS.has(t)));
  const flags = new Set(headTokens.filter((t) => VARIANT_FLAGS.has(t)));
  const colors = new Set(allTokens.flatMap((t) => (COLORS.has(t) ? [COLORS.get(t)!] : [])));
  const storageGb = new Set(
    allTokens.flatMap((t) => {
      const m = t.match(/^(\d+)(gb|tb)$/);
      if (!m) return [];
      const n = Number(m[1]) * (m[2] === 'tb' ? 1000 : 1);
      // RAM sizes (<= 64GB) are too noisy to use as a conflict signal.
      return n >= 100 ? [n] : [];
    }),
  );
  const sizes = new Set(allTokens.filter((t) => /^\d{2,3}(?:\.\d)?in$/.test(t)));
  const models = extractModels(normalized);
  const explicitModel = normalizeModel(input.model);
  if (explicitModel) models.add(explicitModel);

  return { tokens, flags, colors, storageGb, sizes, models, gtin: normalizeGtin(input.gtin) };
}

function intersects<T>(a: Set<T>, b: Set<T>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/** 0..1 confidence that two fingerprints describe the same product. */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  if (a.gtin && b.gtin) return a.gtin === b.gtin ? 1 : 0;

  if (!sameSet(a.flags, b.flags)) return 0;
  if (a.colors.size && b.colors.size && !intersects(a.colors, b.colors)) return 0;
  if (a.storageGb.size && b.storageGb.size && !intersects(a.storageGb, b.storageGb)) return 0;
  if (a.sizes.size && b.sizes.size && !intersects(a.sizes, b.sizes)) return 0;
  if (a.models.size && b.models.size) return intersects(a.models, b.models) ? 0.95 : 0;

  let shared = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) shared++;
  const smaller = Math.min(a.tokens.size, b.tokens.size);
  if (smaller < 2) return 0;
  const union = a.tokens.size + b.tokens.size - shared;
  const jaccard = shared / union;
  const containment = shared / smaller;
  // Both must be high: containment alone would let "PlayStation 5" match
  // "PlayStation 5 Astro Bot game"; Jaccard alone punishes long titles.
  if (jaccard < 0.5 || containment < 0.75) return 0;
  return 0.5 * jaccard + 0.5 * containment;
}

export const MATCH_THRESHOLD = 0.62;

export interface Group<A, I> {
  anchor: A | null;
  members: I[];
}

/**
 * Attaches each item to the best-matching group (seeded by the anchors) or
 * starts a new group. A group never takes two items from the same source,
 * because a single retailer search returns distinct products.
 */
export function groupByProduct<A extends MatchInput, I extends MatchInput & { source: string }>(
  anchors: A[],
  items: I[],
): Group<A, I>[] {
  const groups = anchors.map((anchor) => ({
    anchor: anchor as A | null,
    members: [] as I[],
    fp: fingerprint(anchor),
    sources: new Set<string>(),
  }));

  for (const item of items) {
    const fp = fingerprint(item);
    let best: (typeof groups)[number] | null = null;
    let bestScore = MATCH_THRESHOLD;
    for (const group of groups) {
      if (group.sources.has(item.source)) continue;
      const score = similarity(group.fp, fp);
      if (score >= bestScore) {
        best = group;
        bestScore = score;
      }
    }
    if (best) {
      best.members.push(item);
      best.sources.add(item.source);
    } else {
      groups.push({ anchor: null, members: [item], fp, sources: new Set([item.source]) });
    }
  }

  return groups.map(({ anchor, members }) => ({ anchor, members }));
}
