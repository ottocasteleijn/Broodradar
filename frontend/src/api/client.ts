export interface Retailer {
  id: string;
  name: string;
  color: string;
  active: boolean;
  description: string;
  productCount: number | null;
  lastUpdate: string | null;
  snapshotCount: number;
}

export interface Product {
  id: string;
  supermarketId: string;
  image: string;
  name: string;
  brand: string;
  price: number;
  unit: string;
  nutriscore: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  category: string;
  bonus: boolean;
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

function mapProduct(p: Record<string, unknown>): Product {
  return {
    id: p.id as string,
    supermarketId: (p.retailer as string) || '',
    image: (p.image_url as string) || '',
    name: (p.title as string) || '',
    brand: (p.brand as string) || '',
    price: typeof p.price === 'number' ? p.price : parseFloat(p.price as string) || 0,
    unit: (p.sales_unit_size as string) || '',
    nutriscore: (p.nutriscore as Product['nutriscore']) || null,
    category: (p.sub_category as string) || '',
    bonus: (p.is_bonus as boolean) || false,
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

  retailers: () => request<Retailer[]>('/api/retailers'),

  retailerProducts: async (slug: string): Promise<Product[]> => {
    const raw = await request<Record<string, unknown>[]>(`/api/retailers/${slug}/products`);
    return raw.map(mapProduct);
  },

  createSnapshot: (slug: string) =>
    request<{ snapshot_id: string; product_count: number }>(
      `/api/retailers/${slug}/snapshot`,
      { method: 'POST' },
    ),

  snapshots: async (retailer?: string): Promise<Snapshot[]> => {
    const params = retailer ? `?retailer=${retailer}` : '';
    const raw = await request<Record<string, unknown>[]>(`/api/snapshots${params}`);
    return raw.map(mapSnapshot);
  },

  timeline: (retailer?: string, type?: string) => {
    const params = new URLSearchParams();
    if (retailer) params.set('retailer', retailer);
    if (type) params.set('type', type);
    const qs = params.toString();
    return request<TimelineEvent[]>(`/api/timeline${qs ? `?${qs}` : ''}`);
  },

  compareSnapshots: (oldId: string, newId: string) =>
    request<CompareResult>(`/api/snapshots/compare?old=${oldId}&new=${newId}`),
};
