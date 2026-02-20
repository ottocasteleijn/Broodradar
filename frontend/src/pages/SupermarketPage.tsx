import { useParams, Link } from "react-router-dom";
import { api, type Product, type Retailer } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { ArrowLeft, Search, Plus, Download, Loader2 } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";

function exportToCsv(products: Product[], filename: string) {
  const headers = ["Naam", "Merk", "Prijs", "Eenheid", "Nutriscore", "Categorie", "Bonus"];
  const rows = products.map((p) => [
    `"${p.name.replace(/"/g, '""')}"`,
    `"${(p.brand || '').replace(/"/g, '""')}"`,
    p.price.toFixed(2),
    `"${(p.unit || '').replace(/"/g, '""')}"`,
    p.nutriscore || "",
    `"${(p.category || '').replace(/"/g, '""')}"`,
    p.bonus ? "Ja" : "Nee",
  ]);
  const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SupermarketPage() {
  const { id } = useParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [nutriFilter, setNutriFilter] = useState("all");
  const [bonusFilter, setBonusFilter] = useState("all");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.retailerProducts(id),
      api.retailers().then((r) => r.find((x) => x.id === id) || null),
    ])
      .then(([prods, ret]) => {
        setProducts(prods);
        setRetailer(ret);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesBrand = brandFilter === "all" || product.brand === brandFilter;
      const matchesNutri = nutriFilter === "all" || product.nutriscore === nutriFilter;
      const matchesBonus = bonusFilter === "all" || (bonusFilter === "bonus" ? product.bonus : !product.bonus);
      return matchesSearch && matchesCategory && matchesBrand && matchesNutri && matchesBonus;
    });
  }, [products, search, categoryFilter, brandFilter, nutriFilter, bonusFilter]);

  const categories = useMemo(() =>
    Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products]
  );
  const brands = useMemo(() =>
    Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort(),
    [products]
  );
  const nutriscores = useMemo(() =>
    Array.from(new Set(products.map((p) => p.nutriscore).filter(Boolean))).sort(),
    [products]
  );

  const handleNewSnapshot = async () => {
    if (!id) return;
    setSnapshotLoading(true);
    setSnapshotMsg(null);
    try {
      const result = await api.createSnapshot(id);
      setSnapshotMsg({ type: 'success', text: `Snapshot aangemaakt met ${result.product_count} producten.` });
      const prods = await api.retailerProducts(id);
      setProducts(prods);
    } catch (e) {
      setSnapshotMsg({ type: 'error', text: e instanceof Error ? e.message : 'Fout bij aanmaken snapshot.' });
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleExport = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    exportToCsv(filteredProducts, `${retailer?.name || "producten"}-${date}.csv`);
  }, [filteredProducts, retailer]);

  if (loading) {
    return <div className="text-slate-500">Producten laden...</div>;
  }

  if (!retailer) {
    return <div>Supermarkt niet gevonden</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" /> Terug naar Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{retailer.name}</h1>
          <p className="text-slate-500 mt-1">
            {products.length} producten
            {retailer.lastUpdate && ` · Laatste snapshot: ${new Date(retailer.lastUpdate).toLocaleDateString('nl-NL')}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={filteredProducts.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Exporteer CSV
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleNewSnapshot}
            disabled={snapshotLoading || !retailer.active}
          >
            {snapshotLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bezig...</>
            ) : (
              <><Plus className="mr-2 h-4 w-4" /> Nieuwe Snapshot</>
            )}
          </Button>
        </div>
      </div>

      {snapshotMsg && (
        <div className={`rounded-md px-4 py-3 text-sm ${
          snapshotMsg.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {snapshotMsg.text}
        </div>
      )}

      {/* Filters */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Zoeken..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">Alle Categorieën</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
            >
              <option value="all">Alle Merken</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              value={nutriFilter}
              onChange={(e) => setNutriFilter(e.target.value)}
            >
              <option value="all">Alle Nutriscores</option>
              {nutriscores.map((n) => (
                <option key={n} value={n as string}>{n}</option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              value={bonusFilter}
              onChange={(e) => setBonusFilter(e.target.value)}
            >
              <option value="all">Bonus & Regulier</option>
              <option value="bonus">Alleen Bonus</option>
              <option value="regular">Alleen Regulier</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Mobile: product cards */}
      <div className="md:hidden space-y-3">
        {filteredProducts.map((product) => (
          <Card key={product.id} className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex gap-3">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-12 w-12 rounded-md object-cover border border-slate-100 shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0">
                    —
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {product.catalogId ? (
                    <Link to={`/product/${product.catalogId}`} className="font-medium text-slate-900 truncate hover:underline block">
                      {product.name}
                    </Link>
                  ) : (
                    <p className="font-medium text-slate-900 truncate">{product.name}</p>
                  )}
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
                          product.nutriscore === 'A' ? 'bg-emerald-600' :
                          product.nutriscore === 'B' ? 'bg-emerald-400' :
                          product.nutriscore === 'C' ? 'bg-yellow-400' :
                          product.nutriscore === 'D' ? 'bg-orange-400' :
                          'bg-red-500'
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
            </CardContent>
          </Card>
        ))}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 rounded-b-xl">
          Toont {filteredProducts.length} producten
        </div>
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Merk</th>
                <th className="px-6 py-4">Prijs</th>
                <th className="px-6 py-4">Eenheid</th>
                <th className="px-6 py-4">Nutriscore</th>
                <th className="px-6 py-4">Categorie</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-10 w-10 rounded-md object-cover border border-slate-100"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                          —
                        </div>
                      )}
                      {product.catalogId ? (
                        <Link to={`/product/${product.catalogId}`} className="font-medium text-slate-900 hover:underline">
                          {product.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{product.name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{product.brand}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">€{(product.price ?? 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-slate-500">{product.unit}</td>
                  <td className="px-6 py-4">
                    {product.nutriscore && (
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold text-white ${
                          product.nutriscore === 'A' ? 'bg-emerald-600' :
                          product.nutriscore === 'B' ? 'bg-emerald-400' :
                          product.nutriscore === 'C' ? 'bg-yellow-400' :
                          product.nutriscore === 'D' ? 'bg-orange-400' :
                          'bg-red-500'
                        }`}
                      >
                        {product.nutriscore}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{product.category}</td>
                  <td className="px-6 py-4 text-right">
                    {product.bonus && (
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-none">
                        Bonus
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
          <span>Toont {filteredProducts.length} producten</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>Vorige</Button>
            <Button variant="outline" size="sm" disabled>Volgende</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
