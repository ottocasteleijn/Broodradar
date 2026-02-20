import { useEffect, useState, useMemo, type ReactNode } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, type Snapshot, type Retailer, type CompareResult } from "@/api/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, TrendingUp, TrendingDown, Plus, Minus, RefreshCw, GitCompareArrows } from "lucide-react";

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retailerFilter, setRetailerFilter] = useState("");

  const oldId = searchParams.get("old") || "";
  const newId = searchParams.get("new") || "";

  useEffect(() => {
    api.retailers().then(setRetailers).catch(() => {});
  }, []);

  useEffect(() => {
    api.snapshots(retailerFilter || undefined).then(setSnapshots).catch(() => setSnapshots([]));
  }, [retailerFilter]);

  useEffect(() => {
    if (!oldId || !newId) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.compareSnapshots(oldId, newId)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : "Vergelijking mislukt."))
      .finally(() => setLoading(false));
  }, [oldId, newId]);

  const totalChanges = useMemo(() => {
    if (!result) return 0;
    return result.new_products.length + result.removed_products.length +
      result.price_changes.length + result.bonus_changes.length;
  }, [result]);

  const getSnapshotLabel = (snap: Snapshot) => {
    const retailer = retailers.find(r => r.id === snap.supermarketId);
    const date = new Date(snap.date).toLocaleDateString("nl-NL", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return `${retailer?.name || snap.supermarketId} — ${date} (${snap.productCount} prod.)`;
  };

  const handleCompare = () => {
    const oldSelect = document.getElementById("old-snap") as HTMLSelectElement;
    const newSelect = document.getElementById("new-snap") as HTMLSelectElement;
    if (oldSelect.value && newSelect.value) {
      setSearchParams({ old: oldSelect.value, new: newSelect.value });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Link to="/snapshots" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" /> Terug naar snapshots
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Vergelijken</h1>
        <p className="text-slate-500 mt-2">Vergelijk twee snapshots om wijzigingen te zien.</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-4 items-end">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Supermarkt</label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={retailerFilter}
                onChange={(e) => setRetailerFilter(e.target.value)}
              >
                <option value="">Alle</option>
                {retailers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Oud snapshot</label>
              <select
                id="old-snap"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                defaultValue={oldId}
              >
                <option value="">Selecteer...</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>{getSnapshotLabel(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Nieuw snapshot</label>
              <select
                id="new-snap"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                defaultValue={newId}
              >
                <option value="">Selecteer...</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>{getSnapshotLabel(s)}</option>
                ))}
              </select>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCompare}>
              <GitCompareArrows className="mr-2 h-4 w-4" /> Vergelijken
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && <div className="text-slate-500">Vergelijking laden...</div>}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && !loading && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard
              label="Prijswijzigingen"
              count={result.price_changes.length}
              icon={<RefreshCw className="h-5 w-5" />}
              color="bg-blue-100 text-blue-700"
            />
            <SummaryCard
              label="Nieuwe producten"
              count={result.new_products.length}
              icon={<Plus className="h-5 w-5" />}
              color="bg-emerald-100 text-emerald-700"
            />
            <SummaryCard
              label="Verwijderde producten"
              count={result.removed_products.length}
              icon={<Minus className="h-5 w-5" />}
              color="bg-red-100 text-red-700"
            />
            <SummaryCard
              label="Bonus wijzigingen"
              count={result.bonus_changes.length}
              icon={<RefreshCw className="h-5 w-5" />}
              color="bg-orange-100 text-orange-700"
            />
          </div>

          {totalChanges === 0 && (
            <Card className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <h3 className="text-lg font-semibold text-slate-900">Geen wijzigingen gevonden</h3>
                <p className="text-slate-500 max-w-sm mt-2">
                  De twee geselecteerde snapshots zijn identiek.
                </p>
              </CardContent>
            </Card>
          )}

          {result.price_changes.length > 0 && (
            <ChangeSection title="Prijswijzigingen" badgeColor="bg-blue-100 text-blue-700">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3">Product</th>
                      <th className="px-6 py-3">Oude prijs</th>
                      <th className="px-6 py-3">Nieuwe prijs</th>
                      <th className="px-6 py-3 text-right">Verschil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.price_changes.map((c) => (
                      <tr key={c.product.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            {c.product.image_url ? (
                              <img src={c.product.image_url} alt="" className="h-8 w-8 rounded object-cover border border-slate-100" />
                            ) : (
                              <div className="h-8 w-8 rounded bg-slate-100" />
                            )}
                            <span className="font-medium text-slate-900">{c.product.title}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-slate-500">&euro;{c.old_price.toFixed(2)}</td>
                        <td className="px-6 py-3 font-medium text-slate-900">&euro;{c.new_price.toFixed(2)}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={`inline-flex items-center gap-1 text-sm font-medium ${c.pct_change > 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {c.pct_change > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {c.pct_change > 0 ? "+" : ""}{c.pct_change.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChangeSection>
          )}

          {result.new_products.length > 0 && (
            <ChangeSection title="Nieuwe producten" badgeColor="bg-emerald-100 text-emerald-700">
              <ProductList products={result.new_products} />
            </ChangeSection>
          )}

          {result.removed_products.length > 0 && (
            <ChangeSection title="Verwijderde producten" badgeColor="bg-red-100 text-red-700">
              <ProductList products={result.removed_products} />
            </ChangeSection>
          )}

          {result.bonus_changes.length > 0 && (
            <ChangeSection title="Bonus wijzigingen" badgeColor="bg-orange-100 text-orange-700">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3">Product</th>
                      <th className="px-6 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.bonus_changes.map((c) => (
                      <tr key={c.product.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3 font-medium text-slate-900">{c.product.title}</td>
                        <td className="px-6 py-3 text-right">
                          {c.is_bonus ? (
                            <Badge className="bg-orange-500 text-white border-none">Nu bonus</Badge>
                          ) : (
                            <Badge variant="secondary">Geen bonus meer</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChangeSection>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, count, icon, color }: { label: string; count: number; icon: ReactNode; color: string }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-full p-2.5 ${color}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{count}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangeSection({ title, badgeColor, children }: { title: string; badgeColor: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
        {title}
        <Badge className={`${badgeColor} border-none text-xs`}>{title}</Badge>
      </h2>
      {children}
    </div>
  );
}

function ProductList({ products }: { products: { id: string; title: string; brand: string; price: number; image_url: string | null }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
          <tr>
            <th className="px-6 py-3">Product</th>
            <th className="px-6 py-3">Merk</th>
            <th className="px-6 py-3 text-right">Prijs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50/50">
              <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover border border-slate-100" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-slate-100" />
                  )}
                  <span className="font-medium text-slate-900">{p.title}</span>
                </div>
              </td>
              <td className="px-6 py-3 text-slate-600">{p.brand}</td>
              <td className="px-6 py-3 text-right font-medium text-slate-900">
                {p.price ? `€${Number(p.price).toFixed(2)}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
