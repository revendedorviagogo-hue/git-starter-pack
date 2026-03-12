import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, parseBrowser, parseOS } from "@/lib/adminUtils";
import {
  Globe,
  Clock,
  Search,
  Monitor,
  Smartphone,
  MapPin,
  ArrowUpDown,
  RefreshCw,
  Eye,
  Users,
  Filter,
} from "lucide-react";

interface VisitRecord {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  page_path: string | null;
  referrer: string | null;
  country: string | null;
  city: string | null;
  source: string | null;
  created_at: string;
}

type SortField = "created_at" | "ip_address" | "country";
type SortDir = "asc" | "desc";

const AdminLogs = ({ operatorCode, sourceFilter }: { operatorCode?: string; sourceFilter?: string }) => {
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCountry, setFilterCountry] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [uniqueIPs, setUniqueIPs] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const PAGE_SIZE = 50;

  const todayStart = useCallback(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }, []);

  const fetchVisits = useCallback(async () => {
    setLoading(true);

    // Helper: add operator filter to a query
    const applyOperatorFilter = (q: any) => {
      if (operatorCode) {
        return q.or(`page_path.ilike.%/${operatorCode}%,page_path.ilike.%/${operatorCode}`);
      }
      if (sourceFilter === "cocosv2") {
        return q.in("source", ["cocosdigital", "cocosv2", "cocos"]);
      }
      if (sourceFilter) {
        return q.eq("source", sourceFilter);
      }
      return q;
    };

    // Fetch stats in parallel
    const [
      { count: total },
      { count: today },
    ] = await Promise.all([
      applyOperatorFilter(supabase.from("page_visits").select("*", { count: "exact", head: true })),
      applyOperatorFilter(supabase.from("page_visits").select("*", { count: "exact", head: true }).gte("created_at", todayStart())),
    ]);

    setTotalCount(total || 0);
    setTodayCount(today || 0);

    // Fetch unique IPs (paginated)
    let allIPs: string[] = [];
    let ipPage = 0;
    let hasMore = true;
    while (hasMore) {
      let ipQuery = supabase
        .from("page_visits")
        .select("ip_address")
        .range(ipPage * 1000, (ipPage + 1) * 1000 - 1);
      ipQuery = applyOperatorFilter(ipQuery);
      const { data: ipBatch } = await ipQuery;
      if (ipBatch && ipBatch.length > 0) {
        allIPs = allIPs.concat(ipBatch.map((v) => v.ip_address).filter(Boolean) as string[]);
        hasMore = ipBatch.length === 1000;
        ipPage++;
      } else {
        hasMore = false;
      }
    }
    setUniqueIPs(new Set(allIPs).size);

    // Fetch visits page
    let query = supabase
      .from("page_visits")
      .select("*")
      .order(sortField, { ascending: sortDir === "asc" })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    query = applyOperatorFilter(query);

    if (filterCountry) {
      query = query.ilike("country", `%${filterCountry}%`);
    }

    const { data } = await query;
    if (data) setVisits(data as VisitRecord[]);
    setLoading(false);
  }, [sortField, sortDir, page, filterCountry, todayStart, operatorCode, sourceFilter]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  // Realtime new visits
  useEffect(() => {
    const channel = supabase
      .channel("admin-logs-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "page_visits" }, (payload) => {
        const newVisit = payload.new as VisitRecord;
        if (page === 0 && sortField === "created_at" && sortDir === "desc") {
          setVisits((prev) => [newVisit, ...prev].slice(0, PAGE_SIZE));
        }
        setTotalCount((c) => c + 1);
        setTodayCount((c) => c + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [page, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  };

  const filtered = search
    ? visits.filter((v) =>
        [v.ip_address, v.country, v.city, v.user_agent, v.page_path, v.referrer]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : visits;

  // Get unique countries from current data for filter
  const countries = [...new Set(visits.map((v) => v.country).filter(Boolean))] as string[];

  const timeSince = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s atrás`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m atrás`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
  };

  const getDeviceIcon = (ua: string | null) => {
    if (!ua) return <Monitor size={12} className="text-muted-foreground" />;
    if (ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone")) {
      return <Smartphone size={12} className="text-blue-400" />;
    }
    return <Monitor size={12} className="text-muted-foreground" />;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Eye size={16} />} value={totalCount} label="Total de Visitas" color="text-primary" />
        <StatCard icon={<Clock size={16} />} value={todayCount} label="Visitas Hoje" color="text-green-400" />
        <StatCard icon={<Users size={16} />} value={uniqueIPs} label="IPs Únicos" color="text-blue-400" />
        <StatCard icon={<Globe size={16} />} value={countries.length} label="Países" color="text-amber-400" />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por IP, país, cidade..."
            className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Country filter */}
        <div className="relative">
          <Filter size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filterCountry}
            onChange={(e) => {
              setFilterCountry(e.target.value);
              setPage(0);
            }}
            placeholder="Filtrar país..."
            className="rounded-lg border border-border bg-card pl-8 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-36"
          />
        </div>

        {/* Sort buttons */}
        <div className="flex items-center gap-1">
          <SortButton
            label="Data"
            active={sortField === "created_at"}
            dir={sortField === "created_at" ? sortDir : undefined}
            onClick={() => toggleSort("created_at")}
          />
          <SortButton
            label="IP"
            active={sortField === "ip_address"}
            dir={sortField === "ip_address" ? sortDir : undefined}
            onClick={() => toggleSort("ip_address")}
          />
          <SortButton
            label="País"
            active={sortField === "country"}
            dir={sortField === "country" ? sortDir : undefined}
            onClick={() => toggleSort("country")}
          />
        </div>

        {/* Refresh */}
        <button
          onClick={fetchVisits}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* ── Visits Table ── */}
      {loading && visits.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
          <RefreshCw className="mb-3 h-6 w-6 text-muted-foreground/30 animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando logs...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
          <Eye className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum acesso registrado</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Os acessos aparecerão aqui em tempo real</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((v) => (
            <div
              key={v.id}
              className="rounded-xl border border-border bg-card p-3.5 hover:border-primary/20 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* IP + Time */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-foreground">
                      {v.ip_address || "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {timeSince(v.created_at)}
                    </span>
                    {/* Location */}
                    {(v.city || v.country) && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin size={10} />
                        {[v.city, v.country].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    {/* Device + Browser + OS */}
                    <span className="inline-flex items-center gap-1">
                      {getDeviceIcon(v.user_agent)}
                      {parseBrowser(v.user_agent)} • {parseOS(v.user_agent)}
                    </span>

                    {/* Page */}
                    {v.page_path && (
                      <span>
                        Página: <span className="font-mono text-foreground">{v.page_path}</span>
                      </span>
                    )}
                  </div>

                  {/* Full timestamp */}
                  <div className="text-[9px] text-muted-foreground/60">
                    {formatDate(v.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[10px] text-muted-foreground">
            Página {page + 1} de {totalPages} • {totalCount} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-30"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-30"
            >
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Stat Card ── */
const StatCard = ({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-3.5">
    <div className="flex items-center gap-2 mb-1">
      <span className={color}>{icon}</span>
      <span className="text-lg font-bold text-foreground tabular-nums">{value}</span>
    </div>
    <span className="text-[10px] text-muted-foreground">{label}</span>
  </div>
);

/* ── Sort Button ── */
const SortButton = ({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir?: SortDir;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
      active
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-border bg-card text-muted-foreground hover:bg-secondary"
    }`}
  >
    <ArrowUpDown size={10} />
    {label}
    {active && dir && <span className="text-[8px]">{dir === "asc" ? "↑" : "↓"}</span>}
  </button>
);

export default AdminLogs;
