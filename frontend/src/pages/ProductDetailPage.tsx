import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo, type ComponentType } from "react";
import { api, type CatalogProduct, type ProductHistoryEntry, type ProductAtSnapshot, type Retailer } from "@/api/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ArrowLeft,
  Package,
  Heart,
  ChevronLeft,
  ChevronRight,
  Tag,
  List,
  Type,
  Gift,
  Plus,
  Trash2,
  Layers,
  Minus,
  TrendingUp,
  TrendingDown,
  GitCompare,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { nl } from "date-fns/locale";
import { useFollowedProducts } from "@/hooks/useFollowedProducts";

const EVENT_LABELS: Record<string, string> = {
  first_seen: "Product toegevoegd aan tracker",
  unchanged: "Ongewijzigd",
  price_change: "Prijswijziging",
  title_change: "Naamswijziging",
  bonus_change: "Bonus wijziging",
  ingredients_change: "Ingrediënten gewijzigd",
  removed: "Uit assortiment",
  returned: "Terug in assortiment",
  multi_change: "Meerdere wijzigingen",
};

/** Split comma-separated ingredients into trimmed, non-empty list. */
function parseIngredients(s: string | null | undefined): string[] {
  if (s == null || String(s).trim() === "") return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Compute added/removed ingredients between old and new comma-separated strings. */
function getIngredientDiff(
  entry: ProductHistoryEntry
): { added: string[]; removed: string[]; summary: string } {
  const c = entry.changes as Record<string, { old?: string; new?: string }> | undefined;
  const ing = c?.ingredients;
  if (!ing) return { added: [], removed: [], summary: "" };
  const oldSet = new Set(parseIngredients(ing.old));
  const newSet = new Set(parseIngredients(ing.new));
  const added = [...newSet].filter((x) => !oldSet.has(x));
  const removed = [...oldSet].filter((x) => !newSet.has(x));
  const parts: string[] = [];
  added.forEach((x) => parts.push(`+ ${x}`));
  removed.forEach((x) => parts.push(`- ${x}`));
  return { added, removed, summary: parts.join(", ") };
}

function formatHistoryDescription(entry: ProductHistoryEntry): string {
  const c = entry.changes as Record<string, { old?: unknown; new?: unknown; pct_change?: number }>;
  if (entry.event_type === "unchanged" || Object.keys(c || {}).length === 0) {
    return "Geen wijzigingen";
  }
  if (entry.event_type === "first_seen") {
    return "Product toegevoegd aan tracker";
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
  if (c.ingredients) {
    const { summary } = getIngredientDiff(entry);
    if (summary) parts.push(summary);
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

function formatDateRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const day = isToday(d) ? "Vandaag" : isYesterday(d) ? "Gisteren" : format(d, "d MMM yyyy", { locale: nl });
    return `${day}, ${format(d, "HH:mm", { locale: nl })}`;
  } catch {
    return formatDate(iso);
  }
}

const EVENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  price_change: Tag,
  ingredients_change: List,
  title_change: Type,
  bonus_change: Gift,
  first_seen: Plus,
  removed: Trash2,
  multi_change: Layers,
  unchanged: Minus,
  returned: Tag,
};

function eventIconColorClass(type: string, entry?: ProductHistoryEntry): string {
  if (type === "price_change" && entry?.changes) {
    const c = entry.changes as Record<string, { new?: number; old?: number }>;
    const p = c?.price;
    if (p && typeof p.old === "number" && typeof p.new === "number") {
      return p.new > p.old ? "text-red-500 bg-red-50" : "text-emerald-600 bg-emerald-50";
    }
  }
  switch (type) {
    case "unchanged":
      return "text-slate-400 bg-slate-100";
    case "price_change":
      return "text-amber-600 bg-amber-50";
    case "title_change":
      return "text-blue-600 bg-blue-50";
    case "removed":
      return "text-red-600 bg-red-50";
    case "first_seen":
      return "text-sky-600 bg-sky-50";
    case "bonus_change":
      return "text-orange-600 bg-orange-50";
    case "multi_change":
      return "text-violet-600 bg-violet-50";
    case "ingredients_change":
      return "text-slate-600 bg-slate-100";
    default:
      return "text-slate-600 bg-slate-100";
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
  const [showCompare, setShowCompare] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<CatalogProduct | null>(null);

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
            <button
              type="button"
              onClick={() => {
                setShowCompare((v) => !v);
                if (!currentVersion && product.id) {
                  api.product(product.id).then(setCurrentVersion).catch(() => {});
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-medium text-amber-900 hover:bg-amber-100 transition-colors"
            >
              <GitCompare className="h-4 w-4" />
              Vergelijk met huidige versie
            </button>
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

      {isVersionMode && showCompare && (
        <Card className="overflow-hidden border-slate-200">
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Toen vs. Nu</h3>
            {currentVersion == null ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                <Skeleton className="h-4 w-4 rounded" />
                Huidige versie laden…
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Toen</p>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-slate-500">Prijs:</span> €{Number(product.price ?? 0).toFixed(2)}</p>
                    <p><span className="text-slate-500">Naam:</span> {product.title || "—"}</p>
                    <p><span className="text-slate-500">Bonus:</span> {product.is_bonus ? "Ja" : "Nee"}</p>
                    {product.ingredients && (
                      <p><span className="text-slate-500">Ingrediënten:</span> <span className="line-clamp-2">{product.ingredients}</span></p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Nu</p>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-slate-500">Prijs:</span>{" "}
                      {Number(product.price ?? 0) !== Number(currentVersion.price ?? 0) ? (
                        <span className={Number(currentVersion.price ?? 0) > Number(product.price ?? 0) ? "text-red-600 font-medium" : "text-emerald-600 font-medium"}>
                          €{Number(currentVersion.price ?? 0).toFixed(2)}
                        </span>
                      ) : (
                        <>€{Number(currentVersion.price ?? 0).toFixed(2)}</>
                      )}
                    </p>
                    <p>
                      <span className="text-slate-500">Naam:</span>{" "}
                      {(product.title ?? "") !== (currentVersion.title ?? "") ? (
                        <span className="font-medium">{currentVersion.title || "—"}</span>
                      ) : (
                        <>{currentVersion.title || "—"}</>
                      )}
                    </p>
                    <p>
                      <span className="text-slate-500">Bonus:</span>{" "}
                      {product.is_bonus !== currentVersion.is_bonus ? (
                        <span className="font-medium">{currentVersion.is_bonus ? "Ja" : "Nee"}</span>
                      ) : (
                        <>{currentVersion.is_bonus ? "Ja" : "Nee"}</>
                      )}
                    </p>
                    {currentVersion.ingredients != null && (
                      <p>
                        <span className="text-slate-500">Ingrediënten:</span>{" "}
                        {(product.ingredients ?? "") !== (currentVersion.ingredients ?? "") ? (
                          <span className="line-clamp-2 font-medium">{currentVersion.ingredients}</span>
                        ) : (
                          <span className="line-clamp-2">{currentVersion.ingredients}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
              <Link
                to={`/supermarket/${product.retailer}`}
                className="inline-flex items-center gap-1.5 mt-1 text-slate-600 hover:text-slate-900 text-sm sm:text-base"
              >
                {productRetailer?.icon && (
                  <img src={productRetailer.icon} alt="" className="h-5 w-5 shrink-0 object-contain" />
                )}
                {retailerName}
              </Link>
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
              {product.ingredients && (
                <details className="mt-3 group" open>
                  <summary className="text-sm font-medium text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
                    Ingrediënten
                  </summary>
                  <p className="text-slate-500 text-sm mt-1.5 leading-relaxed break-words">
                    {product.ingredients}
                  </p>
                </details>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-4">Geschiedenislog</h3>
        <Card>
          <CardContent className="p-4 sm:p-6">
            {displayHistory.length === 0 ? (
              <p className="text-slate-500 text-sm">Nog geen geschiedenis voor dit product.</p>
            ) : (
              <div className="relative">
                {displayHistory.map((entry, idx) => {
                  const hasSnapshot = Boolean(entry.snapshot_id && entry.id !== "_first_seen");
                  const isCurrentVersion = isVersionMode && entry.snapshot_id === snapshotIdParam;
                  const c = entry.changes as Record<string, { old?: unknown; new?: unknown; pct_change?: number }> | undefined;
                  const IconComponent = EVENT_ICONS[entry.event_type] ?? Tag;
                  const iconColorClass = eventIconColorClass(entry.event_type, entry);
                  const isMulti = entry.event_type === "multi_change" && c && Object.keys(c).length > 0;

                  const descriptionBlock = (
                    <div className="min-w-0 flex-1 space-y-1">
                      {entry.event_type === "first_seen" && (
                        <p className="text-sm text-slate-600">Product toegevoegd aan tracker</p>
                      )}
                      {entry.event_type === "removed" && (
                        <p className="text-sm text-slate-600">Uit assortiment gehaald</p>
                      )}
                      {entry.event_type === "unchanged" && (
                        <p className="text-sm text-slate-600">
                          Geen wijzigingen
                          {entry.price_at_snapshot != null && (
                            <> · €{Number(entry.price_at_snapshot).toFixed(2)}</>
                          )}
                        </p>
                      )}
                      {entry.event_type === "price_change" && c?.price && (
                        <p className="text-sm flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-600">€{Number(c.price.old).toFixed(2)} → </span>
                          {Number(c.price.new) > Number(c.price.old) ? (
                            <span className="text-red-600 font-medium inline-flex items-center gap-0.5">
                              €{Number(c.price.new).toFixed(2)}
                              {c.price.pct_change != null && ` (+${c.price.pct_change}%)`}
                              <TrendingUp className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-medium inline-flex items-center gap-0.5">
                              €{Number(c.price.new).toFixed(2)}
                              {c.price.pct_change != null && ` (${c.price.pct_change}%)`}
                              <TrendingDown className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </p>
                      )}
                      {entry.event_type === "ingredients_change" && !isMulti && (() => {
                        const { added, removed, summary } = getIngredientDiff(entry);
                        if (!summary) return <p className="text-sm text-slate-600">Ingrediënten gewijzigd</p>;
                        return (
                          <p className="text-sm break-words">
                            {added.map((x) => (
                              <span key={`+${x}`} className="text-emerald-600 mr-1.5">+ {x}</span>
                            ))}
                            {removed.map((x) => (
                              <span key={`-${x}`} className="text-red-600 mr-1.5">− {x}</span>
                            ))}
                          </p>
                        );
                      })()}
                      {entry.event_type === "title_change" && !isMulti && c?.title && (
                        <p className="text-sm text-slate-600">
                          &apos;{String(c.title.old ?? "—").trim()}&apos; → &apos;{String(c.title.new ?? "—").trim()}&apos;
                        </p>
                      )}
                      {entry.event_type === "bonus_change" && !isMulti && c?.bonus && (
                        <p className="text-sm text-slate-600">
                          {c.bonus.old ? "aan" : "uit"} → {c.bonus.new ? "aan" : "uit"}
                        </p>
                      )}
                      {isMulti && (
                        <div className="space-y-1.5 mt-1">
                          {c?.price && (
                            <p className="text-sm flex flex-wrap items-center gap-1.5">
                              <Tag className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              {Number(c.price.new) > Number(c.price.old) ? (
                                <span className="text-red-600">€{Number(c.price.old).toFixed(2)} → €{Number(c.price.new).toFixed(2)}</span>
                              ) : (
                                <span className="text-emerald-600">€{Number(c.price.old).toFixed(2)} → €{Number(c.price.new).toFixed(2)}</span>
                              )}
                            </p>
                          )}
                          {c?.ingredients && (() => {
                            const { added, removed, summary } = getIngredientDiff(entry);
                            if (!summary) return null;
                            return (
                              <p className="text-sm break-words flex items-start gap-1">
                                <List className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                                <span>
                                  {added.map((x) => (
                                    <span key={`+${x}`} className="text-emerald-600 mr-1.5">+ {x}</span>
                                  ))}
                                  {removed.map((x) => (
                                    <span key={`-${x}`} className="text-red-600 mr-1.5">− {x}</span>
                                  ))}
                                </span>
                              </p>
                            );
                          })()}
                          {c?.title && (
                            <p className="text-sm text-slate-600 flex items-center gap-1">
                              <Type className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              Naam gewijzigd
                            </p>
                          )}
                          {c?.bonus && (
                            <p className="text-sm text-slate-600 flex items-center gap-1">
                              <Gift className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              Bonus gewijzigd
                            </p>
                          )}
                        </div>
                      )}
                      {!["first_seen", "removed", "unchanged", "price_change", "ingredients_change", "title_change", "bonus_change", "multi_change"].includes(entry.event_type) && (
                        <p className="text-sm text-slate-600 break-words">{formatHistoryDescription(entry)}</p>
                      )}
                      {hasSnapshot && (
                        <p className="text-xs text-slate-400 mt-1">
                          <Link
                            to={`/snapshots?snapshot=${entry.snapshot_id}`}
                            className="text-slate-500 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Snapshot
                          </Link>
                          {" · "}
                          <Link
                            to={`/product/${product.id}/versie/${entry.snapshot_id}`}
                            className="font-medium text-slate-600 hover:text-slate-900 hover:underline"
                          >
                            Bekijk snapshot
                          </Link>
                        </p>
                      )}
                    </div>
                  );

                  const labelContent = (
                    <span className="font-medium text-slate-800">
                      {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                    </span>
                  );

                  return (
                    <div
                      key={entry.id}
                      className={`flex gap-3 sm:gap-4 items-start py-3 first:pt-0 ${idx < displayHistory.length - 1 ? "pb-4" : "pb-0"} ${isCurrentVersion ? "rounded-lg bg-slate-100/80 ring-1 ring-slate-200 -mx-2 px-3 py-3 sm:-mx-3 sm:px-4 sm:py-4" : ""} ${hasSnapshot && !isCurrentVersion ? "rounded-lg -mx-2 px-3 sm:-mx-3 sm:px-4 -mb-1 last:mb-0 hover:bg-slate-50/80" : ""}`}
                    >
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`rounded-full p-1.5 ${iconColorClass}`}>
                          <IconComponent className="h-4 w-4" />
                        </div>
                        {idx < displayHistory.length - 1 && (
                          <div className="w-px flex-1 min-h-[0.75rem] mt-2 bg-slate-200" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-xs text-slate-500 mb-0.5">{formatDateRelative(entry.created_at)}</p>
                        {hasSnapshot ? (
                          <Link
                            to={`/product/${product.id}/versie/${entry.snapshot_id}`}
                            className="rounded px-1 -mx-1 hover:bg-slate-100 inline-block transition-colors"
                          >
                            {labelContent}
                          </Link>
                        ) : (
                          labelContent
                        )}
                        {descriptionBlock}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
