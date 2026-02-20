import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { History, TrendingUp, Plus, Minus, Percent } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type TimelineEvent, type Retailer } from "@/api/client";

const eventTypeLabels: Record<string, string> = {
  price_change: 'Prijswijziging',
  new_product: 'Nieuw product',
  removed_product: 'Verwijderd product',
  bonus_change: 'Bonus wijziging',
};

const typeFilterMap: Record<string, string> = {
  'Prijswijzigingen': 'price_change',
  'Nieuwe producten': 'new_product',
  'Verwijderde producten': 'removed_product',
  'Bonus wijzigingen': 'bonus_change',
};

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'price_change': return <Percent className="h-4 w-4" />;
    case 'new_product': return <Plus className="h-4 w-4" />;
    case 'removed_product': return <Minus className="h-4 w-4" />;
    case 'bonus_change': return <TrendingUp className="h-4 w-4" />;
    default: return <History className="h-4 w-4" />;
  }
}

function EventBadgeColor(type: string) {
  switch (type) {
    case 'price_change': return 'bg-blue-100 text-blue-700';
    case 'new_product': return 'bg-emerald-100 text-emerald-700';
    case 'removed_product': return 'bg-red-100 text-red-700';
    case 'bonus_change': return 'bg-orange-100 text-orange-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [retailerFilter, setRetailerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    api.retailers().then(setRetailers).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.timeline(retailerFilter || undefined, typeFilter || undefined)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [retailerFilter, typeFilter]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Tijdlijn</h1>
        <p className="text-slate-500 mt-2">Volg wijzigingen in het broodassortiment.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
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
        <select
          className="flex h-10 w-full sm:w-[200px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">Alle wijzigingen</option>
          {Object.entries(typeFilterMap).map(([label, value]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-slate-200 shadow-sm">
              <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
                <div className="flex items-start gap-4 sm:items-center">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex gap-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </div>
                    <Skeleton text className="w-36" />
                  </div>
                </div>
                <Skeleton text className="w-24 sm:ml-auto sm:shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-slate-100 p-4 mb-4">
              <History className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Nog geen wijzigingen</h3>
            <p className="text-slate-500 max-w-sm mt-2">
              Maak minimaal twee snapshots van een supermarkt om wijzigingen te zien.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const retailerName = retailers.find((r) => r.id === event.retailer)?.name || event.retailer;
            const details = event.details as Record<string, unknown>;
            return (
              <Card key={event.id} className="border-slate-200 shadow-sm">
                <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
                  <div className="flex items-start gap-4 sm:items-center">
                    <div className={`rounded-full p-2 shrink-0 ${EventBadgeColor(event.event_type)}`}>
                      <EventIcon type={event.event_type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900 truncate">{event.product_title}</span>
                        <Badge className={`${EventBadgeColor(event.event_type)} border-none text-xs shrink-0`}>
                          {eventTypeLabels[event.event_type] || event.event_type}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-500">
                        {retailerName}
                        {event.event_type === 'price_change' && details.old_price != null && (
                          <span>
                            {' '}· €{Number(details.old_price).toFixed(2)} → €{Number(details.new_price).toFixed(2)}
                            {' '}({Number(details.pct_change) > 0 ? '+' : ''}{Number(details.pct_change).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 sm:ml-auto sm:shrink-0">
                    {new Date(event.created_at).toLocaleDateString('nl-NL', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
