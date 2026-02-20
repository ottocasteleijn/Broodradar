import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { api, type CatalogProduct, type ProductHistoryEntry, type ProductAtSnapshot, type Retailer } from "@/api/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowLeft, Package, Calendar, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { useFollowedProducts } from "@/hooks/useFollowedProducts";

const EVENT_LABELS: Record<string, string> = {
  first_seen: "Eerste keer gezien",
  unchanged: "Ongewijzigd",
  price_change: "Prijswijziging",
  title_change: "Naamswijziging",
  bonus_change: "Bonus wijziging",
  removed: "Uit assortiment",
  returned: "Terug in assortiment",
  multi_change: "Meerdere wijzigingen",
};

function eventBadgeClass(type: string): string {
  switch (type) {
    case "unchanged":
      return "bg-emerald-100 text-emerald-700";
    case "price_change":
      return "bg-amber-100 text-amber-700";
    case "title_change":
      return "bg-blue-100 text-blue-700";
    case "removed":
      return "bg-red-100 text-red-700";
    case "first_seen":
      return "bg-sky-100 text-sky-700";
    case "bonus_change":
      return "bg-orange-100 text-orange-700";
    case "multi_change":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatHistoryDescription(entry: ProductHistoryEntry): string {
  const c = entry.changes as Record<string, { old?: unknown; new?: unknown; pct_change?: number }>;
  if (entry.event_type === "unchanged" || Object.keys(c || {}).length === 0) {
    return "Geen wijzigingen";
  }
  if (entry.event_type === "first_seen") {
    return "Eerste keer in assortiment";
  }
  if (entry.event_type === "removed") {
    return "Uit assortiment gehaald";
  }
  const parts: string[] = [];
  if (c.price) {
    const oldP = Number(c.price.old);
    const newP = Number(c.price.new);
    const pct = c.price.pct_change;
    const pctStr = pct != null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : "";
    parts.push(`Prijs: €${oldP.toFixed(2)} → €${newP.toFixed(2)}${pctStr}`);
  }
  if (c.title) {
    const oldT = String(c.title.old ?? "").trim() || "—";
    const newT = String(c.title.new ?? "").trim() || "—";
    parts.push(`Naam: '${oldT}' → '${newT}'`);
  }
  if (c.bonus) {
    const oldB = c.bonus.old ? "aan" : "uit";
    const newB = c.bonus.new ? "aan" : "uit";
    parts.push(`Bonus: ${oldB} → ${newB}`);
  }
  return parts.length ? parts.join(" · ") : "Wijziging";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function ProductDetailPage() {
  const { id, snapshotId: snapshotIdParam, retailer: retailerParam, webshopId: webshopIdParam } = useParams<{
    id?: string;
    snapshotId?: string;
    retailer?: string;
    webshopId?: string;
  }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [history, setHistory] = useState<ProductHistoryEntry[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [versionMeta, setVersionMeta] = useState<ProductAtSnapshot["snapshot"] | null>(null);
  const [adjacent, setAdjacent] = useState<ProductAtSnapshot["adjacent"] | null>(null);
  const [versionIndex, setVersionIndex] = useState<number | null>(null);
  const [versionCount, setVersionCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isFollowed, toggle } = useFollowedProducts();
  const isVersionMode = Boolean(snapshotIdParam && id);

  useEffect(() => {
    const byRef = retailerParam != null && webshopIdParam != null;
    const refRetailer = byRef ? retailerParam : null;
    const refWebshopId = byRef ? decodeURIComponent(webshopIdParam) : null;
    if (!id && !byRef) return;
    setLoading(true);
    setError(null);
    setVersionMeta(null);
    setAdjacent(null);
    setVersionIndex(null);
    setVersionCount(0);

    const loadCatalogId = byRef && refRetailer && refWebshopId
      ? api.productByRef(refRetailer, refWebshopId).then((p) => p.id)
      : id
        ? Promise.resolve(id)
        : Promise.reject<string>(new Error("Geen id"));

    if (isVersionMode && id && snapshotIdParam) {
      Promise.all([
        api.productAtSnapshot(id, snapshotIdParam),
        api.retailers(),
      ])
        .then(([data, r]) => {
          setProduct(data.product);
          setVersionMeta(data.snapshot);
          setAdjacent(data.adjacent);
          setVersionIndex(data.version_index);
          setVersionCount(data.version_count);
          setRetailers(r);
          return api.productHistory(id, 50);
        })
        .then((h) => setHistory(h))
        .catch(() => setError("Product niet gevonden in dit snapshot"))
        .finally(() => setLoading(false));
      return;
    }

    loadCatalogId
      .then((catalogId) =>
        Promise.all([
          byRef && refRetailer && refWebshopId
            ? api.productByRef(refRetailer, refWebshopId)
            : api.product(catalogId),
          api.productHistory(catalogId, 50),
          api.retailers(),
        ])
      )
      .then(([p, h, r]) => {
        setProduct(p);
        setHistory(h);
        setRetailers(r);
      })
      .catch(() => setError("Product niet gevonden"))
      .finally(() => setLoading(false));
  }, [id, snapshotIdParam, retailerParam, webshopIdParam, isVersionMode]);

  const displayHistory = useMemo(() => {
    if (!product) return history;
    const hasFirstSeen = history.some((e) => e.event_type === "first_seen");
    if (hasFirstSeen || !product.first_seen_at) return history;
    const synthetic: ProductHistoryEntry = {
      id: "_first_seen",
      product_id: product.id,
      snapshot_id: "",
      event_type: "first_seen",
      changes: {},
      price_at_snapshot: product.price != null ? Number(product.price) : null,
      created_at: product.first_seen_at,
    };
    const combined = [...history, synthetic];
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return combined;
  }, [history, product]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton text className="w-40 mb-2" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
              <Skeleton className="h-28 w-28 sm:h-32 sm:w-32 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-6 w-full max-w-sm" />
                <Skeleton text className="w-24" />
                <div className="flex gap-2 flex-wrap">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
                <div className="flex gap-2">
                  <Skeleton text className="w-36" />
                  <Skeleton text className="w-40" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div>
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 sm:gap-4 pb-4">
                <Skeleton className="h-5 w-24 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton text className="w-full" />
                  <Skeleton text className="w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (error || !product) {
    return (
      <div className="text-slate-600">
        {error || "Product niet gevonden."}
        <Link to="/" className="block mt-2 text-slate-900 underline">Terug naar dashboard</Link>
      </div>
    );
  }

  const productRetailer = retailers.find((r) => r.id === product.retailer);
  const retailerName = productRetailer?.name ?? product.retailer;
  const price = product.price != null ? Number(product.price) : null;
  const nutri = product.nutriscore && /^[A-E]$/i.test(product.nutriscore) ? product.nutriscore.toUpperCase() : null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/"
          className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Terug naar Dashboard
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Productdetail
        </h1>
      </div>

      {isVersionMode && versionMeta && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-2">
            Je bekijkt dit product zoals het was op {versionMeta.created_at ? formatDate(versionMeta.created_at) : "dit moment"}.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/product/${product.id}`}
              className="font-medium text-amber-800 hover:underline"
            >
              Bekijk huidige versie →
            </Link>
            {(adjacent?.newer_snapshot_id != null || adjacent?.older_snapshot_id != null) && (
              <span className="flex items-center gap-2 text-amber-700">
                {adjacent?.newer_snapshot_id != null ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/product/${product.id}/versie/${adjacent.newer_snapshot_id}`)}
                    className="inline-flex items-center gap-0.5 rounded p-1 hover:bg-amber-100"
                    title="Nieuwere versie"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="w-6" />
                )}
                {versionIndex != null && versionCount > 0 && (
                  <span className="tabular-nums">
                    Versie {versionIndex} van {versionCount}
                  </span>
                )}
                {adjacent?.older_snapshot_id != null ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/product/${product.id}/versie/${adjacent.older_snapshot_id}`)}
                    className="inline-flex items-center gap-0.5 rounded p-1 hover:bg-amber-100"
                    title="Oudere versie"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="w-6" />
                )}
              </span>
            )}
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
            <div className="shrink-0 flex justify-center sm:justify-start">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.title ?? "Product"}
                  className="h-28 w-28 sm:h-32 sm:w-32 rounded-lg object-cover border border-slate-200"
                />
              ) : (
                <div className="h-28 w-28 sm:h-32 sm:w-32 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                  <Package className="h-10 w-10 sm:h-12 sm:w-12" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900 break-words">
                  {product.title || "—"}
                </h2>
                {!isVersionMode && (
                  <button
                    type="button"
                    onClick={() => toggle(product.id)}
                    className={isFollowed(product.id)
                      ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                    }
                  >
                    <Heart className={`h-4 w-4 ${isFollowed(product.id) ? "fill-red-500" : ""}`} />
                    {isFollowed(product.id) ? "Volgend" : "Volgen"}
                  </button>
                )}
              </div>
              {product.brand && (
                <p className="text-slate-600 mt-1 text-sm sm:text-base">{product.brand}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {price != null && (
                  <span className="font-medium text-slate-900">
                    €{price.toFixed(2)}
                  </span>
                )}
                {product.sales_unit_size && (
                  <span className="text-slate-500 text-sm">
                    {product.sales_unit_size}
                  </span>
                )}
                {nutri && (
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded text-xs sm:text-sm font-bold text-white shrink-0 ${
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
              {(product.sub_category || product.main_category) && (
                <p className="text-slate-500 text-sm mt-2 break-words">
                  {[product.main_category, product.sub_category].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mt-4 text-sm text-slate-500">
                <span className="flex items-center gap-1 min-w-0">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="truncate">Eerst gezien: {formatDate(product.first_seen_at)}</span>
                </span>
                <span className="flex items-center gap-1 min-w-0">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="truncate">Laatst gezien: {formatDate(product.last_seen_at)}</span>
                </span>
                <Link
                  to={`/supermarket/${product.retailer}`}
                  className="inline-flex items-center gap-1.5 text-slate-900 hover:underline"
                >
                  {productRetailer?.icon && (
                    <img src={productRetailer.icon} alt="" className="h-5 w-5 shrink-0 object-contain" />
                  )}
                  {retailerName}
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-4">Geschiedenislog</h3>
        <div className="relative space-y-0">
          {displayHistory.length === 0 ? (
            <p className="text-slate-500 text-sm">Nog geen geschiedenis voor dit product.</p>
          ) : (
            displayHistory.map((entry, idx) => {
              const hasSnapshot = Boolean(entry.snapshot_id && entry.id !== "_first_seen");
              const isCurrentVersion = isVersionMode && entry.snapshot_id === snapshotIdParam;
              const entryContent = (
                <>
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className={`rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium whitespace-nowrap ${eventBadgeClass(entry.event_type)}`}
                    >
                      {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                    </div>
                    {idx < displayHistory.length - 1 && (
                      <div className="w-px flex-1 min-h-[1rem] mt-2 bg-slate-200" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5 overflow-hidden">
                    <p className="text-sm text-slate-600 break-words">
                      {formatHistoryDescription(entry)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 break-words">
                      {formatDate(entry.created_at)}
                      {hasSnapshot && (
                        <>
                          {" · "}
                          <Link
                            to={`/snapshots?snapshot=${entry.snapshot_id}`}
                            className="text-slate-500 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Snapshot
                          </Link>
                        </>
                      )}
                    </p>
                    {entry.price_at_snapshot != null && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Prijs bij snapshot: €{Number(entry.price_at_snapshot).toFixed(2)}
                      </p>
                    )}
                  </div>
                </>
              );
              return (
                <div
                  key={entry.id}
                  className={`flex gap-3 sm:gap-4 pb-4 sm:pb-6 last:pb-0 ${isCurrentVersion ? "rounded-lg bg-slate-100 ring-1 ring-slate-200 -mx-1 px-3 py-2" : ""} ${hasSnapshot && !isCurrentVersion ? "cursor-pointer hover:bg-slate-50 rounded-lg -mx-1 px-3 py-2" : ""}`}
                >
                  {hasSnapshot ? (
                    <Link
                      to={`/product/${product.id}/versie/${entry.snapshot_id}`}
                      className="flex gap-3 sm:gap-4 min-w-0 flex-1 items-start no-underline text-inherit"
                    >
                      {entryContent}
                    </Link>
                  ) : (
                    entryContent
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
