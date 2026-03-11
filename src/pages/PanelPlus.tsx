import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, User, Shield, Wallet, RefreshCw, CreditCard, TrendingUp } from "lucide-react";

interface PlusData {
  profile: any;
  balances: any;
  fintech: any;
  limits: any;
  crypto: any;
  accessToken: string;
}

const PanelPlus = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PlusData | null>(null);
  const { toast } = useToast();

  const handleLogin = async () => {
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
      setData(res);
      toast({ title: "Login realizado", description: `Bem-vindo, ${res.profile.first_name}` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!data?.accessToken) return;
    setLoading(true);
    try {
      const { data: res } = await supabase.functions.invoke("plus-auth", {
        body: { action: "refresh", accessToken: data.accessToken },
      });
      if (res?.success) {
        setData((prev) => prev ? { ...prev, ...res } : null);
        toast({ title: "Dados atualizados" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-gray-950 to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-emerald-800/50 bg-gray-900/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center mb-2">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Plus Panel</CardTitle>
            <p className="text-gray-400 text-sm">Acesse sua conta Plus</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loading || !email || !password}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold h-11"
            >
              {loading ? <Loader2 className="animate-spin mr-2" /> : null}
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile, balances, fintech, limits } = data;
  const p = profile?.profile || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-gray-950 to-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {profile.first_name} {profile.last_name}
              </h1>
              <p className="text-gray-400 text-sm">{profile.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRefresh} disabled={loading} variant="outline" className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/50">
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button onClick={() => setData(null)} variant="outline" className="border-gray-700 text-gray-400 hover:bg-gray-800">
              Sair
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Balance Cards */}
        <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-gray-400 text-sm">Saldo ARS</span>
            </div>
            <p className="text-2xl font-bold text-white">$ {balances?.ars?.toLocaleString("es-AR", { minimumFractionDigits: 2 }) || "0.00"}</p>
            {balances?.pendingARS > 0 && <p className="text-xs text-yellow-400 mt-1">Pendente: $ {balances.pendingARS}</p>}
          </CardContent>
        </Card>

        <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-gray-400 text-sm">Saldo USD</span>
            </div>
            <p className="text-2xl font-bold text-white">US$ {balances?.usd?.toLocaleString("en-US", { minimumFractionDigits: 2 }) || "0.00"}</p>
            {balances?.pendingUSD > 0 && <p className="text-xs text-yellow-400 mt-1">Pendente: US$ {balances.pendingUSD}</p>}
          </CardContent>
        </Card>

        <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-gray-400 text-sm">Fintech</span>
            </div>
            <p className="text-2xl font-bold text-white">$ {fintech?.balance?.toLocaleString("es-AR", { minimumFractionDigits: 2 }) || "0.00"}</p>
            <p className="text-xs text-gray-500 mt-1 truncate">CVU: {fintech?.cvu || "N/A"}</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-orange-400" />
              </div>
              <span className="text-gray-400 text-sm">Cuenta Inversora</span>
            </div>
            <p className="text-2xl font-bold text-white">#{profile.inversorAccount || "N/A"}</p>
            <p className="text-xs text-gray-500 mt-1">
              {profile.isInversorActive ? "✅ Activa" : "❌ Inactiva"} · {profile.inversorActiveDays || 0} días
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Profile Details */}
        <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <User className="w-5 h-5 text-emerald-400" /> Datos Personales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Nombre", `${profile.first_name} ${profile.last_name}`],
                ["DNI", profile.document],
                ["CUIT", profile.cuit],
                ["Email", profile.email],
                ["Teléfono", p.telephone],
                ["Ciudad", p.city],
                ["Provincia", p.province?.name],
                ["CP", p.postal_code],
                ["Sexo", p.sexString],
                ["Nacimiento", p.birthdateString],
                ["Estado Civil", p.marital],
                ["IVA", p.iva],
                ["Actividad", p.activity?.description],
                ["Canal", profile.channel],
                ["Referido", profile.referral_code],
                ["Creado", profile.created_at?.split(" ")[0]],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <span className="text-gray-500 text-xs">{label}</span>
                  <p className="text-gray-200 font-medium truncate">{value || "—"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Limits */}
        <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Shield className="w-5 h-5 text-emerald-400" /> Límites
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {limits && Object.entries(limits).map(([key, val]: [string, any]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-300 font-medium capitalize">{key}</span>
                  {val.no_limit && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Sin límite</span>}
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Mensual</span>
                      <span>$ {Number(val.limit_month).toLocaleString("es-AR")} ({val.month_percentage}%)</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(val.month_percentage, 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Anual</span>
                      <span>$ {Number(val.limit_year).toLocaleString("es-AR")} ({val.year_percentage}%)</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(val.year_percentage, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Features Status */}
      <div className="max-w-7xl mx-auto">
        <Card className="bg-gray-900/80 border-emerald-800/30 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-lg">Estado de Servicios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                ["Inversiones", profile.allowInversions],
                ["Inversor", profile.isInversor],
                ["Inversor Activo", profile.isInversorActive],
                ["Crypto", profile.allowCrypto],
                ["Crypto Activo", profile.isCryptoActive],
                ["Crypto Open", profile.allowCryptoOpen],
                ["Válido", profile.valid === 1],
                ["Bloqueado", profile.blocked === 1],
                ["Suspendido", profile.suspended === 1],
                ["Selfie", profile.registerSelfie],
                ["Fintech", fintech?.allowed],
                ["Fintech Disp.", fintech?.available],
              ].map(([label, active]) => (
                <div key={label as string} className={`p-3 rounded-lg border text-center text-sm ${active ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-gray-800/50 border-gray-700/50 text-gray-500"}`}>
                  <span className="block text-lg mb-1">{active ? "✅" : "❌"}</span>
                  {label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PanelPlus;
