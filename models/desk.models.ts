// src/app/models/desk.models.ts
// Types + constants for the CRM Catalog Desk (spec v0.1).

export type Market = 'India' | 'UAE' | 'Qatar' | 'Saudi' | 'Bahrain' | 'Kuwait';
export type Channel = 'WhatsApp' | 'Call' | 'Instagram' | 'Walk-in follow-up';
export type MsgTpl = 'options' | 'nudge' | 'details' | 'price';
export type MakeType = 'Diamond' | 'Polki' | 'Gold' | 'Gemstone';
export type ItemStatus = 'In store' | 'At exhibition' | 'Reserved' | 'Sold';
export type SortKey = 'best' | 'price_asc' | 'price_desc' | 'new' | 'wt';
export type TagSeverity = 'secondary' | 'success' | 'warn' | 'danger' | 'info';

export const HOUR = 36e5;
export const DAY = 24 * HOUR;

/** One filter set per enquiry. '' = not set. */
export interface DeskFilters {
  brand: string;
  category: string;
  sub: string;
  make: '' | MakeType;
  occasion: string;
  budget: string; // "min-max" in INR
  goldWt: string; // "min-max" grams (net)
  diaWt: string; // "min-max" carats
  avail: 'store' | 'all';
  // legacy facet filters already used by the project
  gender: string;
  metal: string;
  purity: string;
  collection: string;
  stone_type: string;
}

export const blankFilters = (): DeskFilters => ({
  brand: '',
  category: '',
  sub: '',
  make: '',
  occasion: '',
  budget: '',
  goldWt: '',
  diaWt: '',
  avail: 'store',
  gender: '',
  metal: '',
  purity: '',
  collection: '',
  stone_type: '',
});

export interface Enquiry {
  id: string;
  name: string;
  phone: string;
  channel: Channel;
  market: Market;
  need: string;
  occasion: string;
  /** index into STAGES (0-5) */
  stage: number;
  /** last time options / nudge were sent; drives the 24-hr timer */
  sentAt: number | null;
  picked: string[]; // jewel codes
  q: string; // free-text search, remembered per enquiry
  f: DeskFilters; // filters, remembered per enquiry
  createdAt: number;
}

export interface SendLog {
  id: string;
  enquiryId: string;
  template: MsgTpl;
  codes: string[];
  at: number;
  /** Filled in by the server from the login token. */
  executive?: string;
}

export interface MarketRule {
  cur: string;
  /** Middle East price = C. No. × mult. null = India (price from ERP). */
  mult: number | null;
  extras: string | null;
}

/**
 * Defaults. Spec §5: multipliers must be editable by management without a
 * release, so DeskStateService.marketRules() should be hydrated from your
 * settings API (see the TODO there). These are only the fallback.
 */
export const DEFAULT_MARKET_RULES: Record<Market, MarketRule> = {
  India: { cur: '₹', mult: null, extras: null },
  UAE: { cur: 'AED', mult: 14, extras: 'Shipping + VAT' },
  Qatar: { cur: 'QAR', mult: 14, extras: 'Shipping + VAT' },
  Saudi: { cur: 'SAR', mult: 16, extras: 'Shipping + VAT' },
  Bahrain: { cur: 'BHD', mult: 1.4, extras: 'Shipping + VAT' },
  Kuwait: { cur: 'KD', mult: 1, extras: 'Shipping + Duty' },
};

export const MARKETS = Object.keys(DEFAULT_MARKET_RULES) as Market[];
export const CHANNELS: Channel[] = ['WhatsApp', 'Call', 'Instagram', 'Walk-in follow-up'];
export const MAKE_TYPES: MakeType[] = ['Diamond', 'Polki', 'Gold', 'Gemstone'];
export const OCCASIONS = [
  'Engagement',
  'Wedding / Bridal',
  'Anniversary',
  'Gifting',
  'Daily wear',
  'Festive',
  'Party / Cocktail',
];

export const STAGES = [
  { title: 'New enquiry', hint: 'Greet and note what they want' },
  { title: 'Requirement understood', hint: '1–2 questions max: category, occasion, budget' },
  { title: 'Options shared', hint: '3–4 pieces, model shots, Jewel Code on each' },
  { title: 'Reply checked (24 hrs)', hint: 'No reply? Nudge them to pick the one they sort of like' },
  { title: 'Details sent', hint: 'Gold, diamond, stone details. No price unless asked' },
  { title: 'Price + call', hint: 'Indicative price, then ask for a call or store visit' },
];

/** Stage reached once each template is marked as sent. */
export const STAGE_AFTER_SEND: Record<MsgTpl, number> = {
  options: 2,
  nudge: 3,
  details: 4,
  price: 5,
};

export const TEMPLATES: { key: MsgTpl; label: string }[] = [
  { key: 'options', label: 'Share options' },
  { key: 'nudge', label: '24-hr nudge' },
  { key: 'details', label: 'Details' },
  { key: 'price', label: 'Price + call' },
];

export interface Opt {
  label: string;
  value: string;
}

