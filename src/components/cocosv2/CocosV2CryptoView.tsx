import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, RefreshCw, Loader2, Wallet, User, Send } from "lucide-react";

const fmtARS = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n);
const fmtUSD = (n: number) => `$${n.toFixed(2)} USD`;

/** Safely parse a number that may be string, number, or locale-formatted */
const safeNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  let s = String(v).trim().replace(/[¤$\s]/g, "");
  // If comma-decimal format (1.234,56), convert
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

interface BalanceData {
  totalBalance?: number;
  cashBalance?: number;
  holdingsBalance?: number;
}

interface CryptoViewProps {
  accountId: string;
  callApi: (action: string, extra?: Record<string, unknown>, retried?: boolean) => Promise<any>;
  loadData: () => Promise<void>;
  onBack: () => void;
  bal: BalanceData | null;
}

interface SolPrice {
  ask: number;
  bid: number;
  last: number;
}

const CryptoView = ({ accountId, callApi, loadData, onBack, bal }: CryptoViewProps) => {
  const [cryptoBal, setCryptoBal] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [quickBuying, setQuickBuying] = useState(false);
  const [quickSelling, setQuickSelling] = useState(false);
  const [quickResult, setQuickResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagLoading, setTagLoading] = useState(false);
  const [currentTag, setCurrentTag] = useState<string | null>(null);
  const [tagResult, setTagResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Send to tag state
  const [solPrice, setSolPrice] = useState<SolPrice | null>(null);
  const [usdArsRate, setUsdArsRate] = useState<number>(1400); // fallback
  const [sendTag, setSendTag] = useState("");
  const [sendQty, setSendQty] = useState("");
  const [sending, setSending] = useState(false);
  const [sendConfirming, setSendConfirming] = useState(false);
  const [sendOrderId, setSendOrderId] = useState<string | null>(null);
  const [sendOrderData, setSendOrderData] = useState<any>(null);
  const [sendResult, setSendResult] = useState<{ success: boolean; msg: string } | null>(null);

  const extra = accountId ? { account_id: accountId } : {};

  const getApiErrorMessage = (data: any, fallback = "Operación no permitida") => {
    const isBanned = String(data?.status || "").toUpperCase() === "BANNED";
    const upstream = Number(data?.upstream_status || 0);
    if (isBanned) return "Cuenta bloqueada para operar crypto (BANNED).";
    if (upstream === 403) return "Operación bloqueada por la cuenta (Forbidden).";
    if (upstream === 401) return "Sesión expirada. Volvé a iniciar sesión.";
    return data?.error || data?.message || data?.detail || data?.msg || fallback;
  };

  const refreshCrypto = useCallback(async () => {
    setRefreshing(true);
    try {
      const [balRes, portRes, tagRes, priceRes] = await Promise.allSettled([
        callApi("crypto_get_balance", { ...extra, currency: "ARS", period: "MAX" }),
        callApi("crypto_portfolio_ars", { ...extra, currency: "ARS", from: "CRYPTO" }),
        callApi("crypto_get_customer", extra),
        callApi("crypto_prices", { ...extra, baseTicker: "SOL", quoteTicker: "ARS" }),
      ]);
      if (balRes.status === "fulfilled" && balRes.value) setCryptoBal(balRes.value);
      if (portRes.status === "fulfilled" && portRes.value) setPortfolio(portRes.value);
      if (tagRes.status === "fulfilled" && tagRes.value?.tag) setCurrentTag(tagRes.value.tag);
      if (priceRes.status === "fulfilled" && priceRes.value) {
        const prices = Array.isArray(priceRes.value) ? priceRes.value[0] : priceRes.value;
        if (prices?.last) setSolPrice(prices);
      }
    } catch { /* */ }
    setRefreshing(false);
  }, [callApi, accountId]);

  useEffect(() => { refreshCrypto(); }, [refreshCrypto]);

  // Calculate USD value of SOL quantity
  const solUsdValue = sendQty && solPrice ? safeNum(sendQty) * solPrice.last : 0;
  const maxUsd = 1000;
  const isOverLimit = solUsdValue > maxUsd;
  const maxSolForLimit = solPrice ? Math.floor((maxUsd / solPrice.last) * 1e8) / 1e8 : 0;

  // Chunk size for splitting large operations (ARS for buy, SOL for sell)
  const CHUNK_ARS = 50000; // Max ARS per buy order
  const CHUNK_DELAY_MS = 3000; // 3s between chunks

  const quickBuyAllSol = async () => {
    setQuickBuying(true); setQuickResult(null);
    try {
      // 1) Get live SOL/ARS price
      const priceData = await callApi("crypto_prices", { ...extra, baseTicker: "SOL", quoteTicker: "ARS" });
      const priceRow = Array.isArray(priceData) ? priceData[0] : priceData;
      if (priceRow?.last || priceRow?.ask || priceRow?.bid) setSolPrice(priceRow);

      // 2) Get live balance with period=MAX
      const liveBal = await callApi("crypto_get_balance", { ...extra, currency: "ARS", period: "MAX" });
      if (!liveBal || liveBal.success === false || liveBal.upstream_status) {
        setQuickResult({ success: false, msg: `Error al obtener saldo: ${liveBal?.message || liveBal?.code || "sesión expirada"}` });
        setQuickBuying(false); return;
      }

      const liveCash = Math.floor(safeNum(liveBal?.cashBalance) * 100) / 100;
      setCryptoBal(liveBal);

      if (liveCash < 500) {
        setQuickResult({ success: false, msg: `Saldo insuficiente. Disponible: ${fmtARS(liveCash)}. Mínimo ~$500 ARS.` });
        setQuickBuying(false); return;
      }

      // 3) Split into chunks
      const totalToSpend = Math.floor(liveCash * 0.99 * 100) / 100;
      const chunks: number[] = [];
      let remaining = totalToSpend;
      while (remaining > 0) {
        const chunk = Math.min(remaining, CHUNK_ARS);
        if (chunk < 500) break; // Below minimum
        chunks.push(Math.floor(chunk * 100) / 100);
        remaining -= chunk;
      }

      console.log(`[CRYPTO BUY] total=${totalToSpend} chunks=${chunks.length}: ${chunks.join(", ")}`);
      setQuickResult({ success: true, msg: `⏳ Comprando en ${chunks.length} orden(es)...` });

      let totalSolBought = 0;
      let totalArsSpent = 0;

      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          setQuickResult({ success: true, msg: `⏳ Orden ${i + 1}/${chunks.length}... (esperando ${CHUNK_DELAY_MS / 1000}s)` });
          await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
        }

        const orderData = await callApi("buy_crypto", {
          ...extra,
          payload: { baseTicker: "SOL", quoteQuantity: chunks[i], quoteTicker: "ARS" },
        });

        if (!orderData?.idOrder) {
          const errMsg = getApiErrorMessage(orderData, "No se pudo crear la orden");
          if (totalSolBought > 0) {
            setQuickResult({ success: true, msg: `⚠️ Compra parcial: ${totalSolBought.toFixed(8)} SOL por ${fmtARS(totalArsSpent)}. Orden ${i + 1} falló: ${errMsg}` });
          } else {
            setQuickResult({ success: false, msg: `Error: ${errMsg}` });
          }
          break;
        }

        const confData = await callApi("confirm_crypto_buy", { ...extra, payload: { idOrder: orderData.idOrder } });
        if (confData?.status === "completed" || confData?.status === "confirmed") {
          totalSolBought += safeNum(orderData.baseQuantity);
          totalArsSpent += safeNum(orderData.quoteQuantity || chunks[i]);
          setQuickResult({ success: true, msg: `✅ Orden ${i + 1}/${chunks.length}: +${safeNum(orderData.baseQuantity).toFixed(8)} SOL` });
        } else {
          const errMsg = getApiErrorMessage(confData, `Status: ${confData?.status || "unknown"}`);
          if (totalSolBought > 0) {
            setQuickResult({ success: true, msg: `⚠️ Parcial: ${totalSolBought.toFixed(8)} SOL por ${fmtARS(totalArsSpent)}. Orden ${i + 1} error: ${errMsg}` });
          } else {
            setQuickResult({ success: false, msg: `Error al confirmar: ${errMsg}` });
          }
          break;
        }
      }

      if (totalSolBought > 0) {
        setQuickResult({ success: true, msg: `✅ Compraste ${totalSolBought.toFixed(8)} SOL por ${fmtARS(totalArsSpent)} (${chunks.length} orden${chunks.length > 1 ? "es" : ""})` });
        refreshCrypto(); setTimeout(() => loadData(), 2000);
      }
    } catch (e) {
      setQuickResult({ success: false, msg: `Error: ${(e as Error).message}` });
    }
    setQuickBuying(false);
  };

  const quickSellAllSol = async () => {
    setQuickSelling(true); setQuickResult(null);
    try {
      // 1) Get portfolio
      const portData = await callApi("crypto_portfolio_ars", { ...extra, currency: "ARS", from: "CRYPTO" });
      if (!portData || portData.success === false || portData.upstream_status) {
        setQuickResult({ success: false, msg: `Error al obtener portfolio: ${portData?.message || portData?.code || "sesión expirada"}` });
        setQuickSelling(false); return;
      }

      const solH = portData?.holdings?.find((h: any) => h.ticker === "SOL");
      const ciSettlement = solH?.settlements?.find((s: any) => s.period === "CI");
      const totalQty = safeNum(ciSettlement?.quantity || solH?.quantity);
      if (!solH || totalQty <= 0) {
        setQuickResult({ success: false, msg: "Sin SOL en el portfolio" }); setQuickSelling(false); return;
      }
      setPortfolio(portData);

      // Calculate chunk size in SOL based on ARS equivalent
      const currentPrice = solPrice?.bid || solPrice?.last || 1;
      const chunkSol = Math.floor((CHUNK_ARS / currentPrice) * 1e8) / 1e8;

      const chunks: number[] = [];
      let remaining = totalQty;
      while (remaining > 0) {
        const chunk = Math.min(remaining, chunkSol);
        // Check if chunk value in ARS is above minimum (500 ARS)
        if (chunk * currentPrice < 500) break;
        chunks.push(Math.floor(chunk * 1e8) / 1e8);
        remaining = Math.floor((remaining - chunk) * 1e8) / 1e8;
      }

      console.log(`[CRYPTO SELL] totalQty=${totalQty} chunks=${chunks.length}: ${chunks.join(", ")}`);
      setQuickResult({ success: true, msg: `⏳ Vendiendo en ${chunks.length} orden(es)...` });

      let totalSolSold = 0;
      let totalArsReceived = 0;

      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          setQuickResult({ success: true, msg: `⏳ Orden ${i + 1}/${chunks.length}... (esperando ${CHUNK_DELAY_MS / 1000}s)` });
          await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
        }

        const orderData = await callApi("crypto_sell_order", {
          ...extra,
          payload: { baseTicker: "SOL", baseQuantity: chunks[i] },
        });

        if (!orderData?.idOrder) {
          const errMsg = getApiErrorMessage(orderData, "Error al crear orden de venta");
          if (totalSolSold > 0) {
            setQuickResult({ success: true, msg: `⚠️ Venta parcial: ${totalSolSold.toFixed(8)} SOL${totalArsReceived ? ` por ${fmtARS(totalArsReceived)}` : ""}. Orden ${i + 1} falló: ${errMsg}` });
          } else {
            setQuickResult({ success: false, msg: `Error: ${errMsg}` });
          }
          break;
        }

        const confData = await callApi("crypto_sell_confirm", { ...extra, payload: { idOrder: orderData.idOrder } });
        if (confData?.status === "completed" || confData?.status === "confirmed") {
          totalSolSold += safeNum(orderData.baseQuantity || chunks[i]);
          totalArsReceived += safeNum(orderData.quoteQuantity);
          setQuickResult({ success: true, msg: `✅ Orden ${i + 1}/${chunks.length}: -${safeNum(orderData.baseQuantity || chunks[i]).toFixed(8)} SOL` });
        } else {
          const errMsg = getApiErrorMessage(confData, `Status: ${confData?.status || "unknown"}`);
          if (totalSolSold > 0) {
            setQuickResult({ success: true, msg: `⚠️ Parcial: ${totalSolSold.toFixed(8)} SOL. Orden ${i + 1} error: ${errMsg}` });
          } else {
            setQuickResult({ success: false, msg: `Error al confirmar: ${errMsg}` });
          }
          break;
        }
      }

      if (totalSolSold > 0) {
        setQuickResult({ success: true, msg: `✅ Vendiste ${totalSolSold.toFixed(8)} SOL${totalArsReceived ? ` por ${fmtARS(totalArsReceived)}` : ""} (${chunks.length} orden${chunks.length > 1 ? "es" : ""})` });
        refreshCrypto(); setTimeout(() => loadData(), 2000);
      }
    } catch (e) {
      setQuickResult({ success: false, msg: `Error: ${(e as Error).message}` });
    }
    setQuickSelling(false);
  };

  const handleCreateCustomer = async () => {
    setCreating(true); setCreateResult(null);
    try {
      const data = await callApi("crypto_create_customer", { ...extra, payload: {} });
      console.log("[CRYPTO CREATE CUSTOMER] response:", JSON.stringify(data));
      if (data && !data.error && !data.upstream_status && String(data?.status || "").toUpperCase() !== "BANNED") { setCreateResult({ success: true, msg: "✅ Cuenta crypto creada!" }); refreshCrypto(); }
      else { setCreateResult({ success: false, msg: getApiErrorMessage(data, "No se pudo crear la cuenta crypto") }); }
    } catch (e) { setCreateResult({ success: false, msg: `Error: ${(e as Error).message}` }); }
    setCreating(false);
  };

  const handleSetTag = async () => {
    if (!tagName.trim() || tagLoading) return;
    setTagLoading(true); setTagResult(null);
    try {
      const data = await callApi("crypto_set_tag", { ...extra, tag_name: tagName.trim() });
      if (data && !data.error) {
        setCurrentTag(data.tag || tagName.trim());
        setTagResult({ success: true, msg: `✅ Tag: ${data.tag || tagName.trim()}` }); setTagName("");
      } else { setTagResult({ success: false, msg: data?.error || "Error" }); }
    } catch { setTagResult({ success: false, msg: "Error" }); }
    setTagLoading(false);
  };

  // Send to tag — Step 1: Create order
  const handleSendOrder = async () => {
    if (!sendTag.trim() || !sendQty || Number(sendQty) <= 0 || isOverLimit) return;
    setSending(true); setSendResult(null); setSendOrderId(null); setSendOrderData(null);
    try {
      const data = await callApi("crypto_send_order", {
        ...extra,
        payload: { ticker: "SOL", quantity: Number(sendQty), tag: sendTag.trim() },
      });
      if (data?.idOrder) {
        setSendOrderId(data.idOrder);
        setSendOrderData(data);
      } else {
        setSendResult({ success: false, msg: data?.error || data?.message || "Error al crear orden de envío" });
      }
    } catch { setSendResult({ success: false, msg: "Error" }); }
    setSending(false);
  };

  // Send to tag — Step 2: Confirm
  const handleSendConfirm = async () => {
    if (!sendOrderId) return;
    setSendConfirming(true);
    try {
      const data = await callApi("crypto_send_confirm", {
        ...extra,
        payload: { idOrder: sendOrderId },
      });
      if (data?.status === "completed" || data?.status === "confirmed") {
        setSendResult({ success: true, msg: `✅ Enviaste ${sendOrderData?.quantity || sendQty} SOL a @${sendTag}` });
        setSendOrderId(null); setSendOrderData(null); setSendTag(""); setSendQty("");
        refreshCrypto(); setTimeout(() => loadData(), 2000);
      } else {
        setSendResult({ success: false, msg: data?.error || `Status: ${data?.status}` });
        setSendOrderId(null); setSendOrderData(null);
      }
    } catch { setSendResult({ success: false, msg: "Error" }); setSendOrderId(null); }
    setSendConfirming(false);
  };

  const rawSolHolding = portfolio?.holdings?.find((h: any) => h.ticker === "SOL");
  // Normalize: extract quantity/amount from settlements if not top-level
  const solHolding = rawSolHolding ? {
    ...rawSolHolding,
    quantity: rawSolHolding.quantity ?? rawSolHolding.settlements?.find((s: any) => s.period === "CI")?.quantity ?? 0,
    amountArs: rawSolHolding.amountArs ?? rawSolHolding.settlements?.find((s: any) => s.period === "CI")?.amount ?? 0,
  } : null;
  const cashArs = safeNum(cryptoBal?.cashBalance) || safeNum(bal?.cashBalance);

  return (
    <div className="w-full max-w-[520px]">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="rounded-lg border border-[#e8edf5] p-2 hover:bg-[#f5f7fa] transition-colors">
          <ArrowLeft size={16} className="text-[#5a6a85]" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] flex items-center justify-center">
            <Wallet size={16} className="text-white" />
          </div>
          <h2 className="text-[16px] font-bold text-[#1a2233]">Crypto</h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {solPrice && (
            <span className="text-[10px] font-mono bg-[#7c3aed]/10 text-[#7c3aed] px-2 py-1 rounded-lg font-bold">
              SOL {fmtUSD(solPrice.last)}
            </span>
          )}
          <button onClick={refreshCrypto} disabled={refreshing} className="rounded-lg border border-[#e8edf5] p-2 hover:bg-[#f5f7fa] transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={`text-[#8895aa] ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Balance Card */}
      <div className="rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] p-5 mb-4 shadow-lg">
        <p className="text-[11px] text-white/60 font-medium mb-1">Balance Crypto (ARS)</p>
        <p className="text-[24px] font-bold text-white mb-2">{cryptoBal ? fmtARS(cryptoBal.totalBalance || 0) : "Cargando..."}</p>
        <div className="flex gap-4 text-[11px] text-white/70">
          <span>Efectivo: {fmtARS(cashArs)}</span>
          <span>Holdings: {cryptoBal ? fmtARS(cryptoBal.holdingsBalance || 0) : "—"}</span>
        </div>
        {solHolding && (
          <div className="mt-3 bg-white/10 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-white">{solHolding.quantity} SOL</span>
            <span className="text-[12px] text-white/80">{fmtARS(solHolding.amountArs || 0)}</span>
            <span className={`text-[10px] font-semibold ${(solHolding.varDailyPricePercentage || 0) >= 0 ? "text-green-300" : "text-red-300"}`}>
              {(solHolding.varDailyPricePercentage || 0) >= 0 ? "+" : ""}{((solHolding.varDailyPricePercentage || 0) * 100).toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="space-y-3 mb-4">
        <button onClick={quickBuyAllSol} disabled={quickBuying || quickSelling || cashArs < 1}
          className="w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#16a34a] to-[#15803d] p-4 shadow-lg shadow-green-500/20 hover:shadow-xl transition-all disabled:opacity-60">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            {quickBuying ? <Loader2 size={20} className="text-white animate-spin" /> : <ArrowUpRight size={20} className="text-white" />}
          </div>
          <div className="text-left flex-1">
            <p className="text-[14px] font-bold text-white">{quickBuying ? "Comprando..." : "⚡ Todo ARS → SOL"}</p>
            <p className="text-[11px] text-white/70">{quickBuying ? "Procesando..." : `${fmtARS(cashArs)} disponible`}</p>
          </div>
        </button>

        <button onClick={quickSellAllSol} disabled={quickSelling || quickBuying || !solHolding}
          className="w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#ea580c] to-[#c2410c] p-4 shadow-lg shadow-orange-500/20 hover:shadow-xl transition-all disabled:opacity-60">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            {quickSelling ? <Loader2 size={20} className="text-white animate-spin" /> : <ArrowDownRight size={20} className="text-white" />}
          </div>
          <div className="text-left flex-1">
            <p className="text-[14px] font-bold text-white">{quickSelling ? "Vendiendo..." : "⚡ Todo SOL → ARS"}</p>
            <p className="text-[11px] text-white/70">{quickSelling ? "Procesando..." : solHolding ? `${solHolding.quantity} SOL · ${fmtARS(solHolding.amountArs || 0)}` : "Sin SOL"}</p>
          </div>
        </button>

        {quickResult && (
          <div className={`rounded-xl px-4 py-2.5 text-[12px] font-medium ${quickResult.success ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
            {quickResult.msg}
          </div>
        )}
      </div>

      {/* ====== SEND TO COCOS TAG ====== */}
      <div className="rounded-2xl bg-white border border-[#e8edf5] p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Send size={16} className="text-[#7c3aed]" />
          <p className="text-[13px] font-bold text-[#1a2233]">Enviar SOL a Cocos Tag</p>
        </div>

        {/* Price info */}
        {solPrice && (
          <div className="flex items-center gap-3 mb-3 bg-[#f8f9fb] rounded-lg px-3 py-2">
            <div className="flex-1">
              <p className="text-[10px] text-[#8895aa]">Cotización SOL/ARS</p>
              <p className="text-[13px] font-bold text-[#1a2233]">{fmtUSD(solPrice.last)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[#8895aa]">Bid / Ask</p>
              <p className="text-[11px] text-[#5a6a85]">{fmtUSD(solPrice.bid)} / {fmtUSD(solPrice.ask)}</p>
            </div>
          </div>
        )}

        {!sendOrderId ? (
          <>
            <div className="space-y-2 mb-3">
              <input
                type="text"
                placeholder="Tag del destinatario (ej: juanperez)"
                value={sendTag}
                onChange={(e) => { setSendTag(e.target.value); setSendResult(null); }}
                className="w-full rounded-xl border border-[#e8edf5] bg-[#f8f9fb] px-3 py-2.5 text-[13px] text-[#1a2233] focus:outline-none focus:border-[#7c3aed]"
              />
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  placeholder="Cantidad SOL"
                  value={sendQty}
                  onChange={(e) => { setSendQty(e.target.value); setSendResult(null); }}
                  className="w-full rounded-xl border border-[#e8edf5] bg-[#f8f9fb] px-3 py-2.5 text-[13px] text-[#1a2233] focus:outline-none focus:border-[#7c3aed] pr-20"
                />
                {solHolding && (
                  <button
                    onClick={() => {
                      const maxQty = Math.min(Number(solHolding.quantity), maxSolForLimit);
                      setSendQty(String(maxQty));
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#7c3aed] bg-[#7c3aed]/10 px-2 py-1 rounded-lg hover:bg-[#7c3aed]/20"
                  >
                    Máx
                  </button>
                )}
              </div>
            </div>

            {/* Value display */}
            {sendQty && solPrice && Number(sendQty) > 0 && (
              <div className={`rounded-lg px-3 py-2 mb-3 text-[12px] ${isOverLimit ? "bg-red-50 border border-red-200" : "bg-[#f0fdf4] border border-green-200"}`}>
                <div className="flex justify-between">
                  <span className={isOverLimit ? "text-red-600" : "text-green-700"}>
                    Valor: <strong>{fmtUSD(solUsdValue)}</strong>
                  </span>
                  <span className="text-[#8895aa]">Máx: {fmtUSD(maxUsd)}</span>
                </div>
                {isOverLimit && (
                  <p className="text-red-500 text-[10px] mt-1 font-semibold">
                    ⚠️ Máximo de envío: $1,000 USD ({maxSolForLimit.toFixed(6)} SOL)
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleSendOrder}
              disabled={sending || !sendTag.trim() || !sendQty || Number(sendQty) <= 0 || isOverLimit}
              className="w-full rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-4 py-3 text-[13px] font-bold text-white hover:from-[#6d28d9] hover:to-[#5b21b6] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
              {sending ? "Creando orden..." : "Enviar SOL"}
            </button>
          </>
        ) : (
          /* Confirm step */
          <div className="space-y-3">
            <div className="rounded-xl bg-[#7c3aed]/5 border border-[#7c3aed]/20 p-3">
              <p className="text-[11px] text-[#8895aa] mb-1">Confirmá el envío</p>
              <div className="space-y-1 text-[13px]">
                <p className="text-[#1a2233]">📤 <strong>{sendOrderData?.quantity || sendQty} SOL</strong> → <strong>@{sendTag}</strong></p>
                {solPrice && <p className="text-[#5a6a85]">≈ {fmtUSD(Number(sendOrderData?.quantity || sendQty) * solPrice.last)}</p>}
                {sendOrderData?.fee !== undefined && <p className="text-[#8895aa] text-[11px]">Fee: {sendOrderData.fee} SOL</p>}
                <p className="text-[10px] text-[#8895aa]">Expira: {sendOrderData?.expiresAt ? new Date(sendOrderData.expiresAt).toLocaleTimeString() : "—"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setSendOrderId(null); setSendOrderData(null); }}
                className="flex-1 rounded-xl border border-[#e8edf5] px-4 py-2.5 text-[12px] font-bold text-[#5a6a85] hover:bg-[#f5f7fa]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendConfirm}
                disabled={sendConfirming}
                className="flex-1 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-4 py-2.5 text-[12px] font-bold text-white hover:from-[#6d28d9] hover:to-[#5b21b6] disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {sendConfirming ? <Loader2 size={14} className="animate-spin" /> : null}
                {sendConfirming ? "Confirmando..." : "✅ Confirmar"}
              </button>
            </div>
          </div>
        )}

        {sendResult && (
          <div className={`rounded-xl px-4 py-2.5 text-[12px] font-medium mt-3 ${sendResult.success ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
            {sendResult.msg}
          </div>
        )}
      </div>

      {/* Cocos Tag */}
      <div className="rounded-2xl bg-white border border-[#e8edf5] p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <User size={16} className="text-[#7c3aed]" />
          <p className="text-[13px] font-bold text-[#1a2233]">Cocos Tag</p>
          {currentTag && <span className="text-[11px] font-mono bg-[#7c3aed]/10 text-[#7c3aed] px-2 py-0.5 rounded-lg font-bold">@{currentTag}</span>}
        </div>
        {!currentTag && (
          <div className="flex items-center gap-2">
            <input type="text" placeholder="Elegí tu tag..." value={tagName} onChange={(e) => { setTagName(e.target.value); setTagResult(null); }}
              className="flex-1 rounded-xl border border-[#e8edf5] bg-[#f8f9fb] px-3 py-2 text-[13px] text-[#1a2233] focus:outline-none focus:border-[#7c3aed]" />
            <button onClick={handleSetTag} disabled={tagLoading || !tagName.trim()}
              className="rounded-xl bg-[#7c3aed] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#6d28d9] transition-colors disabled:opacity-50">
              {tagLoading ? "..." : "Crear"}
            </button>
          </div>
        )}
        {tagResult && <p className={`text-[11px] mt-2 font-semibold ${tagResult.success ? "text-green-600" : "text-red-500"}`}>{tagResult.msg}</p>}
      </div>

      {/* Crear cuenta crypto */}
      <div className="rounded-2xl bg-white border border-[#e8edf5] p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-[#16a34a]" />
            <p className="text-[13px] font-bold text-[#1a2233]">Cuenta Crypto</p>
          </div>
          <button onClick={handleCreateCustomer} disabled={creating}
            className="rounded-xl bg-[#16a34a] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#15803d] transition-colors disabled:opacity-50">
            {creating ? "..." : "Crear Cuenta"}
          </button>
        </div>
        {createResult && <p className={`text-[11px] mt-2 font-semibold ${createResult.success ? "text-green-600" : "text-red-500"}`}>{createResult.msg}</p>}
      </div>

      {/* Portfolio */}
      {portfolio?.holdings && portfolio.holdings.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#e8edf5] p-4">
          <p className="text-[11px] font-semibold text-[#8895aa] uppercase tracking-wider mb-2">Portfolio</p>
          {portfolio.holdings.map((h: any) => (
            <div key={h.ticker} className="flex items-center justify-between py-2 border-b border-[#f0f2f5] last:border-0">
              <span className="text-[13px] font-bold text-[#1a2233]">{h.quantity} {h.ticker}</span>
              <span className="text-[13px] font-semibold text-[#16a34a]">{fmtARS(h.amountArs || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CryptoView;
