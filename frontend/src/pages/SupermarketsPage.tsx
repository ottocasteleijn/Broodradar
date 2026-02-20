import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Link } from "react-router-dom";
import { ArrowRight, ShoppingCart, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Retailer } from "@/api/client";
import { Skeleton } from "@/components/ui/Skeleton";

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function SupermarketsPage() {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.retailers()
      .then(setRetailers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Supermarkten</h1>
            <p className="text-slate-500 mt-2">Overzicht van supermarkt assortimenten en prijzen.</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-full border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </CardHeader>
              <CardContent>
                <div className="mt-4 space-y-4">
                  <div className="flex justify-between">
                    <Skeleton text className="w-24" />
                    <Skeleton text className="w-8" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton text className="w-28" />
                    <Skeleton text className="w-24" />
                  </div>
                </div>
                <div className="mt-6">
                  <Skeleton text className="w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Supermarkten</h1>
          <p className="text-slate-500 mt-2">Overzicht van supermarkt assortimenten en prijzen.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {retailers.map((market) => (
          <Link key={market.id} to={`/supermarket/${market.id}`} className="block group">
            <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-blue-200 border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {market.icon && (
                    <img src={market.icon} alt="" className="h-8 w-8 shrink-0 object-contain" />
                  )}
                  <CardTitle className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                    {market.name}
                  </CardTitle>
                </div>
                {market.active ? (
                  <Badge variant="success" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                    Actief
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-500">
                    Binnenkort
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-slate-500">
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Producten
                    </div>
                    <span className="font-medium text-slate-900">
                      {market.productCount !== null ? market.productCount : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-slate-500">
                      <Clock className="mr-2 h-4 w-4" />
                      Laatste update
                    </div>
                    <span className="font-medium text-slate-900">
                      {formatDate(market.lastUpdate)}
                    </span>
                  </div>
                </div>

                {market.active && (
                  <div className="mt-6 flex items-center text-sm font-medium text-blue-600 group-hover:translate-x-1 transition-transform">
                    Bekijk details <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
