import { Link } from "react-router-dom";
import { api, type Product, type Retailer } from "@/api/client";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Search, Heart, ChevronDown, Calendar } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { useFollowedProducts } from "@/hooks/useFollowedProducts";

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

export default function ProductsPage() {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  /** Retailer ids that are enabled in the filter (show products from these). */
  const [retailerFilter, setRetailerFilter] = useState<Record<string, boolean>>({});
  const [supermarketDropdownOpen, setSupermarketDropdownOpen] = useState(false);
  const supermarketDropdownRef = useRef<HTMLDivElement>(null);
  const { isFollowed, toggle } = useFollowedProducts();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (supermarketDropdownRef.current && !supermarketDropdownRef.current.contains(e.target as Node)) {
        setSupermarketDropdownOpen(false);
      }
    }
    if (supermarketDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [supermarketDropdownOpen]);

  useEffect(() => {
    api.retailers()
      .then((list) => {
        setRetailers(list);
        setRetailerFilter((prev) => {
          const next = { ...prev };
          list.filter((r) => r.active).forEach((r) => {
            if (!(r.id in next)) next[r.id] = true;
          });
          return next;
        });
        return list;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (retailers.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const active = retailers.filter((r) => r.active);
    Promise.all(active.map((r) => api.retailerProducts(r.id)))
      .then((arrays) => setProducts(arrays.flat()))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [retailers]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesBrand = brandFilter === "all" || product.brand === brandFilter;
      const matchesRetailer = retailerFilter[product.supermarketId] !== false;
      return matchesSearch && matchesCategory && matchesBrand && matchesRetailer;
    });
  }, [products, search, categoryFilter, brandFilter, retailerFilter]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products]
  );
  const brands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort(),
    [products]
  );

  const retailerById = useMemo(() => {
    const map: Record<string, Retailer> = {};
    retailers.forEach((r) => { map[r.id] = r; });
    return map;
  }, [retailers]);

  const toggleRetailerFilter = (retailerId: string) => {
    setRetailerFilter((prev) => ({ ...prev, [retailerId]: !prev[retailerId] }));
  };

  const activeRetailers = useMemo(
    () => retailers.filter((r) => r.active),
    [retailers]
  );
  const selectedRetailerCount = useMemo(
    () => activeRetailers.filter((r) => retailerFilter[r.id] !== false).length,
    [activeRetailers, retailerFilter]
  );
  const supermarketDropdownLabel =
    selectedRetailerCount === 0
      ? "Geen supermarkten"
      : selectedRetailerCount === activeRetailers.length
        ? "Alle supermarkten"
        : `${selectedRetailerCount} van ${activeRetailers.length} geselecteerd`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Producten</h1>
        <p className="text-slate-500 mt-2">Blader door producten en volg de prijzen die je interessant vindt.</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Zoeken</label>
              <Search className="absolute left-2.5 top-9 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Zoeken..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categorie</label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Alle categorieën</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Merk</label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
              >
                <option value="all">Alle merken</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div ref={supermarketDropdownRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Supermarkten</label>
              <button
                type="button"
                onClick={() => setSupermarketDropdownOpen((open) => !open)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-left ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 hover:bg-slate-50"
                aria-expanded={supermarketDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className="text-slate-700 truncate">{supermarketDropdownLabel}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${supermarketDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>
              {supermarketDropdownOpen && (
                <div
                  className="absolute top-full left-0 right-0 z-10 mt-1 max-h-60 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                  role="listbox"
                >
                  {activeRetailers.map((r) => (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                      role="option"
                      aria-selected={retailerFilter[r.id] !== false}
                    >
                      <input
                        type="checkbox"
                        checked={retailerFilter[r.id] !== false}
                        onChange={() => toggleRetailerFilter(r.id)}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      />
                      {r.icon && (
                        <img src={r.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      )}
                      <span className="text-slate-700">{r.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton text className="w-full" />
                    <Skeleton text className="w-[75%]" />
                    <div className="flex gap-2 flex-wrap">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const productUrl = product.id
                ? `/product/${product.id}`
                : product.webshopId && product.supermarketId
                  ? `/product/ref/${product.supermarketId}/${encodeURIComponent(product.webshopId)}`
                  : null;
              const canFollow = Boolean(product.id);
              const followed = isFollowed(product.id);
              const retailer = retailerById[product.supermarketId];

              const cardContent = (
                <div className="flex gap-3">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-14 w-14 rounded-lg object-cover border border-slate-100 shrink-0"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-sm shrink-0">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {retailer?.icon && (
                        <img
                          src={retailer.icon}
                          alt=""
                          className="h-5 w-5 shrink-0 object-contain"
                          title={retailer.name}
                        />
                      )}
                      <p className="font-medium text-slate-900 line-clamp-2">{product.name}</p>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {product.brand && <span>{product.brand}</span>}
                      {product.brand && product.category && " · "}
                      {product.category && <span>{product.category}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="font-medium text-slate-900">€{(product.price ?? 0).toFixed(2)}</span>
                      {product.unit && <span className="text-slate-500 text-sm">{product.unit}</span>}
                      {product.nutriscore && (
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold text-white ${
                            product.nutriscore === "A"
                              ? "bg-emerald-600"
                              : product.nutriscore === "B"
                                ? "bg-emerald-400"
                                : product.nutriscore === "C"
                                  ? "bg-yellow-400"
                                  : product.nutriscore === "D"
                                    ? "bg-orange-400"
                                    : "bg-red-500"
                          }`}
                        >
                          {product.nutriscore}
                        </span>
                      )}
                      {product.bonus && (
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
              );

              return (
                <Card
                  key={`${product.supermarketId}-${product.webshopId}`}
                  className={`border-slate-200 shadow-sm transition-colors relative ${productUrl ? "hover:border-slate-300" : ""}`}
                >
                  <CardContent className="p-4">
                    {canFollow && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggle(product.id);
                        }}
                        className="absolute top-3 right-3 p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label={followed ? "Niet meer volgen" : "Volgen"}
                      >
                        <Heart
                          className={`h-5 w-5 ${followed ? "fill-red-500 text-red-500" : ""}`}
                        />
                      </button>
                    )}
                    {productUrl ? (
                      <Link to={productUrl} className="block pr-8">
                        {cardContent}
                      </Link>
                    ) : (
                      <div className="pr-8">{cardContent}</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="text-sm text-slate-500">
            Toont {filteredProducts.length} producten
          </div>
        </>
      )}
    </div>
  );
}
