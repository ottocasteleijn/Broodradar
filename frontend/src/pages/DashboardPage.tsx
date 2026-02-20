import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Link } from "react-router-dom";
import { ShoppingBag, Heart, ArrowRight, TrendingDown, TrendingUp, Calendar } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { api, type CatalogProduct, type ProductHistoryEntry, type RecentChange, type Retailer } from "@/api/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { useFollowedProducts } from "@/hooks/useFollowedProducts";

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

const EVENT_LABELS: Record<string, string> = {
  first_seen: "Nieuw",
  price_change: "Prijswijziging",
  title_change: "Naam gewijzigd",
  bonus_change: "Bonus gewijzigd",
  ingredients_change: "Ingredienten gewijzigd",
  removed: "Uit assortiment",
  multi_change: "Wijziging",
};

export default function DashboardPage() {
  const { followedIds, unfollow } = useFollowedProducts();
  const [products, setProducts] = useState<(CatalogProduct | null)[]>([]);
  const [histories, setHistories] = useState<Record<string, ProductHistoryEntry | null>>({});
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChanges, setLoadingChanges] = useState(true);

  useEffect(() => {
    api.retailers().then(setRetailers).catch(() => {});
  }, []);

  useEffect(() => {
    api.recentChanges(50).then(setRecentChanges).finally(() => setLoadingChanges(false));
  }, []);

  useEffect(() => {
    if (followedIds.length === 0) {
      setProducts([]);
      setHistories({});
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      followedIds.map((id) =>
        Promise.all([
          api.product(id).catch(() => null),
          api.productHistory(id, 1).then((h) => (h.length > 0 ? h[0] : null)).catch(() => null),
        ])
      )
    ).then((results) => {
      setProducts(results.map(([p]) => p));
      const byId: Record<string, ProductHistoryEntry | null> = {};
      followedIds.forEach((id, i) => {
        byId[id] = results[i][1];
      });
      setHistories(byId);
    }).finally(() => setLoading(false));
  }, [followedIds.join(",")]);

  const followedProducts = useMemo(
    () => products.filter((p): p is CatalogProduct => p != null),
    [products]
  );

  const RECENT_DAYS = 14;
  const changesList = useMemo(() => {
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    return recentChanges
      .filter((item) => new Date(item.created_at).getTime() >= cutoff)
      .map((item) => ({ product: item.product, entry: { id: item.id, product_id: item.product_id, snapshot_id: item.snapshot_id, event_type: item.event_type, changes: item.changes, price_at_snapshot: item.price_at_snapshot, created_at: item.created_at } }));
  }, [recentChanges]);

  const getRetailer = (retailerId: string) => retailers.find((r) => r.id === retailerId);

  if (loading && followedIds.length > 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-2">Jouw gevolgde producten en recente wijzigingen.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton text className="w-full" />
                    <Skeleton text className="w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-2">Jouw gevolgde producten en recente wijzigingen.</p>
      </div>

      {/* Sectie 1: Mijn producten */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Mijn producten</h2>
        {followedIds.length === 0 ? (
          <Card className="border-slate-200 border-dashed bg-slate-50/50">
            <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-slate-200/80 p-4 mb-4">
                <ShoppingBag className="h-10 w-10 text-slate-500" />
              </div>
              <p className="text-slate-700 font-medium text-lg">Zet hier de producten die je wilt volgen</p>
              <p className="text-slate-500 mt-2 max-w-sm">
                Ga naar Producten of een supermarkt, en klik op het hartje bij een product om het op je dashboard te zetten.
              </p>
              <Link
                to="/producten"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Naar Producten <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {followedProducts.map((product) => {
              const retailer = getRetailer(product.retailer);
              const nutri = product.nutriscore && /^[A-E]$/i.test(product.nutriscore) ? product.nutriscore.toUpperCase() : null;
              return (
                <Card key={product.id} className="border-slate-200 shadow-sm relative">
                  <CardContent className="p-4">
                    <button
                      type="button"
                      onClick={() => unfollow(product.id)}
                      className="absolute top-3 right-3 p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                      aria-label="Niet meer volgen"
                    >
                      <Heart className="h-5 w-5 fill-red-500" />
                    </button>
                    <Link to={`/product/${product.id}`} className="block pr-8">
                      <div className="flex gap-3">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.title ?? ""}
                            className="h-14 w-14 rounded-lg object-cover border border-slate-100 shrink-0"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-sm shrink-0">
                            —
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 line-clamp-2">{product.title || "—"}</p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {product.brand && <span>{product.brand}</span>}
                            {retailer && (
                              <span className="flex items-center gap-1 mt-1">
                                {retailer.icon && (
                                  <img src={retailer.icon} alt="" className="h-4 w-4 object-contain" />
                                )}
                                {retailer.name}
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {product.price != null && (
                              <span className="font-medium text-slate-900">
                                €{Number(product.price).toFixed(2)}
                              </span>
                            )}
                            {product.sales_unit_size && (
                              <span className="text-slate-500 text-sm">{product.sales_unit_size}</span>
                            )}
                            {nutri && (
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold text-white ${
                                  nutri === "A"
                                    ? "bg-emerald-600"
                                    : nutri === "B"
                                      ? "bg-emerald-400"
                                      : nutri === "C"
                                        ? "bg-yellow-400"
                                        : nutri === "D"
                                          ? "bg-orange-400"
                                          : "bg-red-500"
                                }`}
                              >
                                {nutri}
                              </span>
                            )}
                            {product.is_bonus && (
                              <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-none">
                                Bonus
                              </Badge>
                            )}
                          </div>
                          {product.first_seen_at && (
                            <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              Eerste keer gespot: {formatShortDate(product.first_seen_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Sectie 2: Recente wijzigingen */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recente wijzigingen</h2>
        {loadingChanges ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton text className="w-full" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : changesList.length === 0 ? (
          <p className="text-slate-500 text-sm">Geen recente wijzigingen in de afgelopen 14 dagen.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {changesList.map(({ product, entry }) => {
              const retailer = getRetailer(product.retailer);
              const changes = (entry.changes || {}) as Record<string, { old?: number; new?: number; pct_change?: number }>;
              const priceChange = changes.price;
              return (
                <Card key={entry.id} className="border-slate-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title ?? ""}
                          className="h-12 w-12 rounded-lg object-cover border border-slate-100 shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-slate-100 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 line-clamp-1">{product.title || "—"}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                          </span>
                          {priceChange && priceChange.old != null && priceChange.new != null && (
                            <span className="text-sm text-slate-600 flex items-center gap-0.5">
                              €{Number(priceChange.old).toFixed(2)}
                              {Number(priceChange.new) > Number(priceChange.old) ? (
                                <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                              ) : (
                                <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                              )}
                              €{Number(priceChange.new).toFixed(2)}
                            </span>
                          )}
                        </div>
                        {retailer && (
                          <span className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                          {retailer.icon && <img src={retailer.icon} alt="" className="h-3.5 w-3.5" />}
                          {retailer.name}
                        </span>
                        )}
                        <Link
                          to={`/product/${product.id}`}
                          className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                        >
                          Bekijk product
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
