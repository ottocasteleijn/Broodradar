export interface Retailer {
  id: string;
  name: string;
  color: string;
  active: boolean;
  description: string;
  icon?: string | null;
  productCount: number | null;
  lastUpdate: string | null;
  snapshotCount: number;
}

export interface Product {
  id: string;
  supermarketId: string;
  catalogId: string | null;
  webshopId: string;
  image: string;
  name: string;
  brand: string;
  price: number;
  unit: string;
  nutriscore: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  category: string;
  bonus: boolean;
}

export interface CatalogProduct {
  id: string;
  retailer: string;
  webshop_id: string;
  title: string | null;
  brand: string | null;
  price: number | null;
  sales_unit_size: string | null;
  unit_price_description: string | null;
  nutriscore: string | null;
  main_category: string | null;
  sub_category: string | null;
  image_url: string | null;
  is_bonus: boolean;
  is_available: boolean;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProductHistoryEntry {
  id: string;
  product_id: string;
  snapshot_id: string;
  event_type: string;
  changes: Record<string, unknown>;
  price_at_snapshot: number | null;
  created_at: string;
}

export interface Snapshot {
  id: string;
  supermarketId: string;
  date: string;
  productCount: number;
  label: string | null;
  retailerName?: string;
}

export interface TimelineEvent {
  id: string;
  retailer: string;
  event_type: string;
  product_title: string;
  product_image_url: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface CompareProduct {
  id: string;
  title: string;
  brand: string;
  price: number;
  sales_unit_size: string;
  nutriscore: string | null;
  sub_category: string;
  is_bonus: boolean;
  image_url: string | null;
}

export interface PriceChange {
  product: CompareProduct;
  old_price: number;
  new_price: number;
  pct_change: number;
}

export interface BonusChange {
  product: CompareProduct;
  was_bonus: boolean;
  is_bonus: boolean;
}

export interface CompareResult {
  new_products: CompareProduct[];
  removed_products: CompareProduct[];
  price_changes: PriceChange[];
  bonus_changes: BonusChange[];
}

const CACHE_TTL = {
  retailers: 5 * 60 * 1000,       // 5 min
  retailerProducts: 2 * 60 * 1000, // 2 min
  snapshots: 2 * 60 * 1000,        // 2 min
  timeline: 2 * 60 * 1000,         // 2 min
  compare: 2 * 60 * 1000,          // 2 min
  product: 2 * 60 * 1000,          // 2 min
  productHistory: 2 * 60 * 1000,   // 2 min
} as const;

const cache = new Map<string, { data: unknown; expiresAt: number }>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  const data = await fn();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

export function invalidateCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key === prefix || key.startsWith(prefix + ':')) cache.delete(key);
  }
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
  }
  return res.json();
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function mapProduct(p: Record<string, unknown>): Product {
  const nutri = typeof p.nutriscore === 'string' && /^[A-E]$/i.test(p.nutriscore)
    ? p.nutriscore.toUpperCase() as Product['nutriscore']
    : null;

  return {
    id: toStr(p.id),
    supermarketId: toStr(p.retailer),
    catalogId: (p.catalog_id as string) ?? null,
    webshopId: toStr(p.webshop_id),
    image: toStr(p.image_url),
    name: toStr(p.title),
    brand: toStr(p.brand),
    price: toNumber(p.price),
    unit: toStr(p.sales_unit_size),
    nutriscore: nutri,
    category: toStr(p.sub_category),
    bonus: Boolean(p.is_bonus),
  };
}

function mapSnapshot(s: Record<string, unknown>): Snapshot {
  return {
    id: s.id as string,
    supermarketId: (s.retailer as string) || 'ah',
    date: (s.created_at as string) || '',
    productCount: (s.product_count as number) || 0,
    label: (s.label as string) || null,
  };
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ email: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    me: () => request<{ email: string }>('/api/auth/me'),
  },

  retailers: () =>
    cached('retailers', CACHE_TTL.retailers, () => request<Retailer[]>('/api/retailers')),

  retailerProducts: async (slug: string): Promise<Product[]> => {
    const raw = await cached(`retailerProducts:${slug}`, CACHE_TTL.retailerProducts, () =>
      request<Record<string, unknown>[]>(`/api/retailers/${slug}/products`)
    );
    return raw.map(mapProduct);
  },

  createSnapshot: async (slug: string) => {
    const result = await request<{ snapshot_id: string; product_count: number }>(
      `/api/retailers/${slug}/snapshot`,
      { method: 'POST' },
    );
    invalidateCache('retailerProducts');
    invalidateCache('snapshots');
    return result;
  },

  refreshAll: async (): Promise<{ results: Record<string, { ok: boolean; product_count?: number; snapshot_id?: string; error?: string }> }> => {
    const data = await request<{ results: Record<string, { ok: boolean; product_count?: number; snapshot_id?: string; error?: string }> }>(
      '/api/retailers/refresh-all',
      { method: 'POST' },
    );
    invalidateCache('retailerProducts');
    invalidateCache('snapshots');
    invalidateCache('retailers');
    return data;
  },

  snapshots: async (retailer?: string): Promise<Snapshot[]> => {
    const key = `snapshots:${retailer ?? 'all'}`;
    const raw = await cached(key, CACHE_TTL.snapshots, async () => {
      const params = retailer ? `?retailer=${retailer}` : '';
      return request<Record<string, unknown>[]>(`/api/snapshots${params}`);
    });
    return raw.map(mapSnapshot);
  },

  timeline: (retailer?: string, type?: string) => {
    const key = `timeline:${retailer ?? ''}:${type ?? ''}`;
    return cached(key, CACHE_TTL.timeline, () => {
      const params = new URLSearchParams();
      if (retailer) params.set('retailer', retailer);
      if (type) params.set('type', type);
      const qs = params.toString();
      return request<TimelineEvent[]>(`/api/timeline${qs ? `?${qs}` : ''}`);
    });
  },

  compareSnapshots: (oldId: string, newId: string) => {
    const key = `compare:${oldId}:${newId}`;
    return cached(key, CACHE_TTL.compare, () =>
      request<CompareResult>(`/api/snapshots/compare?old=${oldId}&new=${newId}`)
    );
  },

  product: (id: string) =>
    cached(`product:${id}`, CACHE_TTL.product, () =>
      request<CatalogProduct>(`/api/products/${id}`)
    ),

  productByRef: (retailer: string, webshopId: string) => {
    const key = `productByRef:${retailer}:${webshopId}`;
    return cached(key, CACHE_TTL.product, () =>
      request<CatalogProduct>(`/api/products/by-ref?retailer=${encodeURIComponent(retailer)}&webshop_id=${encodeURIComponent(webshopId)}`)
    );
  },

  productHistory: (id: string, limit?: number) => {
    const key = `productHistory:${id}:${limit ?? ''}`;
    return cached(key, CACHE_TTL.productHistory, () => {
      const params = limit != null ? `?limit=${limit}` : '';
      return request<ProductHistoryEntry[]>(`/api/products/${id}/history${params}`);
    });
  },
};
