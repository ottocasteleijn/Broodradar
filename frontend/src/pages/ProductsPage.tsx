import { Link } from "react-router-dom";
import { api, type Product, type Retailer } from "@/api/client";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Search, Heart } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useFollowedProducts } from "@/hooks/useFollowedProducts";

export default function ProductsPage() {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const { isFollowed, toggle } = useFollowedProducts();

  useEffect(() => {
    api.retailers().then(setRetailers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSlug) {
      setProducts([]);
      return;
    }
    setLoading(true);
    api.retailerProducts(selectedSlug)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [selectedSlug]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesBrand = brandFilter === "all" || product.brand === brandFilter;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [products, search, categoryFilter, brandFilter]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products]
  );
  const brands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort(),
    [products]
  );

  const selectedRetailer = retailers.find((r) => r.id === selectedSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Producten</h1>
        <p className="text-slate-500 mt-2">Blader door producten en volg de prijzen die je interessant vindt.</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supermarkt</label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
              >
                <option value="">Kies een supermarkt</option>
                {retailers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {selectedSlug && (
              <>
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
                <select
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 mt-6"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">Alle categorieën</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 mt-6"
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                >
                  <option value="all">Alle merken</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedSlug && (
        <div className="p-8 text-center text-slate-500 rounded-xl border border-slate-200 bg-slate-50/50">
          Kies een supermarkt om producten te bekijken.
        </div>
      )}

      {selectedSlug && loading && (
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

      {selectedSlug && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const productUrl = product.catalogId
                ? `/product/${product.catalogId}`
                : product.webshopId && selectedSlug
                  ? `/product/ref/${selectedSlug}/${encodeURIComponent(product.webshopId)}`
                  : null;
              const canFollow = Boolean(product.catalogId);
              const followed = isFollowed(product.catalogId);

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
                    <p className="font-medium text-slate-900 line-clamp-2">{product.name}</p>
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
                  </div>
                </div>
              );

              return (
                <Card
                  key={product.id}
                  className={`border-slate-200 shadow-sm transition-colors relative ${productUrl ? "hover:border-slate-300" : ""}`}
                >
                  <CardContent className="p-4">
                    {canFollow && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggle(product.catalogId);
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
            {selectedRetailer && ` van ${selectedRetailer.name}`}
          </div>
        </>
      )}
    </div>
  );
}
