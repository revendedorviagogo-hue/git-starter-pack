import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ppiApi } from "@/lib/ppiApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, DollarSign, Building, ArrowDownToLine, LogIn, Eye, Loader2, Plus, History } from "lucide-react";

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
  last_login_at: string | null;
  last_data_sync_at: string | null;
  operator_code: string;
}

const PpiDashboard = () => {
  const [accounts, setAccounts] = useState<PpiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PpiAccount | null>(null);
  const [actionLoading, setActionLoading] = useState("");
  const [detailTab, setDetailTab] = useState("balance");

  // Add account form
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  // Withdraw form
  const [wCbu, setWCbu] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [wCuit, setWCuit] = useState("");
  const [withdrawResult, setWithdrawResult] = useState<any>(null);

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase.from("ppi_accounts" as any).select("*").order("created_at", { ascending: false });
    setAccounts((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleLogin = async (acc: PpiAccount) => {
    if (!acc.username || !acc.password) { toast({ title: "Sem credenciais", variant: "destructive" }); return; }
    setActionLoading(`login-${acc.id}`);
    try {
      const res = await ppiApi.login(acc.username, acc.password, acc.operator_code);
      toast({ title: res.success ? "Login OK" : "Erro no login", description: JSON.stringify(res).slice(0, 200) });
      await fetchAccounts();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setActionLoading("");
  };

  const handleFetchBalances = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) { toast({ title: "Sem token/conta", variant: "destructive" }); return; }
    setActionLoading(`bal-${acc.id}`);
    try {
      const res = await ppiApi.balances(acc.access_token, acc.cuenta_id, acc.id);
      toast({ title: res.success ? "Saldo atualizado" : "Erro", description: res.success ? `ARS: ${res.payload?.accountValueARS}` : JSON.stringify(res).slice(0, 200) });
      await fetchAccounts();
      if (selected?.id === acc.id) {
        const updated = accounts.find(a => a.id === acc.id);
        if (updated) setSelected({ ...updated, balance_data: res.payload });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setActionLoading("");
  };

  const handleFetchBanks = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setActionLoading(`bank-${acc.id}`);
    try {
      const res = await ppiApi.bankAccounts(acc.access_token, acc.cuenta_id, acc.id);
      toast({ title: res.success ? "Contas bancárias OK" : "Erro" });
      await fetchAccounts();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setActionLoading("");
  };

  const handleFetchOrders = async (acc: PpiAccount) => {
    if (!acc.access_token || !acc.cuenta_id) return;
    setActionLoading(`orders-${acc.id}`);
    try {
      const res = await ppiApi.orders(acc.access_token, acc.cuenta_id, acc.id);
      toast({ title: res.success ? "Ordens OK" : "Erro" });
      await fetchAccounts();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setActionLoading("");
  };

  const handleAddAccount = async () => {
    if (!newUser || !newPass) return;
    setAddingAccount(true);
    try {
      const res = await ppiApi.login(newUser, newPass);
      toast({ title: res.success || res.raw?.status === 0 ? "Conta adicionada!" : "Erro no login", description: JSON.stringify(res).slice(0, 200) });
      setNewUser("");
      setNewPass("");
      await fetchAccounts();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setAddingAccount(false);
  };

  const handleWithdraw = async () => {
    if (!selected?.access_token || !selected?.cuenta_id) return;
    setActionLoading("withdraw");
    try {
      const quoteRes = await ppiApi.withdrawQuote(
        selected.access_token, selected.cuenta_id, wCbu,
        selected.comitente || "", wCuit || selected.cuit || "", parseFloat(wAmount)
      );
      if (quoteRes.success) {
        setWithdrawResult(quoteRes.payload);
        toast({ title: "Cotação OK", description: `Valor: ${quoteRes.payload.amount} ${quoteRes.payload.currency?.symbol}` });
      } else {
        toast({ title: "Erro na cotação", description: JSON.stringify(quoteRes).slice(0, 200), variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setActionLoading("");
  };

  const handleConfirmWithdraw = async () => {
    if (!selected?.access_token || !selected?.cuenta_id) return;
    setActionLoading("confirm-withdraw");
    try {
      const res = await ppiApi.withdraw(
        selected.access_token, selected.cuenta_id, wCbu,
        selected.comitente || "", wCuit || selected.cuit || "", parseFloat(wAmount)
      );
      toast({ title: res.success ? "Retiro executado!" : "Erro no retiro", description: JSON.stringify(res).slice(0, 200) });
      setWithdrawResult(null);
      setWAmount("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setActionLoading("");
  };

  const balanceData = selected?.balance_data;
  const arsBalance = balanceData?.availabilities?.find((a: any) => a.currency?.id === 10000);
  const usdBalance = balanceData?.availabilities?.find((a: any) => a.currency?.id === 10001);
  const instruments = balanceData?.groupedInstruments || [];
  const bankData = selected?.bank_accounts || [];

  const isLoading = (key: string) => actionLoading === key;

  return (
    <div className="min-h-screen bg-[#0f1117] text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-400">PPI Dashboard</h1>
          <Button variant="outline" size="sm" onClick={fetchAccounts} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>

        {/* Add Account */}
        <Card className="bg-[#1a1d27] border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-blue-300 flex items-center gap-2"><Plus className="h-4 w-4" /> Adicionar Conta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Usuário PPI" value={newUser} onChange={e => setNewUser(e.target.value)}
                className="bg-[#0f1117] border-blue-500/20 text-white" />
              <Input placeholder="Senha" type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                className="bg-[#0f1117] border-blue-500/20 text-white" />
              <Button onClick={handleAddAccount} disabled={addingAccount} className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">
                {addingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Login
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Accounts List */}
          <Card className="lg:col-span-1 bg-[#1a1d27] border-blue-500/20 max-h-[80vh] overflow-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-300">Contas ({accounts.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
              ) : (
                <div className="divide-y divide-blue-500/10">
                  {accounts.map(acc => (
                    <div key={acc.id}
                      className={`p-3 cursor-pointer hover:bg-blue-500/5 transition-colors ${selected?.id === acc.id ? "bg-blue-500/10" : ""}`}
                      onClick={() => { setSelected(acc); setWithdrawResult(null); }}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{acc.full_name || acc.username || acc.email}</p>
                          <p className="text-xs text-gray-400">{acc.username} • Conta: {acc.cuenta_id || "—"}</p>
                          <p className="text-xs text-gray-500">Comitente: {acc.comitente || "—"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${acc.access_token ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                            {acc.access_token ? "Token" : "Sem token"}
                          </span>
                          {acc.balance_data?.accountValueARS != null && (
                            <span className="text-xs text-emerald-400 font-mono">
                              AR$ {Number(acc.balance_data.accountValueARS).toLocaleString("es-AR")}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-1 mt-2">
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-blue-400 hover:bg-blue-500/10 px-1.5"
                          onClick={e => { e.stopPropagation(); handleLogin(acc); }}
                          disabled={isLoading(`login-${acc.id}`)}>
                          {isLoading(`login-${acc.id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-400 hover:bg-emerald-500/10 px-1.5"
                          onClick={e => { e.stopPropagation(); handleFetchBalances(acc); }}
                          disabled={isLoading(`bal-${acc.id}`)}>
                          {isLoading(`bal-${acc.id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-orange-400 hover:bg-orange-500/10 px-1.5"
                          onClick={e => { e.stopPropagation(); handleFetchBanks(acc); }}
                          disabled={isLoading(`bank-${acc.id}`)}>
                          {isLoading(`bank-${acc.id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Building className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-purple-400 hover:bg-purple-500/10 px-1.5"
                          onClick={e => { e.stopPropagation(); handleFetchOrders(acc); }}
                          disabled={isLoading(`orders-${acc.id}`)}>
                          {isLoading(`orders-${acc.id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail Panel */}
          <Card className="lg:col-span-2 bg-[#1a1d27] border-blue-500/20">
            {selected ? (
              <>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-blue-300 flex items-center justify-between">
                    <span>{selected.full_name || selected.username}</span>
                    <span className="text-sm font-normal text-gray-400">Conta #{selected.cuenta_id}</span>
                  </CardTitle>
                  <div className="flex gap-4 text-sm">
                    {balanceData && (
                      <>
                        <span className="text-emerald-400 font-mono">ARS: {arsBalance?.availability?.[0]?.amount ?? balanceData.accountValueARS ?? "—"}</span>
                        <span className="text-blue-400 font-mono">USD: {usdBalance?.availability?.[0]?.amount ?? balanceData.accountValueUSD ?? "—"}</span>
                        <span className="text-gray-400">Total ARS: {balanceData.accountValueARS?.toLocaleString("es-AR")}</span>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={detailTab} onValueChange={setDetailTab}>
                    <TabsList className="bg-[#0f1117] border border-blue-500/20">
                      <TabsTrigger value="balance" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400">Saldo</TabsTrigger>
                      <TabsTrigger value="portfolio" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400">Portfolio</TabsTrigger>
                      <TabsTrigger value="banks" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400">Bancos</TabsTrigger>
                      <TabsTrigger value="withdraw" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400">Retiro</TabsTrigger>
                      <TabsTrigger value="orders" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400">Ordens</TabsTrigger>
                    </TabsList>

                    {/* Balances Tab */}
                    <TabsContent value="balance" className="space-y-4">
                      {balanceData ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {balanceData.availabilities?.map((a: any) => (
                              <div key={a.currency.id} className="bg-[#0f1117] rounded-lg p-3 border border-blue-500/10">
                                <p className="text-xs text-gray-400">{a.currency.name}</p>
                                <p className="text-lg font-mono text-white">{a.currency.symbol} {a.availability?.[0]?.amount?.toLocaleString("es-AR") ?? "0"}</p>
                                <p className="text-xs text-gray-500">Disponible: {a.availability?.[4]?.amount ?? "0"}</p>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[#0f1117] rounded-lg p-3 border border-emerald-500/10">
                              <p className="text-xs text-gray-400">Valor Total ARS</p>
                              <p className="text-xl font-mono text-emerald-400">AR$ {balanceData.accountValueARS?.toLocaleString("es-AR")}</p>
                            </div>
                            <div className="bg-[#0f1117] rounded-lg p-3 border border-blue-500/10">
                              <p className="text-xs text-gray-400">Valor Total USD</p>
                              <p className="text-xl font-mono text-blue-400">US$ {balanceData.accountValueUSD?.toLocaleString("es-AR")}</p>
                            </div>
                          </div>
                          {balanceData.instrumentDistribution && (
                            <div className="bg-[#0f1117] rounded-lg p-3 border border-blue-500/10">
                              <p className="text-xs text-gray-400 mb-2">Distribución</p>
                              {balanceData.instrumentDistribution.map((d: any) => (
                                <div key={d.id} className="flex justify-between text-sm">
                                  <span className="text-gray-300">{d.name}</span>
                                  <span className="text-blue-400 font-mono">{d.percentage?.toFixed(2)}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-8">Clique em $ para buscar saldos</p>
                      )}
                    </TabsContent>

                    {/* Portfolio Tab */}
                    <TabsContent value="portfolio">
                      {instruments.length > 0 ? (
                        <div className="overflow-auto">
                          {instruments.map((group: any) => (
                            <div key={group.instrumentTypeId} className="mb-4">
                              <h3 className="text-sm font-medium text-blue-300 mb-2">{group.name} ({group.groupedPercentage?.toFixed(1)}%)</h3>
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-blue-500/10">
                                    <TableHead className="text-gray-400">Ticker</TableHead>
                                    <TableHead className="text-gray-400">Qtd</TableHead>
                                    <TableHead className="text-gray-400">Preço</TableHead>
                                    <TableHead className="text-gray-400">Valor</TableHead>
                                    <TableHead className="text-gray-400">Retorno</TableHead>
                                    <TableHead className="text-gray-400">%</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.instruments?.map((inst: any) => (
                                    <TableRow key={inst.ticker} className="border-blue-500/10">
                                      <TableCell className="font-medium text-white">{inst.ticker}</TableCell>
                                      <TableCell className="text-gray-300">{inst.instrumentAmount}</TableCell>
                                      <TableCell className="font-mono text-gray-300">{inst.currency?.symbol} {inst.price?.toLocaleString("es-AR")}</TableCell>
                                      <TableCell className="font-mono text-white">{inst.currency?.symbol} {inst.amount?.toLocaleString("es-AR")}</TableCell>
                                      <TableCell className={`font-mono ${(inst.ppc?.cumulativeReturn || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {inst.ppc?.cumulativeReturn?.toLocaleString("es-AR")}
                                      </TableCell>
                                      <TableCell className={`font-mono ${(inst.ppc?.cumulativeReturnPercentage || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {inst.ppc?.cumulativeReturnPercentage?.toFixed(1)}%
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-8">Busque saldos primeiro para ver o portfolio</p>
                      )}
                    </TabsContent>

                    {/* Banks Tab */}
                    <TabsContent value="banks">
                      {Array.isArray(bankData) && bankData.length > 0 ? (
                        <div className="space-y-3">
                          {bankData.map((group: any, gi: number) => (
                            <div key={gi}>
                              <p className="text-xs text-gray-400 mb-1">{group.currency?.name}</p>
                              {group.account?.map((ba: any) => (
                                <div key={ba.id} className="bg-[#0f1117] rounded-lg p-3 border border-blue-500/10 mb-2">
                                  <div className="flex justify-between">
                                    <div>
                                      <p className="text-sm text-white font-medium">{ba.name}</p>
                                      <p className="text-xs text-gray-400">{ba.bankAccountType} • {ba.holderName}</p>
                                      <p className="text-xs text-gray-500 font-mono mt-1">CBU: {ba.cbu}</p>
                                      <p className="text-xs text-gray-500">CUIT: {ba.cuit}</p>
                                    </div>
                                    <Button size="sm" variant="ghost" className="text-blue-400 text-xs"
                                      onClick={() => { setWCbu(ba.cbu); setWCuit(ba.cuit); setDetailTab("withdraw"); }}>
                                      <ArrowDownToLine className="h-3 w-3 mr-1" /> Retirar
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-8">Clique em 🏦 para buscar contas bancárias</p>
                      )}
                    </TabsContent>

                    {/* Withdraw Tab */}
                    <TabsContent value="withdraw" className="space-y-4">
                      <div className="space-y-3">
                        <Input placeholder="CBU" value={wCbu} onChange={e => setWCbu(e.target.value)}
                          className="bg-[#0f1117] border-blue-500/20 text-white font-mono" />
                        <Input placeholder="CUIT" value={wCuit} onChange={e => setWCuit(e.target.value)}
                          className="bg-[#0f1117] border-blue-500/20 text-white font-mono" />
                        <Input placeholder="Monto" type="number" value={wAmount} onChange={e => setWAmount(e.target.value)}
                          className="bg-[#0f1117] border-blue-500/20 text-white font-mono" />
                        <div className="flex gap-2">
                          <Button onClick={handleWithdraw} disabled={isLoading("withdraw") || !wCbu || !wAmount}
                            className="bg-orange-600 hover:bg-orange-700">
                            {isLoading("withdraw") ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            Cotizar Retiro
                          </Button>
                          {withdrawResult && (
                            <Button onClick={handleConfirmWithdraw} disabled={isLoading("confirm-withdraw")}
                              className="bg-red-600 hover:bg-red-700">
                              {isLoading("confirm-withdraw") ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                              CONFIRMAR RETIRO
                            </Button>
                          )}
                        </div>
                      </div>
                      {withdrawResult && (
                        <div className="bg-[#0f1117] rounded-lg p-4 border border-orange-500/20">
                          <p className="text-sm text-orange-300 mb-2">Cotação do Retiro:</p>
                          <div className="space-y-1 text-sm">
                            <p className="text-white">Banco: <span className="text-gray-300">{withdrawResult.bankName}</span></p>
                            <p className="text-white">Tipo: <span className="text-gray-300">{withdrawResult.bankAccountType}</span></p>
                            <p className="text-white">Titular: <span className="text-gray-300">{withdrawResult.holderName}</span></p>
                            <p className="text-white">Monto: <span className="text-emerald-400 font-mono">{withdrawResult.currency?.symbol} {withdrawResult.amount}</span></p>
                            <p className="text-white">Tarifa: <span className="text-gray-300">{withdrawResult.tariff}</span></p>
                            <p className="text-white">Bruto: <span className="text-emerald-400 font-mono">{withdrawResult.grossPrice}</span></p>
                            {withdrawResult.alert?.map((a: string, i: number) => (
                              <p key={i} className="text-xs text-yellow-400 mt-2">⚠ {a}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* Orders Tab */}
                    <TabsContent value="orders">
                      {selected.orders_data && Array.isArray(selected.orders_data) && selected.orders_data.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow className="border-blue-500/10">
                              <TableHead className="text-gray-400">Data</TableHead>
                              <TableHead className="text-gray-400">Operação</TableHead>
                              <TableHead className="text-gray-400">Valor</TableHead>
                              <TableHead className="text-gray-400">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selected.orders_data.map((order: any) => (
                              <TableRow key={order.id} className="border-blue-500/10">
                                <TableCell className="text-gray-300 text-xs">{new Date(order.date).toLocaleString("es-AR")}</TableCell>
                                <TableCell className="text-white text-sm">{order.operation?.name || order.instrument?.type?.name}</TableCell>
                                <TableCell className="font-mono text-emerald-400">{order.instrument?.currency?.symbol} {order.amount?.toLocaleString("es-AR")}</TableCell>
                                <TableCell>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${order.status?.id === 5 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                                    {order.status?.description}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-gray-500 text-center py-8">Clique em 📜 para buscar ordens</p>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center h-64">
                <p className="text-gray-500">Selecione uma conta para ver detalhes</p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PpiDashboard;