export const BUDGET_OPTIONS: Opt[] = [
  { value: '0-50000', label: 'Under ₹50k' },
  { value: '50000-100000', label: '₹50k – 1L' },
  { value: '100000-200000', label: '₹1 – 2L' },
  { value: '200000-500000', label: '₹2 – 5L' },
  { value: '500000-1000000', label: '₹5 – 10L' },
  { value: '1000000-99999999', label: 'Above ₹10L' },
];
export const GOLD_WT_OPTIONS: Opt[] = [
  { value: '0-5', label: 'Under 5 g' },
  { value: '5-10', label: '5 – 10 g' },
  { value: '10-25', label: '10 – 25 g' },
  { value: '25-50', label: '25 – 50 g' },
  { value: '50-999', label: 'Above 50 g' },
];
export const DIA_WT_OPTIONS: Opt[] = [
  { value: '0-0.5', label: 'Under 0.5 ct' },
  { value: '0.5-1', label: '0.5 – 1 ct' },
  { value: '1-2', label: '1 – 2 ct' },
  { value: '2-5', label: '2 – 5 ct' },
  { value: '5-99', label: 'Above 5 ct' },
];
export const AVAIL_OPTIONS: Opt[] = [
  { value: 'store', label: 'In store only' },
  { value: 'all', label: 'Incl. exhibition & reserved' },
];
export const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { value: 'best', label: 'Best match' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'new', label: 'Newest first' },
  { value: 'wt', label: 'Gold weight: light first' },
];

/**
 * Customer-facing copy. Confirm the claims below with management —
 * they are sent to customers for every piece.
 */
export const MESSAGE_COPY = {
  brand: 'RK Jewellers',
  store: 'South Extension Part II',
  goldNote: ', BIS hallmarked',
  detailsFooter:
    'All our diamonds are 100% natural. Would you like more options, or shall we work on the price?',
};

export function enquiryStatus(
  e: Enquiry,
  now: number,
): { label: string; severity: TagSeverity } {
  if (e.stage >= 5) return { label: 'Price call', severity: 'info' };
  if (e.stage >= 4) return { label: 'Details sent', severity: 'success' };
  if (e.sentAt && e.stage >= 2) {
    return now - e.sentAt > DAY
      ? { label: 'Reply overdue', severity: 'danger' }
      : { label: 'Awaiting reply', severity: 'warn' };
  }
  return { label: 'New', severity: 'secondary' };
}

/**
 * Parses budget phrases out of the search box:
 *   "under 1 lakh", "below 50k", "upto 2.5L", "1-2 lakh", "above 5 lakh"
 * Returns the remaining words (synonyms applied) + INR min/max.
 */
export function parseQuery(q: string): {
  words: string[];
  min: number | null;
  max: number | null;
} {
  let t = (q || '').toLowerCase();
  let min: number | null = null;
  let max: number | null = null;

  const amt = (n: string, u?: string) => {
    const v = parseFloat(n);
    const unit = (u || '').trim();
    if (/^l|lakh|lac/.test(unit)) return v * 1e5;
    if (/^k/.test(unit)) return v * 1e3;
    if (/^cr/.test(unit)) return v * 1e7;
    return v < 1000 ? v * 1e5 : v;
  };
  const U = '(lakhs|lakh|lacs|lac|cr|l|k)';

  let m = t.match(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}?\\b\\s*(?:-|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${U}\\b`),
  );
  if (m) {
    min = amt(m[1], m[2] || m[4]);
    max = amt(m[3], m[4]);
    t = t.replace(m[0], '');
  }
  m = t.match(
    new RegExp(
      `(?:under|below|upto|up to|within|max|less than)\\s*(?:rs\\.?|₹)?\\s*(\\d+(?:\\.\\d+)?)\\s*${U}?\\b`,
    ),
  );
  if (m) {
    max = amt(m[1], m[2]);
    t = t.replace(m[0], '');
  }
  m = t.match(
    new RegExp(`(?:above|over|more than)\\s*(?:rs\\.?|₹)?\\s*(\\d+(?:\\.\\d+)?)\\s*${U}?\\b`),
  );
  if (m) {
    min = amt(m[1], m[2]);
    t = t.replace(m[0], '');
  }

  const stop = new Set([
    'for', 'a', 'an', 'the', 'with', 'in', 'and', 'of', 'around', 'about', 'budget',
    'rs', 'looking', 'want', 'something', 'some', 'piece', 'pieces', 'show', 'me',
    'gold', 'jewellery', 'jewelry',
  ]);
  const syn: Record<string, string> = {
    stud: 'studs', earring: 'earrings', ring: 'rings', necklace: 'necklaces',
    bangle: 'bangles', pendant: 'pendants', chain: 'chains', diamonds: 'diamond',
    solitaires: 'solitaire', hoop: 'hoops', emeralds: 'emerald', rubies: 'ruby',
    kundan: 'polki', bridal: 'wedding', gift: 'gifting', office: 'daily',
  };
  const words = t
    .split(/[^a-z0-9.\-]+/)
    .filter((w) => w && !stop.has(w) && !/^\d+$/.test(w))
    .map((w) => syn[w] || w);

  return { words, min, max };
}
