import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type Snapshot, type Retailer } from "@/api/client";

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [retailerFilter, setRetailerFilter] = useState("");

  useEffect(() => {
    api.retailers().then(setRetailers).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.snapshots(retailerFilter || undefined)
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [retailerFilter]);

  const getRetailerName = (id: string) =>
    retailers.find((r) => r.id === id)?.name || id;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Snapshot historie</h1>
        <p className="text-slate-500 mt-2">Bekijk en vergelijk historische data snapshots.</p>
      </div>

      <div className="flex gap-4 mb-8">
        <select
          className="flex h-10 w-full sm:w-[200px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          value={retailerFilter}
          onChange={(e) => setRetailerFilter(e.target.value)}
        >
          <option value="">Alle supermarkten</option>
          {retailers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-slate-500">Laden...</div>
      ) : snapshots.length === 0 ? (
        <div className="p-8 text-center text-slate-500 rounded-xl border border-slate-200 bg-slate-50/50">
          Geen snapshots gevonden. Maak een nieuwe snapshot om te beginnen.
        </div>
      ) : (
        <>
          {/* Mobile: snapshot cards */}
          <div className="md:hidden space-y-3">
            {snapshots.map((snap) => (
              <Card key={snap.id} className="border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none mb-2">
                        {getRetailerName(snap.supermarketId)}
                      </Badge>
                      <p className="text-sm text-slate-600">
                        {new Date(snap.date).toLocaleDateString('nl-NL', {
                          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                        {snap.label && ` · ${snap.label}`}
                      </p>
                      <p className="text-sm font-medium text-slate-900 mt-1">{snap.productCount} producten</p>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="shrink-0">
                      <Link to={`/supermarket/${snap.supermarketId}`}>
                        Bekijk <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Supermarkt</th>
                    <th className="px-6 py-4">Datum</th>
                    <th className="px-6 py-4">Producten</th>
                    <th className="px-6 py-4">Label</th>
                    <th className="px-6 py-4 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshots.map((snap) => (
                    <tr key={snap.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none">
                          {getRetailerName(snap.supermarketId)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(snap.date).toLocaleDateString('nl-NL', {
                          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-slate-900 font-medium">{snap.productCount}</td>
                      <td className="px-6 py-4 text-slate-500">{snap.label || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/supermarket/${snap.supermarketId}`}>
                            Bekijk <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
