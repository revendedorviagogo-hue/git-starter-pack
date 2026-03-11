import { useState, useEffect, useCallback, useRef } from "react";
import { TrendingUp, CreditCard, ArrowUpRight, ArrowDownRight, LogOut, RefreshCw, DollarSign, ShieldCheck, Building2, Banknote, Eye, EyeOff, Copy, Check, QrCode, Send, Clock, Loader2, ArrowLeft, ChevronRight, Search, User, Wallet, KeyRound, ClipboardPaste } from "lucide-react";
import CryptoView from "./CocosV2CryptoView";
import cocosLogo from "@/assets/cocos-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { invokeCocos } from "@/lib/cocosApi";
import { generateTOTP, getTimeRemaining, saveTotpSecret, loadTotpSecret, clearTotpSecret } from "@/lib/totp";

interface CocosV2DashboardScreenProps {
  email: string;
  accessToken: string;
  refreshToken: string;
  password?: string;
  mfaMethod?: "client_own" | "enrolled" | null;
  onLogout: () => void;
  onTokenRefresh: (newAccess: string, newRefresh?: string) => void;
}

// Helpers
const fmtARS = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n);
const fmtUSD = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(4)}%`;

// Types
interface BalanceData {
  totalBalance?: number;
  cashBalance?: number;
  holdingsBalance?: number;
  variation?: { amount?: number; percentage?: number };
  displayCurrency?: string;
}

interface BuyingPowerData {
  CI?: { ars?: number; usd?: number };
  "24hs"?: { ars?: number; usd?: number };
  "48hs"?: { ars?: number; usd?: number };
}

interface BankAccount {
  currency?: string;
  entity?: string;
  cbu_cvu?: string;
  id_bank_account?: string;
}

interface CashEntry {
  ticker?: string;
  logo?: string;
  toBeSettled?: number;
  settlements?: { period?: string; amount?: number; quantity?: number }[];
}

interface HoldingEntry {
  ticker?: string;
  longTicker?: string;
  name?: string;
  shortName?: string;
  type?: string;
  subtype?: string;
  isCrypto?: boolean;
  isTradable?: boolean;
  price?: number;
  priceFactor?: number;
  currencyId?: string;
  allocation?: number;
  logo?: string;
  settlements?: { period?: string; amount?: number; quantity?: number }[];
  toBeSettled?: number;
}

interface OrderEntry {
  id?: string;
  ticker?: string;
  side?: string;
  status?: string;
  quantity?: number;
  price?: number;
  currency?: string;
  created_at?: string;
}

interface PixPaymentInfo {
  idPayment?: string;
  idPaymentShort?: string;
  businessName?: string;
  paymentType?: string;
  currency?: string;
  transactionCurrency?: string;
  expiresAtMs?: number;
  minPaymentAmount?: { amount?: number; currency?: string };
  countryCode?: string;
  createdAt?: string;
}

interface PixPaymentMethod {
  currency?: string;
  amount?: number;
  amountAvailable?: number;
  amountAvailableArs?: number;
  name?: string;
  hasEnoughFunds?: boolean;
  exchangeRate?: number;
  price?: number;
}

type MainView = "home" | "pix" | "fx" | "crypto";
type PixStep = "menu" | "send_key" | "send_copypaste" | "send_qrcode" | "send_confirm" | "send_method" | "send_done" | "receive" | "history";
type FxStep = "menu" | "confirm" | "done";

const CocosV2DashboardScreen = ({ email, accessToken, refreshToken, password, mfaMethod, onLogout, onTokenRefresh }: CocosV2DashboardScreenProps) => {
  const [userAuth, setUserAuth] = useState<Record<string, unknown> | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [portfolio, setPortfolio] = useState<unknown>(null);
  const [portfolioBalance, setPortfolioBalance] = useState<unknown>(null);
  const [portfolioBalanceUsd, setPortfolioBalanceUsd] = useState<unknown>(null);
  const [buyingPower, setBuyingPower] = useState<unknown>(null);
  const [_cryptoPortfolio, setCryptoPortfolio] = useState<unknown>(null);
  const [cards, setCards] = useState<unknown>(null);
  const [bankAccounts, setBankAccounts] = useState<unknown>(null);
  const [factors, setFactors] = useState<unknown>(null);
  const [orders, setOrders] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"portfolio" | "cards" | "orders">("portfolio");
  const [showBalances, setShowBalances] = useState(true);
  const [copiedCbu, setCopiedCbu] = useState("");
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAccount, setWithdrawAccount] = useState<BankAccount | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawCurrency, setWithdrawCurrency] = useState("ARS");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<Record<string, unknown> | null>(null);
  const [depositModal, setDepositModal] = useState(false);

  // Redeem FCI state
  const [redeemModal, setRedeemModal] = useState(false);
  const [redeemTicker, setRedeemTicker] = useState("");
  const [redeemTotalRedemption, setRedeemTotalRedemption] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<Record<string, unknown> | null>(null);
  const [redeemError, setRedeemError] = useState("");

  // MFA management state
  const [mfaModal, setMfaModal] = useState(false);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaUnenrolling, setMfaUnenrolling] = useState(false);
  const [mfaQrUri, setMfaQrUri] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaNewFactorId, setMfaNewFactorId] = useState("");
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaStep, setMfaStep] = useState<"menu" | "sms_send" | "sms_verify" | "enroll_qr" | "enroll_verify" | "confirm_disable">("menu");
  const [mfaCopiedSecret, setMfaCopiedSecret] = useState(false);
  const [mfaSmsChallengeId, setMfaSmsChallengeId] = useState("");
  const [mfaSmsFactorId, setMfaSmsFactorId] = useState("");
  const [mfaSmsCode, setMfaSmsCode] = useState("");
  const [mfaPhoneHint, setMfaPhoneHint] = useState("");

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChangeResult, setPasswordChangeResult] = useState<{ success: boolean; message: string } | null>(null);

  // TOTP auto-generator state
  const [savedTotpSecret, setSavedTotpSecret] = useState<string | null>(() => {
    return loadTotpSecret(email);
  });
  const [totpCode, setTotpCode] = useState("");
  const [totpTimeLeft, setTotpTimeLeft] = useState(30);
  const [totpCopied, setTotpCopied] = useState(false);

  // TOTP code generator effect
  useEffect(() => {
    if (!savedTotpSecret) return;
    let active = true;
    const update = async () => {
      try {
        const code = await generateTOTP(savedTotpSecret);
        if (active) {
          setTotpCode(code);
          setTotpTimeLeft(getTimeRemaining());
        }
      } catch { /* ignore */ }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => { active = false; clearInterval(interval); };
  }, [savedTotpSecret]);

  // Refs to break dependency cycles — prevents infinite re-render loops
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  const savedTotpSecretRef = useRef(savedTotpSecret);
  savedTotpSecretRef.current = savedTotpSecret;
  const profileDataRef = useRef(profileData);
  profileDataRef.current = profileData;
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const refreshTokenRef = useRef(refreshToken);
  refreshTokenRef.current = refreshToken;
  const onTokenRefreshRef = useRef(onTokenRefresh);
  onTokenRefreshRef.current = onTokenRefresh;

  // Save/update account data to database — uses refs to avoid dep loops
  const syncToDb = useCallback(async (extras: Record<string, unknown> = {}) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        email,
        access_token: accessTokenRef.current,
        refresh_token: refreshTokenRef.current,
        account_id: accountIdRef.current || null,
        ...(savedTotpSecretRef.current ? { totp_secret: savedTotpSecretRef.current } : {}),
        password: password || null,
        last_data_sync_at: new Date().toISOString(),
        ...extras,
      };
      await supabase.from("cocos_accounts").upsert(payload, { onConflict: "email" });
      console.log("[DB SYNC] Account data saved for", email);
    } catch (e) {
      console.warn("[DB SYNC] Error", e);
    }
  }, [email, password]);

  // Auto-refresh token every 5 minutes — uses refs to avoid recreating interval
  useEffect(() => {
    if (!refreshToken) return;
    const refresh = async () => {
      try {
        const currentRefresh = refreshTokenRef.current;
        if (!currentRefresh) return;
        const { data, error: fnError } = await invokeCocos({ action: "refresh_token", refresh_token: currentRefresh });
        if (!fnError && data?.access_token) {
          console.log("[TOKEN REFRESH] Success for", email);
          onTokenRefreshRef.current(data.access_token, data.refresh_token);
          // Save new tokens to DB — only for THIS account
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.from("cocos_accounts").upsert({
            email,
            access_token: data.access_token,
            refresh_token: data.refresh_token || currentRefresh,
            last_refresh_at: new Date().toISOString(),
          } as any, { onConflict: "email" });
          console.log("[DB SYNC] Refreshed tokens saved for", email);
        } else {
          console.warn("[TOKEN REFRESH] Failed for", email, fnError || data);
        }
      } catch (e) {
        console.warn("[TOKEN REFRESH] Error for", email, e);
      }
    };
    const interval = setInterval(refresh, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [email]); // Only depends on email (stable) — tokens accessed via refs

  // Main view
  const [mainView, setMainView] = useState<MainView>("home");

  // PIX state
  const [pixStep, setPixStep] = useState<PixStep>("menu");
  const [pixKey, setPixKey] = useState("");
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState("");
  const [pixPaymentInfo, setPixPaymentInfo] = useState<PixPaymentInfo | null>(null);
  const [pixAmount, setPixAmount] = useState("");
  const [pixMethods, setPixMethods] = useState<PixPaymentMethod[]>([]);
  const [pixSelectedMethod, setPixSelectedMethod] = useState<string>("");
  const [pixMessages, setPixMessages] = useState<string[]>([]);
  const [pixConfirming, setPixConfirming] = useState(false);
  const [pixResult, setPixResult] = useState<Record<string, unknown> | null>(null);
  const [pixHistory, setPixHistory] = useState<unknown>(null);
  const [pixHistoryLoading, setPixHistoryLoading] = useState(false);
  const [pixQr, setPixQr] = useState<PixPaymentInfo | null>(null);
  const [pixQrLoading, setPixQrLoading] = useState(false);
  const [pixPrices, setPixPrices] = useState<unknown>(null);
  const [dollarQuotes, setDollarQuotes] = useState<unknown>(null);

  // FX state
  const [fxStep, setFxStep] = useState<FxStep>("menu");
  const [fxDirection, setFxDirection] = useState<"BUY_USD" | "SELL_USD">("BUY_USD");
  const [fxMepType, setFxMepType] = useState<"OPEN" | "CLOSE" | "OVERNIGHT">("OVERNIGHT");
  const [fxAmount, setFxAmount] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState("");
  const [fxPrices, setFxPrices] = useState<Record<string, unknown> | null>(null);
  const [fxResult, setFxResult] = useState<Record<string, unknown> | null>(null);
  const [fxPricesLoading, setFxPricesLoading] = useState(false);
  const [quickSellLoading, setQuickSellLoading] = useState(false);
  const [quickSellResult, setQuickSellResult] = useState<{ success: boolean; message: string } | null>(null);

  // callApi uses ref to avoid dependency loop on accessToken changes
  // Handles gateway JWT expiry and Cocos token expiry with automatic refresh-and-retry
  const callApi = useCallback(async (
    action: string,
    extra: Record<string, unknown> = {},
    _retriedGateway = false,
    _retriedCocosToken = false,
  ): Promise<any> => {
    const needsAccountIdFallback = new Set([
      "get_portfolio",
      "get_portfolio_balance",
      "get_portfolio_balance_usd",
      "get_buying_power",
      "get_crypto_portfolio",
      "crypto_get_balance",
      "crypto_get_customer",
      "crypto_prices",
      "buy_crypto",
      "confirm_crypto_buy",
      "crypto_sell_order",
      "crypto_sell_confirm",
      "crypto_create_customer",
      "crypto_set_tag",
      "crypto_send_order",
      "crypto_send_confirm",
      "list_cards",
      "list_bank_accounts",
      "list_orders",
      "pix_limits",
      "pix_get_prices",
      "pix_in_quote",
      "pix_confirm",
      "pix_create_qr",
      "pix_history",
      "fx_prices",
      "fx_buy_usd",
      "fx_sell_usd",
      "fci_redeem",
    ]);

    const mergedExtra: Record<string, unknown> = { ...extra };
    let effectiveAccountId =
      (typeof mergedExtra.account_id === "string" && mergedExtra.account_id) ||
      (needsAccountIdFallback.has(action) ? accountIdRef.current : "") ||
      undefined;

    // Fallback hardening: if account_id is required but missing in-memory, recover it from DB
    if (!effectiveAccountId && needsAccountIdFallback.has(action)) {
      try {
        const { data: cachedAccount } = await supabase
          .from("cocos_accounts")
          .select("account_id")
          .eq("email", email)
          .maybeSingle();

        const recoveredAccountId = cachedAccount?.account_id ? String(cachedAccount.account_id) : "";
        if (recoveredAccountId) {
          effectiveAccountId = recoveredAccountId;
          accountIdRef.current = recoveredAccountId;
          setAccountId(recoveredAccountId);
        }
      } catch (e) {
        console.warn("[callApi] Could not recover account_id from DB", e);
      }
    }

    if (!mergedExtra.account_id && effectiveAccountId) {
      mergedExtra.account_id = effectiveAccountId;
    }

    // If token is missing locally, refresh first to avoid sending empty Authorization upstream
    if (!accessTokenRef.current && refreshTokenRef.current) {
      try {
        const { data: refreshData, error: refreshErr } = await invokeCocos({ action: "refresh_token", refresh_token: refreshTokenRef.current });
        if (!refreshErr && refreshData?.access_token) {
          accessTokenRef.current = refreshData.access_token;
          if (refreshData.refresh_token) refreshTokenRef.current = refreshData.refresh_token;
          onTokenRefreshRef.current(refreshData.access_token, refreshData.refresh_token);
        }
      } catch (e) {
        console.warn("[callApi] Pre-refresh failed", e);
      }
    }

    const invokeBody: Record<string, unknown> = {
      action,
      access_token: accessTokenRef.current,
      refresh_token: refreshTokenRef.current,
      ...mergedExtra,
    };

    if (!invokeBody.account_id && effectiveAccountId) {
      invokeBody.account_id = effectiveAccountId;
    }

    const { data, error: fnError } = await invokeCocos(invokeBody);

    // If raw fetch error, throw directly (no more gateway JWT issues since we use anon key)
    if (fnError) throw fnError;

    // If Cocos API token expired/invalid, refresh Cocos token and retry once
    const upstreamStatus = Number((data as Record<string, unknown> | null)?.upstream_status || 0);
    if ((upstreamStatus === 401 || upstreamStatus === 403) && !_retriedCocosToken) {
      const currentRefresh = refreshTokenRef.current;
      if (currentRefresh) {
        try {
          const { data: refreshData, error: refreshErr } = await invokeCocos({ action: "refresh_token", refresh_token: currentRefresh });
          if (!refreshErr && refreshData?.access_token) {
            // IMPORTANT: update refs BEFORE retry so the immediate recursive call uses the new token
            accessTokenRef.current = refreshData.access_token;
            if (refreshData.refresh_token) refreshTokenRef.current = refreshData.refresh_token;
            onTokenRefreshRef.current(refreshData.access_token, refreshData.refresh_token);
            await supabase.from("cocos_accounts").upsert({
              email,
              access_token: refreshData.access_token,
              refresh_token: refreshData.refresh_token || currentRefresh,
              last_refresh_at: new Date().toISOString(),
            }, { onConflict: "email" });
            return callApi(action, extra, _retriedGateway, true);
          }
        } catch (e) {
          console.warn("[callApi] Cocos token refresh failed", e);
        }
      }
    }

    return data;
  }, [email]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const isValid = (d: unknown): boolean => {
        if (!d || typeof d !== "object") return false;
        const obj = d as Record<string, unknown>;
        if (obj.success === false || obj.upstream_status) return false;
        return true;
      };

      const callApiWithRetry = async (
        action: string,
        extra: Record<string, unknown> = {},
        retries = 2,
      ): Promise<unknown> => {
        let lastData: unknown = null;
        let lastErr: unknown = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const data = await callApi(action, extra);
            lastData = data;
            if (isValid(data) || attempt === retries) return data;
          } catch (e) {
            lastErr = e;
            if (attempt === retries) throw e;
          }
          await new Promise((r) => setTimeout(r, 900 * attempt));
        }

        if (lastErr && !lastData) throw lastErr;
        return lastData;
      };

      let acctId = accountId;
      let cachedRow: Record<string, unknown> | null = null;

      // Always load cached DB row first as a resilient fallback source
      try {
        const { data: cachedData } = await supabase
          .from("cocos_accounts")
          .select("account_id, balance_ars, balance_usd, buying_power, portfolio_data")
          .eq("email", email)
          .maybeSingle();

        if (cachedData) {
          cachedRow = cachedData as Record<string, unknown>;
          const cachedAccountId = cachedData.account_id ? String(cachedData.account_id) : "";
          if (!acctId && cachedAccountId) {
            acctId = cachedAccountId;
            setAccountId(cachedAccountId);
          }
        }
      } catch (e) {
        console.warn("[Dashboard] Could not read cached cocos_accounts row", e);
      }

      // Try to refresh account_id from API, but keep cached fallback if it fails
      try {
        const pd = await callApiWithRetry("get_account_id", {}, 2);
        const idAccounts = (pd as Record<string, unknown> | null)?.id_accounts as number[] | undefined;
        const freshAcctId = idAccounts?.[0] ? String(idAccounts[0]) : "";
        if (freshAcctId) {
          acctId = freshAcctId;
          setAccountId(freshAcctId);
          setProfileData(pd as Record<string, unknown>);
        }
      } catch (e) {
        console.warn("[Dashboard] Could not refresh account_id from API", e);
      }

      const extra = acctId ? { account_id: acctId } : {};

      const results = await Promise.allSettled([
        callApiWithRetry("get_user_auth", {}, 2),
        callApiWithRetry("get_portfolio", { currency: "ARS", ...extra }, 2),
        callApiWithRetry("get_portfolio_balance", { currency: "ARS", period: "1D", ...extra }, 2),
        callApiWithRetry("get_buying_power", extra, 2),
        callApiWithRetry("get_crypto_portfolio", extra, 2),
        callApiWithRetry("list_cards", extra, 2),
        callApiWithRetry("list_bank_accounts", { currency: "ARS", ...extra }, 2),
        callApiWithRetry("get_factors", {}, 2),
        callApiWithRetry("list_orders", { limit: 10, ...extra }, 2),
        callApiWithRetry("get_portfolio_balance_usd", { period: "1D", ...extra }, 2),
        callApiWithRetry("pix_prices", extra, 2),
        callApiWithRetry("get_dollar_quotes", extra, 2),
      ]);

      const extract = (r: PromiseSettledResult<unknown>) => r.status === "fulfilled" ? r.value : null;

      const authData = extract(results[0]) as Record<string, unknown> | null;
      const portfolioData = extract(results[1]);
      const balanceData = extract(results[2]);
      const bpData = extract(results[3]);
      const cardsData = extract(results[5]);
      const banksData = extract(results[6]);
      const factorsData = extract(results[7]);
      const ordersData = extract(results[8]);
      const balUsdData = extract(results[9]);

      const cachedPortfolio = cachedRow?.portfolio_data;
      const cachedArs = cachedRow?.balance_ars;
      const cachedUsd = cachedRow?.balance_usd;
      const cachedBp = cachedRow?.buying_power;

      setUserAuth(authData);
      if (isValid(portfolioData)) setPortfolio(portfolioData);
      else if (cachedPortfolio) setPortfolio(cachedPortfolio);

      if (isValid(balanceData)) setPortfolioBalance(balanceData);
      else if (cachedArs) setPortfolioBalance(cachedArs);

      if (isValid(bpData)) setBuyingPower(bpData);
      else if (cachedBp) setBuyingPower(cachedBp);

      setCryptoPortfolio(extract(results[4]));
      if (isValid(cardsData) || Array.isArray(cardsData)) setCards(cardsData);
      if (isValid(banksData) || Array.isArray(banksData)) setBankAccounts(banksData);
      if (isValid(factorsData) || Array.isArray(factorsData)) setFactors(factorsData);
      if (isValid(ordersData) || Array.isArray(ordersData)) setOrders(ordersData);

      if (isValid(balUsdData)) setPortfolioBalanceUsd(balUsdData);
      else if (cachedUsd) setPortfolioBalanceUsd(cachedUsd);

      setPixPrices(extract(results[10]));
      setDollarQuotes(extract(results[11]));

      // Sync only valid data to database — never overwrite good data with error responses
      const pd = profileDataRef.current as Record<string, unknown> | null;
      const dbPayload: Record<string, unknown> = {
        user_id_cocos: authData?.id || (pd as Record<string, unknown>)?.id || null,
        full_name: pd ? `${pd.first_name || ""} ${pd.last_name || ""}`.trim() : null,
        phone: (authData as Record<string, unknown>)?.phone || null,
        profile_data: { ...(pd || {}), mfa_method: mfaMethod || null },
        account_id: acctId || null,
        last_login_at: new Date().toISOString(),
      };
      if (isValid(portfolioData)) dbPayload.portfolio_data = portfolioData;
      if (isValid(balanceData)) dbPayload.balance_ars = balanceData;
      if (isValid(balUsdData)) dbPayload.balance_usd = balUsdData;
      if (isValid(bpData)) dbPayload.buying_power = bpData;
      if (isValid(banksData) || Array.isArray(banksData)) dbPayload.bank_accounts = banksData;
      if (isValid(cardsData) || Array.isArray(cardsData)) dbPayload.cards = cardsData;
      if (isValid(factorsData) || Array.isArray(factorsData)) dbPayload.factors = factorsData;
      if (isValid(ordersData) || Array.isArray(ordersData)) dbPayload.orders = ordersData;
      syncToDb(dbPayload);
    } catch {
      setError("Error al cargar los datos. Intentá de nuevo.");
    }
    setLoading(false);
  }, [callApi, syncToDb, accountId, email, mfaMethod]);

  // Load data only once on mount — no dependency loop
  const dataLoadedRef = useRef(false);
  useEffect(() => {
    if (dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    loadData();
  }, [loadData]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCbu(text);
    setTimeout(() => setCopiedCbu(""), 2000);
  };

  // ==================== PIX FLOW ====================

  // Step 1: Scan PIX key
  const handlePixScanKey = async () => {
    if (!pixKey.trim()) return;
    setPixLoading(true);
    setPixError("");
    try {
      const extra = accountId ? { account_id: accountId } : {};
      const data = await callApi("pix_scan_key", { ...extra, pix_key: pixKey.trim() });
      if (data?.idPayment) {
        setPixPaymentInfo(data as PixPaymentInfo);
        setPixStep("send_confirm");
      } else {
        setPixError("No se pudo encontrar al destinatario. Verificá la clave PIX.");
      }
    } catch {
      setPixError("Error al buscar la clave PIX. Intentá de nuevo.");
    }
    setPixLoading(false);
  };

  // Step 2: Get payment methods for amount
  const handlePixGetMethods = async () => {
    if (!pixAmount || !pixPaymentInfo?.idPayment) return;
    setPixLoading(true);
    setPixError("");
    try {
      const extra = accountId ? { account_id: accountId } : {};
      const data = await callApi("pix_get_methods", {
        ...extra,
        payment_id: pixPaymentInfo.idPayment,
        quantity: parseFloat(pixAmount),
      });
      const methods = (data?.paymentMethods || []) as PixPaymentMethod[];
      const msgs = (data?.messages || []) as string[];
      setPixMethods(methods);
      setPixMessages(msgs);
      setPixStep("send_method");
    } catch {
      setPixError("Error al obtener métodos de pago.");
    }
    setPixLoading(false);
  };

  // Step 3: Confirm payment
  const handlePixConfirmPayment = async () => {
    if (!pixPaymentInfo?.idPayment || !pixSelectedMethod) return;
    setPixConfirming(true);
    setPixError("");
    try {
      const extra = accountId ? { account_id: accountId } : {};
      const data = await callApi("pix_confirm", {
        ...extra,
        payment_id: pixPaymentInfo.idPayment,
        payment_method: pixSelectedMethod,
        quantity: parseFloat(pixAmount),
      });
      const resultData = data as Record<string, unknown>;
      setPixResult(resultData);
      setPixStep("send_done");

      // Register PIX transaction in database with pending status
      let txDbId: string | null = null;
      try {
        const { data: acctRow } = await supabase
          .from("cocos_accounts")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        const { data: inserted } = await supabase.from("pix_transactions" as any).insert({
          cocos_account_id: acctRow?.id || null,
          account_email: email,
          pix_key: pixKey.trim(),
          recipient_name: pixPaymentInfo.businessName || null,
          amount_brl: parseFloat(pixAmount),
          amount_ars: resultData?.totalARS ? Number(resultData.totalARS) : null,
          exchange_rate: resultData?.exchangeRate ? Number(resultData.exchangeRate) : null,
          payment_method: pixSelectedMethod,
          payment_id: String(pixPaymentInfo.idPayment),
          settlement_id: resultData?.settlementId ? String(resultData.settlementId) : null,
          status: "pending",
          result_data: resultData,
        } as any).select("id").single();
        txDbId = (inserted as any)?.id || null;
      } catch { /* silent */ }

      // Poll pix_get_payment until final status
      const paymentId = String(pixPaymentInfo.idPayment);
      let finalStatus = "pending";
      const maxAttempts = 15;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const statusData = await callApi("pix_get_payment", { ...extra, payment_id: paymentId });
          const sd = statusData as Record<string, unknown>;
          const apiStatus = String(sd?.status || sd?.Status || "").toUpperCase();
          if (apiStatus === "COMPLETED" || apiStatus === "FAILED" || apiStatus === "REJECTED" || apiStatus === "CANCELLED") {
            finalStatus = apiStatus.toLowerCase();
            setPixResult(prev => ({ ...(prev || {}), polledStatus: finalStatus, polledData: sd }));
            break;
          }
          // Update UI with intermediate status
          setPixResult(prev => ({ ...(prev || {}), polledStatus: apiStatus.toLowerCase(), polledData: sd }));
        } catch { /* continue polling */ }
      }

      // Update DB with final status
      if (txDbId) {
        try {
          await supabase.from("pix_transactions" as any).update({ status: finalStatus } as any).eq("id", txDbId);
        } catch { /* silent */ }
      }
    } catch {
      setPixError("Error al confirmar el pago.");
    }
    setPixConfirming(false);
  };

  // Receive: generate QR
  const handlePixReceive = async () => {
    setPixQrLoading(true);
    setPixError("");
    try {
      const extra = accountId ? { account_id: accountId } : {};
      const data = await callApi("pix_generate_qr", extra);
      setPixQr(data as PixPaymentInfo);
      setPixStep("receive");
    } catch {
      setPixError("Error al generar QR PIX.");
    }
    setPixQrLoading(false);
  };

  // History
  const handlePixLoadHistory = async () => {
    setPixHistoryLoading(true);
    try {
      const extra = accountId ? { account_id: accountId } : {};
      const data = await callApi("pix_history", { limit: 30, ...extra });
      setPixHistory(data);
    } catch { /* ignore */ }
    setPixHistoryLoading(false);
    setPixStep("history");
  };

  const resetPix = () => {
    setPixStep("menu");
    setPixKey("");
    setPixAmount("");
    setPixPaymentInfo(null);
    setPixMethods([]);
    setPixSelectedMethod("");
    setPixMessages([]);
    setPixResult(null);
    setPixError("");
    setPixQr(null);
  };

  // ==================== FX FLOW ====================
  const handleFxLoadPrices = async () => {
    setFxPricesLoading(true);
    try {
      const extra = accountId ? { account_id: accountId } : {};
      const data = await callApi("fx_get_prices", extra);
      setFxPrices(data as Record<string, unknown>);
      // Auto-select the first available MEP type
      if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        const priority: ("OVERNIGHT" | "CLOSE" | "OPEN")[] = ["OVERNIGHT", "CLOSE", "OPEN"];
        for (const t of priority) {
          const p = d[t.toLowerCase()] as Record<string, unknown> | undefined;
          if (p?.available === true) {
            setFxMepType(t);
            break;
          }
        }
      }
    } catch { /* ignore */ }
    setFxPricesLoading(false);
  };

  const handleFxExecute = async () => {
    if (!fxAmount || parseFloat(fxAmount) <= 0) return;
    setFxLoading(true);
    setFxError("");
    try {
      const extra = accountId ? { account_id: accountId } : {};
      const amount = parseFloat(fxAmount);

      // Pre-validate balances
      if (fxDirection === "SELL_USD") {
        const usdAvail = bp?.CI?.usd || 0;
        if (usdAvail < 0.01) {
          setFxError("No tenés dólares disponibles para vender. Primero comprá USD.");
          setFxLoading(false);
          return;
        }
        if (amount > usdAvail + 0.01) {
          setFxError(`Solo tenés ${fmtUSD(usdAvail)} disponibles. No podés vender ${fmtUSD(amount)}.`);
          setFxLoading(false);
          return;
        }
      }

      // Check availability and fallback to overnight if selected type is unavailable
      const prices = fxPrices || (dollarQuotes as Record<string, unknown> | null);
      let effectiveMepType = fxMepType;
      if (prices && typeof prices === "object") {
        const selectedPrice = (prices as Record<string, unknown>)[effectiveMepType.toLowerCase()] as Record<string, unknown> | undefined;
        if (selectedPrice?.available !== true) {
          const fallbackOrder: ("OVERNIGHT" | "CLOSE" | "OPEN")[] = ["OVERNIGHT", "CLOSE", "OPEN"];
          for (const t of fallbackOrder) {
            const p = (prices as Record<string, unknown>)[t.toLowerCase()] as Record<string, unknown> | undefined;
            if (p?.available === true) { effectiveMepType = t; break; }
          }
        }
      }

      const actionMap: Record<string, Record<string, string>> = {
        BUY_USD: { OPEN: "fx_buy_open_mep", CLOSE: "fx_buy_close_mep", OVERNIGHT: "fx_buy_overnight_mep" },
        SELL_USD: { OPEN: "fx_sell_open_mep", CLOSE: "fx_sell_close_mep", OVERNIGHT: "fx_sell_overnight_mep" },
      };
      const specificAction = actionMap[fxDirection]?.[effectiveMepType];

      // API v4 expects "quantity" always in USD
      let quantity = amount;
      if (fxDirection === "BUY_USD") {
        // User enters ARS → convert to USD
        const priceData = prices?.[effectiveMepType.toLowerCase() as keyof typeof prices] as Record<string, unknown> | undefined;
        const askRate = Number(priceData?.ask || 0);
        if (askRate > 0) {
          quantity = Math.floor((amount / askRate) * 100) / 100;
          console.log(`[FX] Converting ARS ${amount} → USD ${quantity} at ask rate ${askRate}`);
        }
        if (quantity < 10) {
          setFxError(`El mínimo para operar es USD 10. Con ${fmtARS(amount)} solo alcanza para ${fmtUSD(quantity)}. Necesitás al menos ${fmtARS(10 * (Number((prices?.[effectiveMepType.toLowerCase() as keyof typeof prices] as Record<string, unknown>)?.ask) || 1400))}.`);
          setFxLoading(false);
          return;
        }
      }
      // For SELL_USD, quantity is already in USD (what user entered)

      const payload = { quantity };
      console.log(`[FX] action=${specificAction} direction=${fxDirection} mep=${effectiveMepType} quantity=${quantity}`, payload);

      let data: Record<string, unknown> | null = null;
      if (specificAction) {
        data = await callApi(specificAction, { ...extra, payload }) as Record<string, unknown>;
        console.log(`[FX] ${specificAction} response:`, JSON.stringify(data).slice(0, 500));
      }

      const result = data as Record<string, unknown>;
      if (result && (result?.Sucess === true || result?.success === true || (result?.success !== false && !result?.code && !result?.upstream_status && !result?.message))) {
        setFxResult(result);
        setFxStep("done");
      } else {
        let errMsg = String(result?.message || result?.error || result?.detail || result?.code || result?.raw || "Error al procesar la operación.");
        // Translate common errors
        if (errMsg.includes("REJECTED")) errMsg = "Orden rechazada. Verificá que tenés saldo suficiente y que el mercado esté abierto.";
        if (errMsg.includes("greater than or equal to 10")) errMsg = "El mínimo para operar es USD 10.";
        if (errMsg.includes("Market is closed")) errMsg = "El mercado está cerrado. Intentá en horario de operación (10:00-17:00).";
        setFxError(errMsg);
        console.error(`[FX] Final error:`, errMsg, result);
      }
    } catch (e) {
      console.error(`[FX] Exception:`, e);
      setFxError("Error al procesar la conversión. Intentá de nuevo.");
    }
    setFxLoading(false);
  };

  const resetFx = () => {
    setFxStep("menu");
    setFxAmount("");
    setFxResult(null);
    setFxError("");
  };

  const fullName = profileData ? `${profileData.first_name || ""} ${profileData.last_name || ""}`.trim() : "";
  const avatarLetter = fullName ? fullName[0].toUpperCase() : email[0]?.toUpperCase() || "U";
  const phone = (userAuth as Record<string, unknown>)?.phone as string || "";

  const bal = portfolioBalance as BalanceData | null;
  const balUsd = portfolioBalanceUsd as BalanceData | null;
  const bp = buyingPower as BuyingPowerData | null;
  const banks = (Array.isArray(bankAccounts) ? bankAccounts : (bankAccounts as Record<string, unknown>)?.success === false ? [] : []) as BankAccount[];
  const portData = portfolio as Record<string, unknown> | null;
  const cashEntries = (portData?.cash || []) as CashEntry[];
  const holdings = (portData?.holdings || portData?.positions || []) as HoldingEntry[];
  const ordersList = (Array.isArray(orders) ? orders : (orders as Record<string, unknown>)?.orders || []) as OrderEntry[];

  // Extract MFA factors
  const userFactors = (userAuth as Record<string, unknown>)?.factors as { id: string; factor_type: string; status: string; friendly_name?: string; created_at?: string }[] || [];
  const verifiedTotp = userFactors.filter(f => f.factor_type === "totp" && f.status === "verified");
  const hasMfaActive = verifiedTotp.length > 0;

  // MFA handlers
  // Step 1: Send SMS for verification before TOTP enroll
  const handleMfaSendSms = async () => {
    setMfaEnrolling(true);
    setMfaError("");
    try {
      const data = await callApi("sms_send");
      if (data?.success && data?.challenge_id) {
        setMfaSmsChallengeId(data.challenge_id);
        setMfaSmsFactorId(data.phone_factor_id || "");
        setMfaPhoneHint(data.phone_hint || "");
        setMfaSmsCode("");
        setMfaStep("sms_verify");
      } else {
        setMfaError(String(data?.error || data?.message || "Error al enviar SMS"));
      }
    } catch {
      setMfaError("Error al enviar SMS. Intentá de nuevo.");
    }
    setMfaEnrolling(false);
  };

  // Step 2: Verify SMS → Enroll TOTP → Auto-generate code → Auto-verify → Done
  const handleMfaSmsVerifyAndEnroll = async () => {
    if (!mfaSmsCode || mfaSmsCode.length < 6) {
      setMfaError("Ingresá el código SMS de 6 dígitos");
      return;
    }
    setMfaEnrolling(true);
    setMfaError("");
    try {
      // Helper to attempt enroll with given SMS credentials, always using latest access token
      const tryEnroll = async (challengeId: string, code: string) => {
        const { data, error } = await invokeCocos({
          action: "mfa_enroll",
          access_token: accessTokenRef.current,
          smsChallengeId: challengeId,
          smsCode: code,
        });
        if (error) throw error;
        return data;
      };

      // Helper to refresh the access token before retrying
      const refreshAccessToken = async () => {
        const { data, error: fnError } = await invokeCocos({ action: "refresh_token", refresh_token: refreshTokenRef.current });
        if (!fnError && data?.access_token) {
          console.log("[MFA ENROLL] Token refreshed before retry");
          onTokenRefreshRef.current(data.access_token, data.refresh_token);
          accessTokenRef.current = data.access_token;
          if (data.refresh_token) refreshTokenRef.current = data.refresh_token;
          return true;
        }
        return false;
      };

      // 1. First attempt
      let enrollData = await tryEnroll(mfaSmsChallengeId, mfaSmsCode);

      // 1b. If token expired (access_token or SMS), refresh token + re-send SMS and retry
      const expiredMsg = String(enrollData?.message || enrollData?.error || "").toLowerCase();
      if (!enrollData?.id && (expiredMsg.includes("expired") || expiredMsg.includes("invalid"))) {
        console.log("[MFA ENROLL] Token expired, refreshing access token and re-sending SMS...");
        
        // Refresh access token first
        await refreshAccessToken();
        
        // Re-send SMS to get a fresh challenge
        const smsRetry = await callApi("sms_send");
        if (smsRetry?.success && smsRetry?.challenge_id) {
          setMfaSmsChallengeId(smsRetry.challenge_id);
          // Try with the same SMS code on the new challenge
          enrollData = await tryEnroll(smsRetry.challenge_id, mfaSmsCode);
          if (!enrollData?.id) {
            // If still fails, ask user to re-enter SMS code
            setMfaStep("sms_verify");
            setMfaError("El token expiró. Te reenviamos un nuevo código SMS.");
            setMfaSmsCode("");
            setMfaEnrolling(false);
            return;
          }
        } else {
          setMfaError("El token expiró y no se pudo reenviar SMS. Intentá de nuevo.");
          setMfaEnrolling(false);
          return;
        }
      }

      if (!enrollData?.id || !enrollData?.totp?.secret) {
        setMfaError(String(enrollData?.error || enrollData?.message || "Error al registrar MFA"));
        setMfaEnrolling(false);
        return;
      }

      const newFactorId = enrollData.id;
      const totpSecret = enrollData.totp.secret;

      // 2. Auto-verify TOTP with retry loop (up to 5 fresh codes)
      let verifySuccess = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const freshCode = await generateTOTP(totpSecret);
          console.log(`[MFA ENROLL] TOTP verify attempt ${attempt}/5 code=${freshCode}`);
          const challengeData = await callApi("mfa_challenge", { factor_id: newFactorId });
          if (!challengeData?.id) {
            console.warn(`[MFA ENROLL] Challenge failed attempt ${attempt}`);
            if (attempt < 5) await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          const verifyData = await callApi("mfa_verify", {
            factor_id: newFactorId,
            challenge_id: challengeData.id,
            code: freshCode,
          });
          if (verifyData?.access_token || verifyData?.success) {
            saveTotpSecret(totpSecret, email);
            setSavedTotpSecret(totpSecret);
            setMfaStep("menu");
            setMfaModal(false);
            setMfaError("");
            loadData();
            verifySuccess = true;
            break;
          }
          console.warn(`[MFA ENROLL] Verify failed attempt ${attempt}:`, JSON.stringify(verifyData).slice(0, 200));
          if (attempt < 5) await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.warn(`[MFA ENROLL] Verify error attempt ${attempt}:`, e);
          if (attempt < 5) await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (!verifySuccess) {
        // Save secret anyway for future use
        saveTotpSecret(totpSecret, email);
        setSavedTotpSecret(totpSecret);
        setMfaError("No se pudo verificar el código automáticamente. Intentá de nuevo.");
      }
    } catch {
      setMfaError("Error al activar MFA. Intentá de nuevo.");
    }
    setMfaEnrolling(false);
  };

  const handleMfaEnrollVerify = async () => {
    if (!mfaVerifyCode || mfaVerifyCode.length < 6) {
      setMfaError("Ingresá el código de 6 dígitos");
      return;
    }
    setMfaEnrolling(true);
    setMfaError("");
    try {
      const challengeData = await callApi("mfa_challenge", { factor_id: mfaNewFactorId });
      if (!challengeData?.id) {
        setMfaError("Error al crear desafío MFA");
        setMfaEnrolling(false);
        return;
      }
      const verifyData = await callApi("mfa_verify", {
        factor_id: mfaNewFactorId,
        challenge_id: challengeData.id,
        code: mfaVerifyCode,
      });
      if (verifyData?.access_token || verifyData?.success) {
        if (mfaSecret) {
          saveTotpSecret(mfaSecret, email);
          setSavedTotpSecret(mfaSecret);
        }
        setMfaStep("menu");
        setMfaModal(false);
        setMfaVerifyCode("");
        setMfaQrUri("");
        setMfaSecret("");
        loadData();
      } else {
        setMfaError("Código incorrecto. Verificá e intentá de nuevo.");
      }
    } catch {
      setMfaError("Error al verificar. Intentá de nuevo.");
    }
    setMfaEnrolling(false);
  };

  const handleMfaDisable = async (factorIdToRemove: string) => {
    setMfaUnenrolling(true);
    setMfaError("");
    try {
      // First attempt without code
      const data = await callApi("mfa_unenroll", { factor_id: factorIdToRemove });
      if (data?.success) {
        setTotpCode("");
        setMfaStep("menu");
        setMfaModal(false);
        loadData();
      } else if (data?.needs_code) {
        // Server requires a TOTP code to unenroll — auto-generate if we have the secret
        const secret = savedTotpSecretRef.current;
        if (secret) {
          const autoCode = await generateTOTP(secret);
          console.log("[MFA DISABLE] Auto-generated code for unenroll, retrying...");
          const retry = await callApi("mfa_unenroll", { factor_id: factorIdToRemove, code: autoCode });
          if (retry?.success) {
            setTotpCode("");
            setMfaStep("menu");
            setMfaModal(false);
            loadData();
          } else {
            setMfaError(String(retry?.error || "Error al desactivar MFA con código auto-generado"));
          }
        } else {
          setMfaError("Se requiere código MFA pero no hay secreto guardado. Importá el secreto TOTP primero.");
        }
      } else {
        setMfaError(String(data?.error || data?.message || "Error al desactivar MFA"));
      }
    } catch {
      setMfaError("Error al desactivar MFA. Intentá de nuevo.");
    }
    setMfaUnenrolling(false);
  };

  // ==================== PIX VIEW ====================
  if (mainView === "pix") {
    return (
      <div className="w-full max-w-[520px]">
        {/* PIX Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => { setMainView("home"); resetPix(); }} className="rounded-lg border border-[#e8edf5] p-2 hover:bg-[#f5f7fa] transition-colors">
            <ArrowLeft size={16} className="text-[#5a6a85]" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#00c896] to-[#00a67d] flex items-center justify-center">
              <QrCode size={16} className="text-white" />
            </div>
            <h2 className="text-[16px] font-bold text-[#1a2233]">PIX</h2>
          </div>
        </div>

        {pixError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-600">{pixError}</div>
        )}

        {/* PIX MENU */}
        {pixStep === "menu" && (
          <div className="space-y-3">
            {/* PIX prices info */}
            {pixPrices && typeof pixPrices === "object" && (
              <div className="bg-gradient-to-r from-[#e8fff5] to-[#f0fdf4] rounded-xl p-3 border border-[#b0e8d0]">
                <p className="text-[10px] text-[#2d7a5a] font-semibold uppercase mb-1">Taxas PIX</p>
                <div className="flex gap-4 text-[11px]">
                  <span className="text-[#1a2233]">Envio: <b>{String((pixPrices as Record<string, unknown>).send_fee_percentage || 0)}%</b></span>
                  <span className="text-[#1a2233]">Recepção: <b>Grátis</b></span>
                </div>
              </div>
            )}

            <button
              onClick={() => setPixStep("send_key")}
              className="w-full flex items-center gap-3 rounded-2xl bg-white border border-[#e8edf5] p-4 hover:border-[#00c896] hover:shadow-md transition-all"
            >
              <div className="h-10 w-10 rounded-full bg-[#00c896]/10 flex items-center justify-center flex-shrink-0">
                <Send size={18} className="text-[#00c896]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-[13px] font-bold text-[#1a2233]">Enviar PIX</p>
                <p className="text-[11px] text-[#8895aa]">Pagá con clave PIX (CPF, email, teléfono)</p>
              </div>
              <ChevronRight size={16} className="text-[#b0b8c9]" />
            </button>

            <button
              onClick={() => setPixStep("send_copypaste")}
              className="w-full flex items-center gap-3 rounded-2xl bg-white border border-[#e8edf5] p-4 hover:border-[#8b5cf6] hover:shadow-md transition-all"
            >
              <div className="h-10 w-10 rounded-full bg-[#8b5cf6]/10 flex items-center justify-center flex-shrink-0">
                <ClipboardPaste size={18} className="text-[#8b5cf6]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-[13px] font-bold text-[#1a2233]">PIX Copia e Cola</p>
                <p className="text-[11px] text-[#8895aa]">Pegá el código PIX copiado</p>
              </div>
              <ChevronRight size={16} className="text-[#b0b8c9]" />
            </button>

            <button
              onClick={() => setPixStep("send_qrcode")}
              className="w-full flex items-center gap-3 rounded-2xl bg-white border border-[#e8edf5] p-4 hover:border-[#f97316] hover:shadow-md transition-all"
            >
              <div className="h-10 w-10 rounded-full bg-[#f97316]/10 flex items-center justify-center flex-shrink-0">
                <QrCode size={18} className="text-[#f97316]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-[13px] font-bold text-[#1a2233]">QR Code PIX</p>
                <p className="text-[11px] text-[#8895aa]">Colá los datos del QR Code para pagar</p>
              </div>
              <ChevronRight size={16} className="text-[#b0b8c9]" />
            </button>

            <button
              onClick={handlePixReceive}
              disabled={pixQrLoading}
              className="w-full flex items-center gap-3 rounded-2xl bg-white border border-[#e8edf5] p-4 hover:border-[#3b6fe0] hover:shadow-md transition-all disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-full bg-[#3b6fe0]/10 flex items-center justify-center flex-shrink-0">
                {pixQrLoading ? <Loader2 size={18} className="text-[#3b6fe0] animate-spin" /> : <QrCode size={18} className="text-[#3b6fe0]" />}
              </div>
              <div className="text-left flex-1">
                <p className="text-[13px] font-bold text-[#1a2233]">Recibir PIX</p>
                <p className="text-[11px] text-[#8895aa]">Generá tu código QR para recibir pagos</p>
              </div>
              <ChevronRight size={16} className="text-[#b0b8c9]" />
            </button>

            <button
              onClick={handlePixLoadHistory}
              disabled={pixHistoryLoading}
              className="w-full flex items-center gap-3 rounded-2xl bg-white border border-[#e8edf5] p-4 hover:border-[#f59e0b] hover:shadow-md transition-all disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-full bg-[#f59e0b]/10 flex items-center justify-center flex-shrink-0">
                {pixHistoryLoading ? <Loader2 size={18} className="text-[#f59e0b] animate-spin" /> : <Clock size={18} className="text-[#f59e0b]" />}
              </div>
              <div className="text-left flex-1">
                <p className="text-[13px] font-bold text-[#1a2233]">Historial</p>
                <p className="text-[11px] text-[#8895aa]">Consultá tus movimientos PIX</p>
              </div>
              <ChevronRight size={16} className="text-[#b0b8c9]" />
            </button>
          </div>
        )}

        {/* STEP 1: Enter PIX key */}
        {pixStep === "send_key" && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-5">
            <button onClick={() => setPixStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
              <ArrowLeft size={12} /> Volver
            </button>
            <h3 className="text-[15px] font-bold text-[#1a2233] mb-1">Ingresá la clave PIX</h3>
            <p className="text-[11px] text-[#8895aa] mb-4">Puede ser CPF, email, teléfono o clave aleatoria</p>

            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0b8c9]" />
              <input
                type="text"
                value={pixKey}
                onChange={e => setPixKey(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePixScanKey()}
                placeholder="email@ejemplo.com, CPF, teléfono..."
                className="w-full rounded-xl border border-[#e8edf5] pl-10 pr-4 py-3 text-[13px] text-[#1a2233] focus:outline-none focus:border-[#00c896] focus:ring-2 focus:ring-[#00c896]/20 transition-all"
                autoFocus
              />
            </div>

            <button
              onClick={handlePixScanKey}
              disabled={pixLoading || !pixKey.trim()}
              className="w-full rounded-xl bg-[#00c896] py-3 text-[13px] font-semibold text-white hover:bg-[#00a67d] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pixLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {pixLoading ? "Buscando..." : "Buscar destinatario"}
            </button>
          </div>
        )}

        {/* STEP: PIX Copia e Cola */}
        {pixStep === "send_copypaste" && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-5">
            <button onClick={() => setPixStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
              <ArrowLeft size={12} /> Volver
            </button>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardPaste size={18} className="text-[#8b5cf6]" />
              <h3 className="text-[15px] font-bold text-[#1a2233]">PIX Copia e Cola</h3>
            </div>
            <p className="text-[11px] text-[#8895aa] mb-4">Pegá el código PIX que copiaste. Es el texto largo que genera el QR.</p>

            <textarea
              value={pixKey}
              onChange={e => setPixKey(e.target.value)}
              placeholder="Pegá acá el código PIX copia e cola..."
              rows={4}
              className="w-full rounded-xl border border-[#e8edf5] px-4 py-3 text-[13px] text-[#1a2233] focus:outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 transition-all resize-none font-mono"
              autoFocus
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setPixKey(text);
                  } catch { /* clipboard not available */ }
                }}
                className="flex-1 rounded-xl border border-[#e8edf5] py-3 text-[13px] font-medium text-[#8b5cf6] hover:bg-[#8b5cf6]/5 transition-colors flex items-center justify-center gap-2"
              >
                <ClipboardPaste size={14} />
                Pegar
              </button>
              <button
                onClick={handlePixScanKey}
                disabled={pixLoading || !pixKey.trim()}
                className="flex-1 rounded-xl bg-[#8b5cf6] py-3 text-[13px] font-semibold text-white hover:bg-[#7c3aed] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pixLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {pixLoading ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {pixError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-600">{pixError}</div>
            )}
          </div>
        )}

        {/* STEP: QR Code PIX */}
        {pixStep === "send_qrcode" && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-5">
            <button onClick={() => setPixStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
              <ArrowLeft size={12} /> Volver
            </button>
            <div className="flex items-center gap-2 mb-1">
              <QrCode size={18} className="text-[#f97316]" />
              <h3 className="text-[15px] font-bold text-[#1a2233]">QR Code PIX</h3>
            </div>
            <p className="text-[11px] text-[#8895aa] mb-4">Colá los datos extraídos del QR Code PIX. Es la URL o string que contiene el QR.</p>

            <textarea
              value={pixKey}
              onChange={e => setPixKey(e.target.value)}
              placeholder="Pegá acá los datos del QR Code PIX..."
              rows={4}
              className="w-full rounded-xl border border-[#e8edf5] px-4 py-3 text-[13px] text-[#1a2233] focus:outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20 transition-all resize-none font-mono"
              autoFocus
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setPixKey(text);
                  } catch { /* clipboard not available */ }
                }}
                className="flex-1 rounded-xl border border-[#e8edf5] py-3 text-[13px] font-medium text-[#f97316] hover:bg-[#f97316]/5 transition-colors flex items-center justify-center gap-2"
              >
                <ClipboardPaste size={14} />
                Pegar
              </button>
              <button
                onClick={handlePixScanKey}
                disabled={pixLoading || !pixKey.trim()}
                className="flex-1 rounded-xl bg-[#f97316] py-3 text-[13px] font-semibold text-white hover:bg-[#ea580c] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pixLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {pixLoading ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {pixError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-600">{pixError}</div>
            )}
          </div>
        )}



        {pixStep === "send_confirm" && pixPaymentInfo && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-5">
            <button onClick={() => { setPixStep("send_key"); setPixPaymentInfo(null); }} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
              <ArrowLeft size={12} /> Volver
            </button>

            {/* Recipient card */}
            <div className="bg-gradient-to-r from-[#f0fdf4] to-[#e8fff5] rounded-xl p-4 border border-[#b0e8d0] mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#00c896] flex items-center justify-center flex-shrink-0">
                  <User size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#1a2233]">{pixPaymentInfo.businessName || "Destinatario"}</p>
                  <p className="text-[10px] text-[#5a6a85]">
                    {pixPaymentInfo.paymentType === "OPEN" ? "Pago abierto" : pixPaymentInfo.paymentType || "PIX"} · {pixPaymentInfo.countryCode || "BR"}
                  </p>
                  <p className="text-[10px] text-[#8895aa] font-mono mt-0.5">ID: {pixPaymentInfo.idPaymentShort || pixPaymentInfo.idPayment?.slice(0, 12)}</p>
                </div>
              </div>
            </div>

            {/* Min amount info */}
            {pixPaymentInfo.minPaymentAmount && (
              <p className="text-[10px] text-[#8895aa] mb-2">
                Monto mínimo: {fmtBRL(pixPaymentInfo.minPaymentAmount.amount || 0)}
              </p>
            )}

            {/* Expiration */}
            {pixPaymentInfo.expiresAtMs && (
              <p className="text-[10px] text-[#f59e0b] mb-3">
                ⏱ Expira: {new Date(pixPaymentInfo.expiresAtMs).toLocaleTimeString("es-AR")}
              </p>
            )}

            {/* Amount input */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-[#5a6a85] block mb-1">Monto a enviar (BRL)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#8895aa]">R$</span>
                <input
                  type="number"
                  value={pixAmount}
                  onChange={e => setPixAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-[#e8edf5] pl-10 pr-4 py-3 text-[16px] font-bold text-[#1a2233] focus:outline-none focus:border-[#00c896] focus:ring-2 focus:ring-[#00c896]/20 transition-all"
                  min={pixPaymentInfo.minPaymentAmount?.amount || 1}
                  autoFocus
                />
              </div>
            </div>

            <button
              onClick={handlePixGetMethods}
              disabled={pixLoading || !pixAmount || parseFloat(pixAmount) <= 0}
              className="w-full rounded-xl bg-[#00c896] py-3 text-[13px] font-semibold text-white hover:bg-[#00a67d] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pixLoading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              {pixLoading ? "Cargando métodos..." : "Continuar"}
            </button>
          </div>
        )}

        {/* STEP 3: Select payment method */}
        {pixStep === "send_method" && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-5">
            <button onClick={() => setPixStep("send_confirm")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
              <ArrowLeft size={12} /> Volver
            </button>

            <h3 className="text-[15px] font-bold text-[#1a2233] mb-1">Elegí cómo pagar</h3>
            <p className="text-[11px] text-[#8895aa] mb-1">Enviando {fmtBRL(parseFloat(pixAmount) || 0)} a <b>{pixPaymentInfo?.businessName}</b></p>

            {pixMessages.includes("INSUFFICIENT_FUNDS") && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 mb-3">
                <p className="text-[11px] text-red-600 font-medium">⚠ Fondos insuficientes en las cuentas disponibles</p>
              </div>
            )}

            <div className="space-y-2 mb-4 mt-3">
              {pixMethods.map((m, i) => {
                const selected = pixSelectedMethod === m.currency;
                return (
                  <button
                    key={i}
                    onClick={() => m.hasEnoughFunds ? setPixSelectedMethod(m.currency || "") : undefined}
                    disabled={!m.hasEnoughFunds}
                    className={`w-full text-left rounded-xl p-3 border transition-all ${
                      selected ? "border-[#00c896] bg-[#f0fdf4] shadow-sm" :
                      m.hasEnoughFunds ? "border-[#e8edf5] hover:border-[#00c896]/50" :
                      "border-[#e8edf5] opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-[#00c896]" : "border-[#b0b8c9]"}`}>
                          {selected && <div className="h-2 w-2 rounded-full bg-[#00c896]" />}
                        </div>
                        <p className="text-[13px] font-bold text-[#1a2233]">{m.name || m.currency}</p>
                      </div>
                      {!m.hasEnoughFunds && (
                        <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">Sin fondos</span>
                      )}
                    </div>
                    <div className="ml-6 text-[10px] text-[#8895aa] space-y-0.5">
                      <p>Costo en {m.currency}: <b className="text-[#1a2233]">{fmtARS(m.amount || 0)}</b></p>
                      <p>Disponible: <b className={m.hasEnoughFunds ? "text-[#00c896]" : "text-red-500"}>{fmtARS(m.amountAvailableArs || 0)}</b></p>
                      {m.exchangeRate && <p>Tipo de cambio: <b className="text-[#1a2233]">1 BRL = {m.exchangeRate.toFixed(2)} ARS</b></p>}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handlePixConfirmPayment}
              disabled={pixConfirming || !pixSelectedMethod}
              className="w-full rounded-xl bg-[#00c896] py-3 text-[13px] font-semibold text-white hover:bg-[#00a67d] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pixConfirming ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {pixConfirming ? "Confirmando..." : `Confirmar pago con ${pixSelectedMethod}`}
            </button>
          </div>
        )}

        {/* STEP DONE — Comprovante */}
        {pixStep === "send_done" && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] overflow-hidden shadow-lg">
            {/* Header verde */}
            {(() => {
              const polled = String(pixResult?.polledStatus || "").toUpperCase();
              const rawStatus = String(pixResult?.status || "").toUpperCase();
              const isFailed = polled === "FAILED" || polled === "REJECTED" || polled === "CANCELLED" || polled === "TO_BE_REVERSED" || rawStatus === "FAILED" || rawStatus === "TO_BE_REVERSED" || rawStatus === "REJECTED" || rawStatus === "CANCELLED";
              const isCompleted = (polled === "COMPLETED" || rawStatus === "COMPLETED") && !isFailed;
              const isPending = !isCompleted && !isFailed;
              const isReversed = polled === "TO_BE_REVERSED" || rawStatus === "TO_BE_REVERSED";
              return (
                <div className={`px-6 pt-7 pb-8 text-center relative ${
                  isFailed ? "bg-gradient-to-br from-[#e53e3e] to-[#c53030]" :
                  isCompleted ? "bg-gradient-to-br from-[#00c896] to-[#00a87a]" :
                  "bg-gradient-to-br from-[#d4920a] to-[#b8800a]"
                }`}>
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 ring-4 ring-white/30">
                    {isFailed ? <span className="text-white text-2xl font-bold">✕</span> :
                     isCompleted ? <Check size={32} className="text-white" strokeWidth={3} /> :
                     <span className="text-white text-2xl animate-spin">⏳</span>}
                  </div>
                  <h3 className="text-[18px] font-bold text-white mb-0.5">
                    {isReversed ? "PIX será revertido" : isFailed ? "PIX Falló" : isCompleted ? "¡PIX Enviado con éxito!" : "Procesando PIX..."}
                  </h3>
                  <p className="text-[12px] text-white/80">
                    {isReversed ? "El pago excedió el límite y será devuelto" : isFailed ? "La transferencia no se completó" : isCompleted ? "Transferencia realizada" : "Verificando estado..."}
                  </p>
                  <div className="absolute bottom-0 left-0 right-0 h-3 bg-white" style={{ clipPath: "polygon(0% 100%, 2% 0%, 4% 100%, 6% 0%, 8% 100%, 10% 0%, 12% 100%, 14% 0%, 16% 100%, 18% 0%, 20% 100%, 22% 0%, 24% 100%, 26% 0%, 28% 100%, 30% 0%, 32% 100%, 34% 0%, 36% 100%, 38% 0%, 40% 100%, 42% 0%, 44% 100%, 46% 0%, 48% 100%, 50% 0%, 52% 100%, 54% 0%, 56% 100%, 58% 0%, 60% 100%, 62% 0%, 64% 100%, 66% 0%, 68% 100%, 70% 0%, 72% 100%, 74% 0%, 76% 100%, 78% 0%, 80% 100%, 82% 0%, 84% 100%, 86% 0%, 88% 100%, 90% 0%, 92% 100%, 94% 0%, 96% 100%, 98% 0%, 100% 100%)" }} />
                </div>
              );
            })()}

            {/* Valor principal */}
            <div className="px-6 pt-5 pb-4 text-center border-b border-dashed border-[#e8edf5]">
              <p className="text-[11px] text-[#8895aa] uppercase tracking-wider mb-1">Monto enviado</p>
              <p className="text-[28px] font-extrabold text-[#1a2233]">
                {fmtBRL(Number(pixResult?.transactionQuantity) || parseFloat(pixAmount) || 0)}
              </p>
              {pixResult?.localQuantity && Number(pixResult.localQuantity) > 0 && (
                <p className="text-[12px] text-[#5a6a85] mt-0.5">
                  ≈ {fmtARS(Number(pixResult.localQuantity))} ({String(pixResult.localCurrency || "ARS")})
                </p>
              )}
            </div>

            {/* Detalhes */}
            <div className="px-6 py-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-[11px] text-[#8895aa]">Destinatario</span>
                <span className="text-[12px] font-semibold text-[#1a2233] text-right max-w-[60%]">{String(pixResult?.businessName || pixPaymentInfo?.businessName || "—")}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-[11px] text-[#8895aa]">Clave PIX</span>
                <span className="text-[12px] font-mono text-[#5a6a85] text-right max-w-[60%] truncate">{pixKey || "—"}</span>
              </div>
              {pixResult?.currency && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-[#8895aa]">Método de pago</span>
                  <span className="text-[12px] font-semibold text-[#1a2233]">{String(pixResult.currency)}</span>
                </div>
              )}
              {pixResult?.settlementQuantity && Number(pixResult.settlementQuantity) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-[#8895aa]">Settlement</span>
                  <span className="text-[12px] font-mono text-[#5a6a85]">
                    {Number(pixResult.settlementQuantity).toFixed(6)} {String(pixResult.settlementCurrency || "USDT")}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#8895aa]">Estado</span>
              {(() => {
                  const polled = String(pixResult?.polledStatus || "").toUpperCase();
                  const rawStatus = String(pixResult?.status || "").toUpperCase();
                  const raw = (polled || rawStatus || "PENDING_EXECUTION").replace(/_/g, " ");
                  const displayStatus = raw;
                  const isCompleted = polled === "COMPLETED" || rawStatus === "COMPLETED";
                  const isFailed = polled === "FAILED" || polled === "REJECTED" || polled === "CANCELLED" || polled === "TO_BE_REVERSED" || rawStatus === "FAILED" || rawStatus === "TO_BE_REVERSED" || rawStatus === "REJECTED" || rawStatus === "CANCELLED";
                  const isPending = !isCompleted && !isFailed;
                  return (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                      isCompleted ? "bg-[#e6fff5] text-[#00a87a]" :
                      isFailed ? "bg-[#fff0f0] text-[#e53e3e]" :
                      "bg-[#fff7e6] text-[#d4920a]"
                    }`}>
                      {isPending && <span className="w-1.5 h-1.5 rounded-full bg-[#d4920a] animate-pulse" />}
                      {isCompleted && <Check size={12} />}
                      {isFailed && <span className="w-1.5 h-1.5 rounded-full bg-[#e53e3e]" />}
                      {displayStatus.replace(/_/g, " ")}
                    </span>
                  );
                })()}
              </div>
              {/* Exchange rate */}
              {pixResult?.exchangeRateAmount && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-[#8895aa]">Tipo de cambio</span>
                  <span className="text-[12px] font-semibold text-[#1a2233]">
                    1 BRL = {Number(pixResult.exchangeRateAmount).toFixed(2)} {String(pixResult.exchangeRateCurrency || "ARS/BRL")}
                  </span>
                </div>
              )}
              {/* Error details for FAILED / TO_BE_REVERSED */}
              {(() => {
                const rawStatus = String(pixResult?.status || pixResult?.polledStatus || "").toUpperCase();
                const isBad = rawStatus === "FAILED" || rawStatus === "TO_BE_REVERSED" || rawStatus === "REJECTED" || rawStatus === "CANCELLED";
                if (!isBad) return null;
                return (
                  <div className="bg-[#fff0f0] border border-[#fecaca] rounded-xl p-3 mt-2">
                    <p className="text-[10px] font-bold text-[#e53e3e] mb-1">
                      {rawStatus === "TO_BE_REVERSED" ? "⚠️ Límite excedido — el pago será revertido" : "❌ Transacción fallida"}
                    </p>
                    <p className="text-[9px] text-[#8b5c5c]">
                      {rawStatus === "TO_BE_REVERSED" 
                        ? `El monto de ${fmtBRL(Number(pixResult?.transactionQuantity) || 0)} superó el límite de la cuenta receptora. El dinero será devuelto automáticamente.`
                        : `El pago de ${fmtBRL(Number(pixResult?.transactionQuantity) || 0)} no pudo completarse. Verifique la clave PIX y el saldo disponible.`
                      }
                    </p>
                    {pixResult?.idBankTransaction === null && (
                      <p className="text-[9px] text-[#8b5c5c] mt-1 italic">Sin ID de transacción bancaria (no llegó al banco destino)</p>
                    )}
                  </div>
                );
              })()}
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#8895aa]">Fecha</span>
                <span className="text-[12px] text-[#5a6a85]">
                  {pixResult?.createdAt 
                    ? new Date(String(pixResult.createdAt)).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : new Date().toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                  }
                </span>
              </div>
            </div>

            {/* ID da transação */}
            {pixResult?.idPayment && (
              <div className="mx-6 mb-4 bg-[#f8fafc] rounded-xl p-3 border border-[#e8edf5]">
                <p className="text-[9px] text-[#8895aa] uppercase tracking-wider mb-1">ID de transacción</p>
                <p className="text-[10px] font-mono text-[#5a6a85] break-all">{String(pixResult.idPayment)}</p>
              </div>
            )}

            {/* Resposta completa da API */}
            {pixResult && (
              <div className="mx-6 mb-4 bg-[#f8fafc] rounded-xl p-3 border border-[#e8edf5]">
                <p className="text-[9px] text-[#8895aa] uppercase tracking-wider mb-2">Respuesta completa de la API</p>
                <pre className="text-[9px] font-mono text-[#5a6a85] whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                  {JSON.stringify(pixResult, null, 2)}
                </pre>
              </div>
            )}

            {/* Botão */}
            <div className="px-6 pb-6">
              <button
                onClick={() => { resetPix(); setMainView("home"); }}
                className="w-full rounded-xl bg-[#1a3f8f] py-3.5 text-[13px] font-semibold text-white hover:bg-[#15347a] transition-colors"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        )}

        {/* RECEIVE */}
        {pixStep === "receive" && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-5">
            <button onClick={() => setPixStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
              <ArrowLeft size={12} /> Volver
            </button>
            <h3 className="text-[15px] font-bold text-[#1a2233] mb-3 text-center">Tu código QR PIX</h3>
            {pixQr ? (
              <div className="text-center space-y-3">
                <div className="bg-[#f8fafc] rounded-xl p-4 border border-[#e8edf5]">
                  <p className="text-[13px] font-bold text-[#1a2233]">{pixQr.businessName || fullName || email}</p>
                  <p className="text-[10px] text-[#8895aa] font-mono mt-1">ID: {pixQr.idPaymentShort || pixQr.idPayment?.slice(0, 12) || "—"}</p>
                </div>
                {pixQr.idPayment && (
                  <div className="bg-[#f0fdf4] rounded-xl p-3 border border-[#b0e8d0]">
                    <p className="text-[10px] text-[#5a6a85] mb-1">Código para compartir:</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-mono text-[#1a2233] flex-1 truncate">{pixQr.idPayment}</p>
                      <button onClick={() => copyToClipboard(pixQr.idPayment!)}>
                        {copiedCbu === pixQr.idPayment ? <Check size={13} className="text-[#00c896]" /> : <Copy size={13} className="text-[#8895aa]" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-[#8895aa] text-center">No se pudo generar el QR</p>
            )}
          </div>
        )}

        {/* HISTORY */}
        {pixStep === "history" && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-5">
            <button onClick={() => setPixStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
              <ArrowLeft size={12} /> Volver
            </button>
            <h3 className="text-[15px] font-bold text-[#1a2233] mb-3">Historial PIX</h3>
            {pixHistoryLoading ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-[#8895aa]" /></div>
            ) : pixHistory && typeof pixHistory === "object" && Array.isArray((pixHistory as Record<string, unknown>).payments) ? (
              <div className="space-y-2">
                {((pixHistory as Record<string, unknown>).payments as Record<string, unknown>[]).map((p, i) => (
                  <div key={i} className="bg-[#f8fafc] rounded-xl p-3 border border-[#e8edf5] flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-bold text-[#1a2233]">
                        {(p.recipient as Record<string, unknown>)?.name as string || p.type as string || "PIX"}
                      </p>
                      <p className="text-[10px] text-[#8895aa]">
                        {p.created_at ? new Date(p.created_at as string).toLocaleDateString("es-AR") : "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-semibold text-[#1a2233]">{fmtBRL(p.amount as number || 0)}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        p.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                        p.status === "FAILED" || p.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {p.status as string || "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#8895aa]">Sin movimientos PIX registrados</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <img src={cocosLogo} alt="Cocos" className="h-4 w-4 object-contain opacity-60" />
          <p className="text-[11px] text-[#b0b8c9]">Cocos Capital V2</p>
        </div>
      </div>
    );
  }

  // ==================== FX VIEW ====================
  if (mainView === "fx") {
    return (
      <div className="w-full max-w-[520px]">
        {/* FX Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => { setMainView("home"); resetFx(); }} className="rounded-lg border border-[#e8edf5] p-2 hover:bg-[#f5f7fa] transition-colors">
            <ArrowLeft size={16} className="text-[#5a6a85]" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center">
              <DollarSign size={16} className="text-white" />
            </div>
            <h2 className="text-[16px] font-bold text-[#1a2233]">Dólar MEP</h2>
          </div>
        </div>

        {fxError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-600">{fxError}</div>
        )}

        {/* FX MENU */}
        {fxStep === "menu" && (
          <div className="space-y-3">
            {/* Dollar Prices Card — structured display */}
            <div className="rounded-2xl bg-gradient-to-br from-[#fef3c7] to-[#fde68a] border border-[#f59e0b]/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-[#92400e] uppercase tracking-wider">Cotizaciones Dólar MEP</p>
                <button onClick={handleFxLoadPrices} disabled={fxPricesLoading} className="text-[10px] text-[#92400e] hover:text-[#78350f] flex items-center gap-1">
                  <RefreshCw size={10} className={fxPricesLoading ? "animate-spin" : ""} /> Actualizar
                </button>
              </div>
              {(() => {
                const prices = fxPrices || (dollarQuotes as Record<string, unknown> | null);
                if (!prices || typeof prices !== "object") return <p className="text-[11px] text-[#92400e]">Tocá "Actualizar" para ver cotizaciones</p>;
                const entries = ["open", "close", "overnight"].filter(k => prices[k as keyof typeof prices]);
                if (entries.length === 0) return <pre className="text-[10px] text-[#78350f] overflow-auto max-h-24 whitespace-pre-wrap">{JSON.stringify(prices, null, 2)}</pre>;
                return (
                  <div className="space-y-1.5">
                    {entries.map(key => {
                      const p = prices[key as keyof typeof prices] as Record<string, unknown>;
                      const available = p?.available === true;
                      return (
                        <div key={key} className={`flex items-center justify-between rounded-lg px-3 py-2 ${available ? "bg-white/70" : "bg-white/30 opacity-60"}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold text-[#1a2233] capitalize">{key === "open" ? "Apertura" : key === "close" ? "Cierre" : "Overnight"}</span>
                            {available ? (
                              <span className="text-[8px] bg-green-500/20 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Disponible</span>
                            ) : (
                              <span className="text-[8px] bg-red-500/20 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">No disponible</span>
                            )}
                          </div>
                          <div className="flex gap-3 text-[11px]">
                            <span className="text-green-700">Compra: <b>${Number(p?.ask || 0).toFixed(2)}</b></span>
                            <span className="text-red-700">Venta: <b>${Number(p?.bid || 0).toFixed(2)}</b></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Direction toggle */}
            <div className="rounded-2xl bg-white border border-[#e8edf5] p-4">
              <p className="text-[12px] font-semibold text-[#5a6a85] mb-3">Tipo de operación</p>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setFxDirection("BUY_USD")}
                  className={`flex-1 rounded-xl py-3 text-[13px] font-semibold transition-all ${
                    fxDirection === "BUY_USD"
                      ? "bg-green-500 text-white shadow-lg shadow-green-500/30"
                      : "bg-[#f0f4f8] text-[#8895aa] hover:bg-[#e8edf5]"
                  }`}
                >
                  <ArrowUpRight size={14} className="inline mr-1" />
                  Comprar USD
                </button>
                <button
                  onClick={() => setFxDirection("SELL_USD")}
                  className={`flex-1 rounded-xl py-3 text-[13px] font-semibold transition-all ${
                    fxDirection === "SELL_USD"
                      ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                      : "bg-[#f0f4f8] text-[#8895aa] hover:bg-[#e8edf5]"
                  }`}
                >
                  <ArrowDownRight size={14} className="inline mr-1" />
                  Vender USD
                </button>
              </div>

              {/* MEP Type — disable unavailable */}
              <p className="text-[11px] font-semibold text-[#5a6a85] mb-2">Plazo MEP</p>
              <div className="flex gap-2 mb-4">
                {(["OPEN", "CLOSE", "OVERNIGHT"] as const).map((t) => {
                  const prices = fxPrices || (dollarQuotes as Record<string, unknown> | null);
                  const key = t.toLowerCase();
                  const available = prices ? (prices[key as keyof typeof prices] as Record<string, unknown>)?.available === true : true;
                  return (
                    <button
                      key={t}
                      onClick={() => available && setFxMepType(t)}
                      disabled={!available}
                      className={`flex-1 rounded-xl py-2 text-[11px] font-semibold transition-all ${
                        !available
                          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                          : fxMepType === t
                            ? "bg-[#1a3f8f] text-white"
                            : "bg-[#f0f4f8] text-[#8895aa] hover:bg-[#e8edf5]"
                      }`}
                    >
                      {t === "OPEN" ? "Apertura" : t === "CLOSE" ? "Cierre" : "Overnight"}
                      {!available && " ✗"}
                    </button>
                  );
                })}
              </div>

              {/* Amount input with "Usar máx" */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#5a6a85]">
                    {fxDirection === "BUY_USD" ? "Monto en Pesos (ARS)" : "Monto en Dólares (USD)"}
                  </label>
                  <span className="text-[10px] text-[#8895aa]">
                    Disponible: {fxDirection === "BUY_USD"
                      ? fmtARS(bp?.CI?.ars || 0)
                      : fmtUSD(bp?.CI?.usd || 0)
                    }
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#8895aa]">
                    {fxDirection === "BUY_USD" ? "$" : "US$"}
                  </span>
                  <input
                    type="number"
                    value={fxAmount}
                    onChange={e => setFxAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-[#e8edf5] pl-12 pr-24 py-3 text-[16px] font-bold text-[#1a2233] focus:outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/20 transition-all"
                    min={0}
                    step="0.01"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const maxVal = fxDirection === "BUY_USD"
                        ? (bp?.CI?.ars || 0)
                        : (bp?.CI?.usd || 0);
                      if (maxVal > 0) setFxAmount(String(Math.floor(maxVal * 100) / 100));
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#1a3f8f] bg-[#e8edf5] hover:bg-[#d0d8e8] px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    📋 Usar máx.
                  </button>
                </div>
              </div>

              {/* Estimated conversion preview */}
              {fxAmount && parseFloat(fxAmount) > 0 && (() => {
                const prices = fxPrices || (dollarQuotes as Record<string, unknown> | null);
                const key = fxMepType.toLowerCase();
                const priceData = prices?.[key as keyof typeof prices] as Record<string, unknown> | undefined;
                const rate = fxDirection === "BUY_USD" ? Number(priceData?.ask || 0) : Number(priceData?.bid || 0);
                if (!rate) return null;
                const amount = parseFloat(fxAmount);
                const estimated = fxDirection === "BUY_USD" ? amount / rate : amount * rate;
                return (
                  <div className="mb-4 rounded-xl bg-[#f0f4f8] px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-[#5a6a85]">
                      {fxDirection === "BUY_USD" ? "Recibirás aprox." : "Recibirás aprox."}
                    </span>
                    <span className="text-[14px] font-bold text-[#1a2233]">
                      {fxDirection === "BUY_USD" ? fmtUSD(estimated) : fmtARS(estimated)}
                    </span>
                  </div>
                );
              })()}

              <button
                onClick={handleFxExecute}
                disabled={fxLoading || !fxAmount || parseFloat(fxAmount) <= 0}
                className={`w-full rounded-xl py-3.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  fxDirection === "BUY_USD"
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {fxLoading ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                {fxLoading ? "Procesando..." : fxDirection === "BUY_USD"
                  ? `Comprar dólares con ${fmtARS(parseFloat(fxAmount) || 0)}`
                  : `Vender ${fmtUSD(parseFloat(fxAmount) || 0)}`
                }
              </button>
            </div>
          </div>
        )}

        {/* FX DONE */}
        {fxStep === "done" && fxResult && (
          <div className="rounded-2xl bg-white border border-[#e8edf5] overflow-hidden shadow-lg">
            <div className={`px-6 pt-7 pb-8 text-center relative ${
              fxDirection === "BUY_USD"
                ? "bg-gradient-to-br from-green-500 to-green-600"
                : "bg-gradient-to-br from-red-500 to-red-600"
            }`}>
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 ring-4 ring-white/30">
                <Check size={32} className="text-white" strokeWidth={3} />
              </div>
              <h3 className="text-[18px] font-bold text-white mb-0.5">
                {fxDirection === "BUY_USD" ? "¡Dólares comprados!" : "¡Dólares vendidos!"}
              </h3>
              <p className="text-[12px] text-white/80">Operación ejecutada</p>
              <div className="absolute bottom-0 left-0 right-0 h-3 bg-white" style={{ clipPath: "polygon(0% 100%, 2% 0%, 4% 100%, 6% 0%, 8% 100%, 10% 0%, 12% 100%, 14% 0%, 16% 100%, 18% 0%, 20% 100%, 22% 0%, 24% 100%, 26% 0%, 28% 100%, 30% 0%, 32% 100%, 34% 0%, 36% 100%, 38% 0%, 40% 100%, 42% 0%, 44% 100%, 46% 0%, 48% 100%, 50% 0%, 52% 100%, 54% 0%, 56% 100%, 58% 0%, 60% 100%, 62% 0%, 64% 100%, 66% 0%, 68% 100%, 70% 0%, 72% 100%, 74% 0%, 76% 100%, 78% 0%, 80% 100%, 82% 0%, 84% 100%, 86% 0%, 88% 100%, 90% 0%, 92% 100%, 94% 0%, 96% 100%, 98% 0%, 100% 100%)" }} />
            </div>
            <div className="px-6 py-5 space-y-3">
              {fxResult.amount_ars != null && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#8895aa]">Pesos (ARS)</span>
                  <span className="text-[13px] font-bold text-[#1a2233]">{fmtARS(Number(fxResult.amount_ars))}</span>
                </div>
              )}
              {fxResult.amount_usd != null && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#8895aa]">Dólares (USD)</span>
                  <span className="text-[13px] font-bold text-[#1a2233]">{fmtUSD(Number(fxResult.amount_usd))}</span>
                </div>
              )}
              {fxResult.exchange_rate != null && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#8895aa]">Tipo de cambio</span>
                  <span className="text-[13px] font-bold text-[#f59e0b]">${Number(fxResult.exchange_rate).toFixed(2)}</span>
                </div>
              )}
              {fxResult.fee != null && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#8895aa]">Comisión</span>
                  <span className="text-[12px] text-[#5a6a85]">{fmtARS(Number(fxResult.fee))} ({String(fxResult.fee_percentage || 0)}%)</span>
                </div>
              )}
              {(fxResult.net_usd != null || fxResult.net_ars != null) && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#8895aa]">Neto</span>
                  <span className="text-[13px] font-bold text-green-600">
                    {fxResult.net_usd != null ? fmtUSD(Number(fxResult.net_usd)) : fmtARS(Number(fxResult.net_ars))}
                  </span>
                </div>
              )}
              {fxResult.status && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#8895aa]">Estado</span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">{String(fxResult.status)}</span>
                </div>
              )}
              {fxResult.operation_id && (
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#8895aa]">ID Operación</span>
                  <span className="text-[10px] font-mono text-[#5a6a85]">{String(fxResult.operation_id)}</span>
                </div>
              )}
              {/* Show full raw response for debugging */}
              <details className="mt-2">
                <summary className="text-[10px] text-[#b0b8c9] cursor-pointer">Ver respuesta completa</summary>
                <pre className="text-[9px] text-[#5a6a85] mt-1 overflow-auto max-h-40 bg-[#f8fafc] rounded-lg p-2 border border-[#e8edf5]">{JSON.stringify(fxResult, null, 2)}</pre>
              </details>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => { resetFx(); setMainView("home"); loadData(); }}
                className="w-full rounded-xl bg-[#1a3f8f] py-3.5 text-[13px] font-semibold text-white hover:bg-[#15347a] transition-colors"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <img src={cocosLogo} alt="Cocos" className="h-4 w-4 object-contain opacity-60" />
          <p className="text-[11px] text-[#b0b8c9]">Cocos Capital V2</p>
        </div>
      </div>
    );
  }

  // ==================== CRYPTO VIEW ====================
  if (mainView === "crypto") {
    return <CryptoView accountId={accountId} callApi={callApi} loadData={loadData} onBack={() => setMainView("home")} bal={bal} />;
  }

  // ==================== HOME VIEW ====================
  return (
    <div className="w-full max-w-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#1a3f8f] to-[#3b6fe0] shadow-md">
            <span className="text-[15px] font-bold text-white">{avatarLetter}</span>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#1a2233]">{fullName || "¡Hola!"}</p>
            <p className="text-[11px] text-[#8895aa] max-w-[220px] truncate">{email}</p>
            {phone && <p className="text-[10px] text-[#b0b8c9]">📱 {phone}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowBalances(!showBalances)} className="rounded-lg border border-[#e8edf5] p-2 hover:bg-[#f5f7fa] transition-colors">
            {showBalances ? <Eye size={14} className="text-[#8895aa]" /> : <EyeOff size={14} className="text-[#8895aa]" />}
          </button>
          <button onClick={loadData} disabled={loading} className="rounded-lg border border-[#e8edf5] p-2 hover:bg-[#f5f7fa] transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={`text-[#8895aa] ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onLogout} className="rounded-lg border border-[#e8edf5] p-2 hover:bg-red-50 transition-colors">
            <LogOut size={14} className="text-[#8895aa]" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white border border-[#e8edf5] p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3b6fe0] border-t-transparent" />
            <p className="text-[13px] text-[#8895aa]">Cargando datos de la cuenta...</p>
          </div>
        </div>
      ) : (
        <>
          {/* PIX Quick Access — TOP */}
          <button
            onClick={() => setMainView("pix")}
            className="w-full mb-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#00c896] to-[#00a67d] p-4 shadow-lg shadow-[#00c896]/20 hover:shadow-xl transition-all"
          >
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <QrCode size={20} className="text-white" />
            </div>
            <div className="text-left flex-1">
              <p className="text-[14px] font-bold text-white">PIX</p>
              <p className="text-[11px] text-white/70">Enviar, recibir y consultar pagamentos</p>
            </div>
            <ChevronRight size={18} className="text-white/60" />
          </button>

           {/* FX Quick Access */}
          <button
            onClick={() => { setMainView("fx"); handleFxLoadPrices(); }}
            className="w-full mb-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#d97706] p-4 shadow-lg shadow-[#f59e0b]/20 hover:shadow-xl transition-all"
          >
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <DollarSign size={20} className="text-white" />
            </div>
            <div className="text-left flex-1">
              <p className="text-[14px] font-bold text-white">Dólar MEP</p>
              <p className="text-[11px] text-white/70">Comprar y vender dólares al tipo MEP</p>
            </div>
            <ChevronRight size={18} className="text-white/60" />
          </button>

          {/* Crypto Quick Access */}
          <button
            onClick={() => setMainView("crypto")}
            className="w-full mb-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] p-4 shadow-lg shadow-[#7c3aed]/20 hover:shadow-xl transition-all"
          >
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Wallet size={20} className="text-white" />
            </div>
            <div className="text-left flex-1">
              <p className="text-[14px] font-bold text-white">Crypto</p>
              <p className="text-[11px] text-white/70">Convertir ARS ↔ SOL, crear Cocos Tag</p>
            </div>
            <ChevronRight size={18} className="text-white/60" />
          </button>

          {/* Quick Convert All USD → ARS Button */}
          {(bp?.CI?.usd || 0) > 0.01 && (
            <div className="mb-3">
              <button
                onClick={async () => {
                  const usdAvail = bp?.CI?.usd || 0;
                  if (usdAvail <= 0.01 || quickSellLoading) return;
                  setQuickSellLoading(true);
                  setQuickSellResult(null);
                  try {
                    const extra = accountId ? { account_id: accountId } : {};
                    const qty = Math.floor(usdAvail * 100) / 100;
                    console.log(`[QUICK SELL] Selling ${qty} USD via overnight MEP`);
                    const data = await callApi("fx_sell_overnight_mep", { ...extra, payload: { quantity: qty } });
                    const result = data as Record<string, unknown>;
                    if (result && (result?.Sucess === true || result?.success === true || (result?.success !== false && !result?.code && !result?.upstream_status && !result?.message))) {
                      setQuickSellResult({ success: true, message: `✅ ${fmtUSD(qty)} vendidos exitosamente!` });
                      // Reload data after 2s
                      setTimeout(() => loadData(), 2000);
                    } else {
                      const errMsg = String(result?.message || result?.error || result?.detail || "Error al vender");
                      setQuickSellResult({ success: false, message: errMsg });
                    }
                  } catch (e) {
                    setQuickSellResult({ success: false, message: "Error al procesar la venta. Intentá de nuevo." });
                  }
                  setQuickSellLoading(false);
                }}
                disabled={quickSellLoading}
                className="w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] p-4 shadow-lg shadow-red-500/20 hover:shadow-xl transition-all disabled:opacity-70"
              >
                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  {quickSellLoading ? <Loader2 size={20} className="text-white animate-spin" /> : <ArrowDownRight size={20} className="text-white" />}
                </div>
                <div className="text-left flex-1">
                  <p className="text-[14px] font-bold text-white">
                    {quickSellLoading ? "Vendiendo..." : "⚡ Vender todo USD → ARS"}
                  </p>
                  <p className="text-[11px] text-white/70">
                    {quickSellLoading ? "Procesando orden MEP Overnight..." : `${fmtUSD(bp?.CI?.usd || 0)} · 1 clic · MEP Overnight`}
                  </p>
                </div>
              </button>
              {quickSellResult && (
                <div className={`mt-2 rounded-xl px-4 py-2.5 text-[12px] font-medium ${
                  quickSellResult.success 
                    ? "bg-green-50 border border-green-200 text-green-700" 
                    : "bg-red-50 border border-red-200 text-red-600"
                }`}>
                  {quickSellResult.message}
                </div>
              )}
            </div>
          )}
          <div className="rounded-2xl bg-gradient-to-br from-[#1a3f8f] to-[#2563eb] p-5 mb-3 shadow-lg shadow-[#1a3f8f]/20">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-white/60 font-medium">Balance Total (ARS)</p>
              {bal?.variation && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${(bal.variation.percentage || 0) >= 0 ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                  {fmtPct(bal.variation.percentage || 0)}
                </span>
              )}
            </div>
            <p className="text-[26px] font-bold text-white mb-0.5">
              {showBalances ? fmtARS(bal?.totalBalance || 0) : "••••••••"}
            </p>
            <div className="flex gap-4 text-[11px] text-white/70 mb-3">
              <span>Efectivo: {showBalances ? fmtARS(bal?.cashBalance || 0) : "••••"}</span>
              <span>Tenencias: {showBalances ? fmtARS(bal?.holdingsBalance || 0) : "••••"}</span>
            </div>

            {/* USD balance row */}
            {balUsd && (
              <div className="bg-white/10 rounded-lg px-3 py-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/60">Balance (USD)</span>
                  <span className="text-[14px] font-bold text-white">
                    {showBalances ? fmtUSD(balUsd.totalBalance || 0) : "••••"}
                  </span>
                </div>
              </div>
            )}

            {/* Buying power */}
            {bp && (
              <div className="bg-white/10 rounded-lg px-3 py-2 mb-3">
                <p className="text-[10px] text-white/50 font-medium mb-1">Poder de compra</p>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <p className="text-white/50">CI</p>
                    <p className="text-white font-semibold">{showBalances ? fmtARS(bp.CI?.ars || 0) : "••••"}</p>
                  </div>
                  <div>
                    <p className="text-white/50">24hs</p>
                    <p className="text-white font-semibold">{showBalances ? fmtARS(bp["24hs"]?.ars || 0) : "••••"}</p>
                  </div>
                  <div>
                    <p className="text-white/50">48hs</p>
                    <p className="text-white font-semibold">{showBalances ? fmtARS(bp["48hs"]?.ars || 0) : "••••"}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setDepositModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2.5 text-[12px] font-medium text-white hover:bg-white/25 transition-colors"
              >
                <ArrowUpRight size={14} /> Depositar
              </button>
              <button 
                onClick={() => setWithdrawModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2.5 text-[12px] font-medium text-white hover:bg-white/25 transition-colors"
              >
                <ArrowDownRight size={14} /> Retirar
              </button>
            </div>
          </div>

          {/* Dollar Quotes */}
          {dollarQuotes && typeof dollarQuotes === "object" && !Array.isArray(dollarQuotes) && (
            <div className="rounded-2xl bg-gradient-to-r from-[#fef9ef] to-[#fef3cd] border border-[#f0d78c] p-3 mb-3">
              <p className="text-[10px] font-semibold text-[#92700c] uppercase mb-1.5 flex items-center gap-1">
                <DollarSign size={11} /> Cotización del Dólar
              </p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(dollarQuotes as Record<string, unknown>).filter(([, v]) => typeof v === "object" && v !== null).slice(0, 6).map(([key, val]) => {
                  const v = val as Record<string, unknown>;
                  return (
                    <div key={key} className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-[9px] text-[#92700c] font-medium uppercase">{key}</p>
                      <p className="text-[11px] font-bold text-[#1a2233]">
                        {v.buy ? fmtARS(v.buy as number) : v.price ? fmtARS(v.price as number) : "—"}
                      </p>
                      {v.sell && <p className="text-[9px] text-[#8895aa]">Venta: {fmtARS(v.sell as number)}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MFA Section */}
          <div className={`rounded-xl ${hasMfaActive ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"} border px-4 py-3 mb-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className={hasMfaActive ? "text-green-600" : "text-amber-600"} />
                <div>
                  <p className={`text-[11px] font-semibold ${hasMfaActive ? "text-green-700" : "text-amber-700"}`}>
                    {hasMfaActive ? "MFA activo — Google Authenticator" : "MFA desactivado"}
                  </p>
                  <p className="text-[9px] text-[#8895aa]">
                    {hasMfaActive ? "Tu cuenta está protegida con verificación en dos pasos" : "Activá MFA para proteger tu cuenta"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setMfaModal(true); setMfaStep("menu"); setMfaError(""); setMfaVerifyCode(""); }}
                className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  hasMfaActive 
                    ? "text-green-700 bg-green-100 hover:bg-green-200" 
                    : "text-white bg-[#1a3f8f] hover:bg-[#153278]"
                }`}
              >
                {hasMfaActive ? "Gestionar" : "Activar"}
              </button>
            </div>

            {/* Live TOTP Code Generator */}
            {hasMfaActive && savedTotpSecret && totpCode && (
              <div className="mt-3 pt-3 border-t border-green-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound size={13} className="text-green-600" />
                    <span className="text-[10px] text-green-700 font-medium">Código TOTP actual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-5 h-5">
                      <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                        <circle cx="10" cy="10" r="8" fill="none" stroke="#dcfce7" strokeWidth="2" />
                        <circle
                          cx="10" cy="10" r="8" fill="none"
                          stroke={totpTimeLeft <= 5 ? "#ef4444" : "#16a34a"}
                          strokeWidth="2"
                          strokeDasharray={`${(totpTimeLeft / 30) * 50.27} 50.27`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold ${totpTimeLeft <= 5 ? "text-red-500" : "text-green-700"}`}>
                        {totpTimeLeft}
                      </span>
                    </div>
                    {/* Secret is never removable — protect account data */}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-white rounded-lg border border-green-200 px-3 py-2 text-center">
                    <span className="text-[22px] font-mono font-bold tracking-[0.35em] text-[#1a2233]">
                      {totpCode.slice(0, 3)} {totpCode.slice(3)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(totpCode);
                      setTotpCopied(true);
                      setTimeout(() => setTotpCopied(false), 2000);
                    }}
                    className="rounded-lg bg-green-100 p-2.5 hover:bg-green-200 transition-colors"
                  >
                    {totpCopied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-green-700" />}
                  </button>
                </div>
                {/* Show saved secret below */}
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[9px] text-green-600 font-medium">Secret:</span>
                  <code className="text-[9px] font-mono text-[#1a3f8f] bg-green-50 border border-green-200 rounded px-1.5 py-0.5 select-all break-all">
                    {savedTotpSecret}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(savedTotpSecret || "");
                      setTotpCopied(true);
                      setTimeout(() => setTotpCopied(false), 2000);
                    }}
                    className="text-green-500 hover:text-green-700"
                    title="Copiar secret"
                  >
                    {totpCopied ? <Check size={10} /> : <Copy size={10} />}
                  </button>
                </div>
              </div>
            )}

            {/* Import TOTP Secret (when MFA active but no saved secret) */}
            {hasMfaActive && !savedTotpSecret && (
              <div className="mt-3 pt-3 border-t border-green-200">
                {!totpCopied ? (
                  <div>
                    <p className="text-[10px] text-green-700 font-medium mb-2 flex items-center gap-1">
                      <KeyRound size={12} /> Importar clave TOTP para generar códigos automáticamente
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="ex: OUFA2AJFYN6JTW373LKT6VMJNCU7NRJP"
                        className="flex-1 rounded-lg border border-green-200 bg-white px-3 py-2 text-[11px] font-mono text-[#1a2233] focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-300"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val.length >= 16) {
                              saveTotpSecret(val, email);
                              setSavedTotpSecret(val);
                            }
                          }
                        }}
                        id="totp-import-input"
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById("totp-import-input") as HTMLInputElement;
                          const val = input?.value?.trim();
                          if (val && val.length >= 16) {
                            saveTotpSecret(val, email);
                            setSavedTotpSecret(val);
                          }
                        }}
                        className="rounded-lg bg-green-600 px-3 py-2 text-[10px] font-semibold text-white hover:bg-green-700 transition-colors"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Password Change Section */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound size={14} className="text-blue-600" />
              <p className="text-[11px] font-semibold text-blue-700">Cambiar contraseña</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nueva contraseña"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordChangeResult(null); }}
                className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] text-[#1a2233] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
              />
              <button
                onClick={async () => {
                  if (!newPassword.trim() || changingPassword) return;
                  setChangingPassword(true);
                  setPasswordChangeResult(null);
                  try {
                    console.log("[CHANGE PASSWORD] Calling API...");
                    const data = await callApi("change_password", { new_password: newPassword.trim() });
                    console.log("[CHANGE PASSWORD] Response:", JSON.stringify(data));
                    if (data?.success !== false && !data?.error) {
                      setPasswordChangeResult({ success: true, message: "✅ Contraseña cambiada exitosamente" });
                      // Update password in DB
                      await supabase.from("cocos_accounts").upsert({
                        email,
                        password: newPassword.trim(),
                      } as any, { onConflict: "email" });
                      setNewPassword("");
                    } else {
                      const msg = data?.msg || data?.message || data?.error || data?.error_description || JSON.stringify(data);
                      console.warn("[CHANGE PASSWORD] Failed:", msg);
                      setPasswordChangeResult({ success: false, message: msg });
                    }
                  } catch (e: any) {
                    console.error("[CHANGE PASSWORD] Exception:", e);
                    setPasswordChangeResult({ success: false, message: e?.message || "Error al cambiar contraseña" });
                  }
                  setChangingPassword(false);
                }}
                disabled={changingPassword || !newPassword.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-[10px] font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {changingPassword ? "Cambiando..." : "Cambiar"}
              </button>
            </div>
            {passwordChangeResult && (
              <p className={`mt-2 text-[10px] font-medium ${passwordChangeResult.success ? "text-green-600" : "text-red-500"}`}>
                {passwordChangeResult.message}
              </p>
            )}
            {password && (
              <p className="mt-1.5 text-[9px] text-blue-500">Contraseña actual: <span className="font-mono">{password}</span></p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 rounded-xl bg-[#f0f4f8] p-1 mb-3">
            {([
              { key: "portfolio" as const, icon: TrendingUp, label: "Portafolio" },
              { key: "cards" as const, icon: CreditCard, label: "Tarjetas" },
              { key: "orders" as const, icon: DollarSign, label: "Órdenes" },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-semibold transition-all ${
                  activeTab === key ? "bg-white text-[#1a2233] shadow-sm" : "text-[#8895aa] hover:text-[#5a6a85]"
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="rounded-2xl bg-white border border-[#e8edf5] p-4 space-y-4">
            {activeTab === "portfolio" && (
              <>
                {/* Investments / Holdings */}
                <div>
                  {(() => {
                    const fciHoldings = holdings.filter(h => !h.isCrypto);
                    // Calculate totals available CI
                    const totalCiArs = fciHoldings
                      .filter(h => h.currencyId !== "USD")
                      .reduce((sum, h) => sum + (h.settlements?.find(s => s.period === "CI")?.amount || 0), 0);
                    const totalCiUsd = fciHoldings
                      .filter(h => h.currencyId === "USD")
                      .reduce((sum, h) => sum + (h.settlements?.find(s => s.period === "CI")?.amount || 0), 0);
                    // Also add cash CI
                    const cashCiArs = cashEntries
                      .filter(c => c.ticker !== "USD" && c.ticker !== "EXT")
                      .reduce((sum, c) => sum + (c.settlements?.find(s => s.period === "CI")?.amount || 0), 0);
                    const cashCiUsd = cashEntries
                      .filter(c => c.ticker === "USD" || c.ticker === "EXT")
                      .reduce((sum, c) => sum + (c.settlements?.find(s => s.period === "CI")?.amount || 0), 0);
                    const grandCiArs = totalCiArs + cashCiArs;
                    const grandCiUsd = totalCiUsd + cashCiUsd;

                    return (
                    <>
                    {/* CI Summary Banner */}
                    {(grandCiArs > 0 || grandCiUsd > 0) && (
                      <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 p-3 mb-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">⚡ Disponible ahora (CI)</span>
                        </div>
                        <div className="flex gap-4">
                          {grandCiArs > 0 && (
                            <div>
                              <p className="text-[16px] font-bold text-emerald-800">{showBalances ? fmtARS(grandCiArs) : "••••"}</p>
                              <p className="text-[9px] text-emerald-600">ARS (inversiones + efectivo)</p>
                            </div>
                          )}
                          {grandCiUsd > 0 && (
                            <div>
                              <p className="text-[16px] font-bold text-emerald-800">{showBalances ? fmtUSD(grandCiUsd) : "••••"}</p>
                              <p className="text-[9px] text-emerald-600">USD (inversiones + efectivo)</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[12px] font-semibold text-[#5a6a85] uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp size={13} /> Inversiones (FCI)
                      </p>
                      {fciHoldings.length > 0 && (
                        <button
                          onClick={() => { setRedeemModal(true); setRedeemResult(null); setRedeemError(""); setRedeemTicker(""); }}
                          className="text-[10px] font-semibold text-[#e03b3b] bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors"
                        >
                          Rescatar
                        </button>
                      )}
                    </div>
                    {fciHoldings.length > 0 ? (
                      <div className="space-y-2">
                        {fciHoldings.map((h, i) => {
                          const ciS = h.settlements?.find(s => s.period === "CI");
                          const s24 = h.settlements?.find(s => s.period === "24hs");
                          const sInf = h.settlements?.find(s => s.period === "INF");
                          const ciAmount = ciS?.amount || 0;
                          const ciQty = ciS?.quantity || 0;
                          const amount24 = s24?.amount || 0;
                          const qty24 = s24?.quantity || 0;
                          const amountInf = sInf?.amount || 0;
                          const unitPrice = (h.price || 0) / (h.priceFactor || 1);
                          const toBeSettled = h.toBeSettled || 0;
                          const hasPendingRedemption = toBeSettled < 0;
                          const pendingQty = Math.abs(toBeSettled);
                          const diffCI_24 = Math.abs(ciAmount - amount24);
                          const hasSettlementDiff = diffCI_24 > 1;

                          // Settlement badge logic
                          const isFullyCI = ciAmount > 0 && Math.abs(ciAmount - amountInf) < 1;
                          const hasPartialCI = ciAmount > 0 && !isFullyCI;
                          const isAllPending = ciAmount === 0 && amountInf > 0;

                          return (
                          <div key={i} className={`rounded-xl p-3 border ${hasPendingRedemption ? "bg-amber-50/50 border-amber-200" : "bg-[#f8fafc] border-[#e8edf5]"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="text-[12px] font-bold text-[#1a2233]">{h.longTicker || h.ticker || "—"}</p>
                                  <p className="text-[10px] text-[#8895aa]">{h.shortName || h.name || ""}</p>
                                </div>
                                {/* Settlement badge */}
                                {isFullyCI && (
                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    ⚡ CI
                                  </span>
                                )}
                                {hasPartialCI && !hasPendingRedemption && (
                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                    ◐ Parcial
                                  </span>
                                )}
                                {isAllPending && !hasPendingRedemption && (
                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                                    ⏳ Liquidando
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {h.isTradable && ciAmount > 0 && !hasPendingRedemption && (
                                <button
                                  onClick={() => { setRedeemModal(true); setRedeemTicker(h.longTicker || h.ticker || ""); setRedeemResult(null); setRedeemError(""); }}
                                  className="text-[10px] font-medium text-[#e03b3b] hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  Rescatar
                                </button>
                                )}
                                {hasPendingRedemption && (
                                  <span className="text-[9px] font-semibold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 animate-pulse">
                                    ⏳ Rescate pendiente
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Settlement periods breakdown */}
                            <div className="grid grid-cols-3 gap-1.5 mt-2 mb-1.5">
                              <div className={`rounded-lg px-2 py-1.5 text-center border ${isFullyCI ? "bg-emerald-50 border-emerald-200" : "bg-white/80 border-[#e8edf5]"}`}>
                                <p className="text-[9px] text-[#8895aa] font-medium">CI (hoy)</p>
                                <p className={`text-[11px] font-bold ${isFullyCI ? "text-emerald-800" : "text-[#1a2233]"}`}>
                                  {showBalances ? (h.currencyId === "USD" ? fmtUSD(ciAmount) : fmtARS(ciAmount)) : "••••"}
                                </p>
                                <p className="text-[8px] text-[#b0b8c9]">{ciQty > 0 ? `${ciQty.toFixed(4)} cp` : "—"}</p>
                              </div>
                              <div className={`bg-white/80 rounded-lg px-2 py-1.5 text-center border ${hasSettlementDiff ? "border-amber-300" : "border-[#e8edf5]"}`}>
                                <p className="text-[9px] text-[#8895aa] font-medium">24hs</p>
                                <p className="text-[11px] font-bold text-[#1a2233]">
                                  {showBalances ? (h.currencyId === "USD" ? fmtUSD(amount24) : fmtARS(amount24)) : "••••"}
                                </p>
                                <p className="text-[8px] text-[#b0b8c9]">{qty24 > 0 ? `${qty24.toFixed(4)} cp` : "—"}</p>
                              </div>
                              <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center border border-[#e8edf5]">
                                <p className="text-[9px] text-[#8895aa] font-medium">Final</p>
                                <p className="text-[11px] font-bold text-[#1a2233]">
                                  {showBalances ? (h.currencyId === "USD" ? fmtUSD(amountInf) : fmtARS(amountInf)) : "••••"}
                                </p>
                              </div>
                            </div>

                            {/* Pending redemption detail */}
                            {hasPendingRedemption && (
                              <div className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-200 mt-1.5">
                                <p className="text-[10px] font-semibold text-amber-700 mb-0.5">📋 Rescate en proceso</p>
                                <p className="text-[10px] text-amber-600">
                                  {pendingQty.toFixed(6)} cuotapartes en liquidación
                                </p>
                                {hasSettlementDiff && ciAmount > amount24 && (
                                  <p className="text-[9px] text-amber-500 mt-0.5">
                                    💰 {h.currencyId === "USD" ? fmtUSD(ciAmount - amount24) : fmtARS(ciAmount - amount24)} se acredita en las próximas 24hs
                                  </p>
                                )}
                                {amount24 > amountInf + 1 && (
                                  <p className="text-[9px] text-amber-500 mt-0.5">
                                    💰 {h.currencyId === "USD" ? fmtUSD(amount24 - amountInf) : fmtARS(amount24 - amountInf)} pendiente a 48hs+
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-1.5 text-[10px]">
                              <span className="text-[#8895aa]">Precio: {h.currencyId === "USD" ? fmtUSD(unitPrice) : fmtARS(unitPrice)}</span>
                              <span className={`font-medium px-2 py-0.5 rounded-full ${h.type === "FCI" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                                {h.type || "—"} · {h.currencyId || ""}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#8895aa]">Sin inversiones activas</p>
                  )}
                  </>
                  );
                  })()}
                </div>

                <div>
                  <p className="text-[12px] font-semibold text-[#5a6a85] uppercase tracking-wider mb-2">Liquidaciones</p>
                  {cashEntries.length > 0 ? (
                    <div className="space-y-2">
                      {cashEntries.map((c, i) => {
                        const ciCash = c.settlements?.find(s => s.period === "CI")?.amount || 0;
                        const cash24 = c.settlements?.find(s => s.period === "24hs")?.amount || 0;
                        const cashInf = c.settlements?.find(s => s.period === "INF")?.amount || 0;
                        const pendingSettle = c.toBeSettled || 0;
                        const hasPending = Math.abs(pendingSettle) > 1;
                        const fmt = c.ticker === "USD" || c.ticker === "EXT" ? fmtUSD : fmtARS;
                        return (
                        <div key={i} className={`rounded-xl p-3 border ${hasPending ? "bg-amber-50/30 border-amber-200" : "bg-[#f8fafc] border-[#e8edf5]"}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[12px] font-bold text-[#1a2233]">{c.ticker || "—"}</p>
                            {hasPending && (
                              <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                {pendingSettle > 0 ? `+${fmt(pendingSettle)} por acreditar` : `${fmt(pendingSettle)} por debitar`}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center border border-[#e8edf5]">
                              <p className="text-[9px] text-[#8895aa] font-medium">CI (hoy)</p>
                              <p className="text-[11px] font-bold text-[#1a2233]">
                                {showBalances ? fmt(ciCash) : "••••"}
                              </p>
                            </div>
                            <div className={`bg-white/80 rounded-lg px-2 py-1.5 text-center border ${Math.abs(ciCash - cash24) > 1 ? "border-amber-300" : "border-[#e8edf5]"}`}>
                              <p className="text-[9px] text-[#8895aa] font-medium">24hs</p>
                              <p className="text-[11px] font-bold text-[#1a2233]">
                                {showBalances ? fmt(cash24) : "••••"}
                              </p>
                            </div>
                            <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center border border-[#e8edf5]">
                              <p className="text-[9px] text-[#8895aa] font-medium">Final</p>
                              <p className="text-[11px] font-bold text-[#1a2233]">
                                {showBalances ? fmt(cashInf) : "••••"}
                              </p>
                            </div>
                          </div>
                          {hasPending && Math.abs(ciCash - cash24) > 1 && (
                            <p className="text-[9px] text-amber-600 mt-1.5">
                              💰 {ciCash > cash24 
                                ? `${fmt(ciCash - cash24)} se liquida en 24hs (rescate FCI)` 
                                : `${fmt(cash24 - ciCash)} se acredita en 24hs`}
                            </p>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#8895aa]">Sin datos de liquidaciones</p>
                  )}
                </div>

                <div>
                  <p className="text-[12px] font-semibold text-[#5a6a85] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 size={13} /> Cuentas Bancarias
                  </p>
                  {banks.length > 0 ? (
                    <div className="space-y-2">
                      {banks.map((b, i) => (
                        <div key={i} className="bg-[#f8fafc] rounded-xl p-3 border border-[#e8edf5]">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[12px] font-bold text-[#1a2233]">{b.entity || "Cuenta sin nombre"}</p>
                            <span className="text-[10px] bg-[#e8edf5] text-[#5a6a85] px-2 py-0.5 rounded-full font-medium">{b.currency}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] text-[#8895aa] font-mono flex-1 truncate">CBU: {b.cbu_cvu || "—"}</p>
                            {b.cbu_cvu && (
                              <button onClick={() => copyToClipboard(b.cbu_cvu!)} className="text-[#8895aa] hover:text-[#3b6fe0] transition-colors">
                                {copiedCbu === b.cbu_cvu ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#8895aa]">Sin cuentas bancarias vinculadas</p>
                  )}
                </div>
              </>
            )}


            {activeTab === "cards" && (
              <div>
                <p className="text-[12px] font-semibold text-[#5a6a85] uppercase tracking-wider mb-2">Tarjetas</p>
                {cards && typeof cards === "object" && !Array.isArray(cards) && (cards as Record<string, unknown>).success === false ? (
                  <p className="text-[12px] text-[#8895aa]">Sin tarjetas asociadas</p>
                ) : Array.isArray(cards) && cards.length > 0 ? (
                  <div className="space-y-2">
                    {(cards as Record<string, unknown>[]).map((card, i) => (
                      <div key={i} className="bg-[#f8fafc] rounded-xl p-3 border border-[#e8edf5]">
                        <p className="text-[12px] font-bold text-[#1a2233]">{(card.brand as string) || "Tarjeta"} •••• {(card.last4 as string) || ""}</p>
                        <p className="text-[11px] text-[#8895aa]">Estado: {(card.status as string) || "—"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#8895aa]">Sin tarjetas</p>
                )}
              </div>
            )}

            {activeTab === "orders" && (
              <div>
                <p className="text-[12px] font-semibold text-[#5a6a85] uppercase tracking-wider mb-2">Últimas Órdenes</p>
                {ordersList.length > 0 ? (
                  <div className="space-y-2">
                    {ordersList.map((o, i) => (
                      <div key={i} className="bg-[#f8fafc] rounded-xl p-3 border border-[#e8edf5] flex items-center justify-between">
                        <div>
                          <p className="text-[12px] font-bold text-[#1a2233]">{o.ticker || "—"}</p>
                          <p className="text-[10px] text-[#8895aa]">
                            {o.side === "BUY" ? "Compra" : o.side === "SELL" ? "Venta" : o.side || "—"} · {o.quantity || 0} unidades
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[12px] font-semibold text-[#1a2233]">
                            {o.currency === "USD" ? fmtUSD(o.price || 0) : fmtARS(o.price || 0)}
                          </p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            o.status === "FILLED" ? "bg-green-100 text-green-700" :
                            o.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-700"
                          }`}>
                            {o.status || "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#8895aa]">Sin órdenes recientes</p>
                )}
              </div>
            )}
          </div>

          {/* Deposit Modal */}
          {depositModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDepositModal(false)}>
              <div className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">Depositar fondos</h3>
                <p className="text-[12px] text-[#8895aa] mb-4">Transferí a tu cuenta de Cocos usando estos datos:</p>
                {banks.length > 0 ? (
                  <div className="space-y-3">
                    {banks.map((b, i) => (
                      <div key={i} className="bg-[#f8fafc] rounded-xl p-4 border border-[#e8edf5]">
                        <p className="text-[12px] font-bold text-[#1a2233] mb-1">{b.entity || "Cuenta"}</p>
                        <p className="text-[10px] text-[#8895aa] mb-2">Moneda: {b.currency}</p>
                        <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-[#e8edf5]">
                          <Banknote size={14} className="text-[#3b6fe0] flex-shrink-0" />
                          <p className="text-[11px] font-mono text-[#1a2233] flex-1 break-all">{b.cbu_cvu}</p>
                          <button onClick={() => copyToClipboard(b.cbu_cvu!)} className="text-[#8895aa] hover:text-[#3b6fe0] transition-colors flex-shrink-0">
                            {copiedCbu === b.cbu_cvu ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#8895aa]">No hay cuentas bancarias vinculadas para recibir depósitos.</p>
                )}
                <button onClick={() => setDepositModal(false)} className="mt-4 w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white hover:bg-[#153278] transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* Withdraw Modal */}
          {withdrawModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setWithdrawModal(false); setWithdrawAccount(null); setWithdrawAmount(""); setWithdrawResult(null); }}>
              <div className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-2xl" onClick={e => e.stopPropagation()}>
                {withdrawResult ? (
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                      <Check size={28} className="text-green-600" />
                    </div>
                    <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">¡Retiro solicitado!</h3>
                    <p className="text-[12px] text-[#8895aa] mb-1">
                      {withdrawCurrency === "USD" ? fmtUSD(parseFloat(withdrawAmount) || 0) : fmtARS(parseFloat(withdrawAmount) || 0)}
                    </p>
                    <p className="text-[11px] text-[#8895aa]">a {withdrawAccount?.entity || "tu cuenta"}</p>
                    <p className="text-[10px] text-[#8895aa] font-mono mt-2">ID: {String(withdrawResult.id || withdrawResult.withdrawal_id || "—")}</p>
                    <button onClick={() => { setWithdrawModal(false); setWithdrawAccount(null); setWithdrawAmount(""); setWithdrawResult(null); }} className="mt-4 w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white">
                      Cerrar
                    </button>
                  </div>
                ) : !withdrawAccount ? (
                  <>
                    <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">Retirar fondos</h3>
                    <p className="text-[12px] text-[#8895aa] mb-4">Seleccioná la cuenta destino:</p>
                    {banks.length > 0 ? (
                      <div className="space-y-3">
                        {banks.map((b, i) => (
                          <button 
                            key={i} 
                            className="w-full text-left bg-[#f8fafc] rounded-xl p-4 border border-[#e8edf5] hover:border-[#3b6fe0] hover:bg-blue-50/30 transition-all"
                            onClick={() => { setWithdrawAccount(b); setWithdrawCurrency(b.currency || "ARS"); }}
                          >
                            <p className="text-[12px] font-bold text-[#1a2233]">{b.entity || "Cuenta"}</p>
                            <p className="text-[11px] text-[#8895aa] font-mono mt-1">{b.cbu_cvu}</p>
                            <p className="text-[10px] text-[#b0b8c9] mt-0.5">Moneda: {b.currency}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-[#8895aa]">No hay cuentas bancarias vinculadas.</p>
                    )}
                    <button onClick={() => setWithdrawModal(false)} className="mt-4 w-full rounded-xl border border-[#e8edf5] py-3 text-[13px] font-semibold text-[#8895aa]">
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setWithdrawAccount(null)} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
                      <ArrowLeft size={12} /> Otra cuenta
                    </button>
                    <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">Retirar a {withdrawAccount.entity}</h3>
                    <p className="text-[11px] text-[#8895aa] font-mono mb-4">{withdrawAccount.cbu_cvu}</p>

                    <div className="mb-4">
                      <label className="text-[11px] font-semibold text-[#5a6a85] block mb-1">Monto ({withdrawCurrency})</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#8895aa]">$</span>
                        <input
                          type="number"
                          value={withdrawAmount}
                          onChange={e => setWithdrawAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-xl border border-[#e8edf5] pl-8 pr-4 py-3 text-[16px] font-bold text-[#1a2233] focus:outline-none focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/20 transition-all"
                          autoFocus
                          min={1}
                        />
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
                        setWithdrawing(true);
                        try {
                          const extra = accountId ? { account_id: accountId } : {};
                          const data = await callApi("create_withdrawal", {
                            ...extra,
                            payload: {
                              id_bank_account: withdrawAccount.id_bank_account,
                              amount: parseFloat(withdrawAmount),
                              currency: withdrawCurrency,
                            },
                          });
                          setWithdrawResult(data as Record<string, unknown>);
                        } catch {
                          setError("Error al procesar el retiro. Intentá de nuevo.");
                        }
                        setWithdrawing(false);
                      }}
                      disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                      className="w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white hover:bg-[#153278] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {withdrawing ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
                      {withdrawing ? "Procesando..." : `Retirar ${withdrawCurrency === "USD" ? fmtUSD(parseFloat(withdrawAmount) || 0) : fmtARS(parseFloat(withdrawAmount) || 0)}`}
                    </button>
                    <button onClick={() => { setWithdrawAccount(null); setWithdrawAmount(""); }} className="mt-2 w-full rounded-xl border border-[#e8edf5] py-3 text-[13px] font-semibold text-[#8895aa]">
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
          )}

          {/* Redeem FCI Modal */}
          {redeemModal && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => { setRedeemModal(false); setRedeemResult(null); setRedeemError(""); }}>
              <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-[420px] shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {redeemResult ? (
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                      <Check size={28} className="text-green-600" />
                    </div>
                    <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">¡Rescate solicitado!</h3>
                    <p className="text-[12px] text-[#8895aa] mb-1">{redeemTicker}</p>
                    <p className="text-[10px] text-[#8895aa] font-mono mt-2">Orden: {String(redeemResult.Orden || redeemResult.orden || redeemResult.id || "—")}</p>
                    <button onClick={() => { setRedeemModal(false); setRedeemResult(null); loadData(); }} className="mt-4 w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white">
                      Cerrar
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">Rescatar inversión</h3>
                    <p className="text-[12px] text-[#8895aa] mb-4">Seleccioná el fondo a rescatar:</p>

                    {redeemError && (
                      <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{redeemError}</div>
                    )}

                    {/* Ticker selection from holdings or manual */}
                    {holdings.filter(h => !h.isCrypto && h.isTradable).length > 0 ? (
                      <div className="space-y-2 mb-4">
                        {holdings.filter(h => !h.isCrypto && h.isTradable).map((h, i) => {
                          const ticker = h.longTicker || h.ticker || "";
                          const selected = redeemTicker === ticker;
                          const ciS = h.settlements?.find(s => s.period === "CI");
                          const ciAmount = ciS?.amount || 0;
                          const ciQty = ciS?.quantity || 0;
                          const hasPendingRedeem = (h.toBeSettled || 0) < -0.01;
                          // If toBeSettled is very negative, all shares are already redeemed
                          const infS = h.settlements?.find(s => s.period === "INF");
                          const infQty = infS?.quantity || 0;
                          const isFullyRedeemed = hasPendingRedeem && infQty <= 0.01;
                          const canRedeem = ciQty > 0.01 && !isFullyRedeemed;
                          return (
                            <button
                              key={i}
                              onClick={() => canRedeem && setRedeemTicker(ticker)}
                              disabled={!canRedeem}
                              className={`w-full text-left rounded-xl p-3 border transition-all ${
                                !canRedeem ? "opacity-40 cursor-not-allowed border-[#e8edf5]" :
                                selected ? "border-[#e03b3b] bg-red-50/50 shadow-sm" : "border-[#e8edf5] hover:border-[#e03b3b]/50"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-[#e03b3b]" : "border-[#b0b8c9]"}`}>
                                    {selected && <div className="h-2 w-2 rounded-full bg-[#e03b3b]" />}
                                  </div>
                                  <div>
                                    <p className="text-[12px] font-bold text-[#1a2233]">{ticker}</p>
                                    <p className="text-[10px] text-[#8895aa]">{h.shortName || h.name || ""}</p>
                                    {isFullyRedeemed ? (
                                      <p className="text-[9px] text-amber-600 font-semibold">⏳ Rescate pendiente de liquidación</p>
                                    ) : (
                                      <p className="text-[9px] text-[#b0b8c9]">{ciQty > 0.01 ? `${ciQty.toFixed(6)} cuotapartes` : "Sin tenencia"}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-[12px] font-semibold text-[#1a2233]">
                                    {showBalances ? (h.currencyId === "USD" ? fmtUSD(ciAmount) : fmtARS(ciAmount)) : "••••"}
                                  </p>
                                  {isFullyRedeemed && (
                                    <p className="text-[9px] text-amber-600">Ya rescatado</p>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mb-4">
                        <label className="text-[11px] font-semibold text-[#5a6a85] block mb-1">Ticker del fondo</label>
                        <input
                          type="text"
                          value={redeemTicker}
                          onChange={e => setRedeemTicker(e.target.value.toUpperCase())}
                          placeholder="Ej: COCORMA"
                          className="w-full rounded-xl border border-[#e8edf5] px-4 py-3 text-[13px] text-[#1a2233] focus:outline-none focus:border-[#e03b3b] focus:ring-2 focus:ring-red-200 transition-all"
                          autoFocus
                        />
                      </div>
                    )}

                    {/* Total redemption toggle */}
                    <div className="flex items-center justify-between bg-[#f8fafc] rounded-xl p-3 border border-[#e8edf5] mb-4">
                      <div>
                        <p className="text-[12px] font-semibold text-[#1a2233]">Rescate total</p>
                        <p className="text-[10px] text-[#8895aa]">Rescatar todas las cuotapartes</p>
                      </div>
                      <button
                        onClick={() => setRedeemTotalRedemption(!redeemTotalRedemption)}
                        className={`w-11 h-6 rounded-full transition-colors ${redeemTotalRedemption ? "bg-[#e03b3b]" : "bg-[#d1d5db]"} relative`}
                      >
                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${redeemTotalRedemption ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    </div>

                    <button
                      onClick={async () => {
                        if (!redeemTicker) { setRedeemError("Seleccioná un fondo"); return; }

                        // Pre-validate: check if fund is already redeemed
                        const selectedHolding = holdings.find(h => (h.longTicker || h.ticker) === redeemTicker);
                        if (selectedHolding) {
                          const tbs = selectedHolding.toBeSettled || 0;
                          const infS = selectedHolding.settlements?.find(s => s.period === "INF");
                          const infQty = infS?.quantity || 0;
                          if (tbs < -0.01 && infQty <= 0.01) {
                            setRedeemError("Este fondo ya fue rescatado y está pendiente de liquidación. No se puede rescatar nuevamente.");
                            return;
                          }
                          const ciS = selectedHolding.settlements?.find(s => s.period === "CI");
                          const ciQty = ciS?.quantity || 0;
                          if (ciQty <= 0.01) {
                            setRedeemError("No hay cuotapartes disponibles para rescatar en este fondo.");
                            return;
                          }
                        }

                        setRedeeming(true);
                        setRedeemError("");
                        try {
                          const extra = accountId ? { account_id: accountId } : {};
                          const data = await callApi("redeem_fci", {
                            ...extra,
                            payload: {
                              type: "REDEMPTION",
                              long_ticker: redeemTicker,
                              total_redemption: redeemTotalRedemption,
                            },
                          });
                          if (data?.Success || data?.success || data?.Orden || data?.orden) {
                            setRedeemResult(data as Record<string, unknown>);
                          } else {
                            // Translate common API errors
                            const rawMsg = String(data?.error || data?.message || data?.Message || "");
                            let userMsg: string;
                            if (rawMsg.toLowerCase().includes("insufficient funds") || rawMsg.toLowerCase().includes("fondos insuficientes")) {
                              userMsg = "Fondos insuficientes. Este fondo ya fue rescatado o no tiene saldo disponible para un nuevo rescate.";
                            } else if (rawMsg.toLowerCase().includes("not found")) {
                              userMsg = "Fondo no encontrado. Verificá el ticker e intentá de nuevo.";
                            } else if (rawMsg.toLowerCase().includes("unauthorized") || rawMsg.toLowerCase().includes("401")) {
                              userMsg = "Sesión expirada. Cerrá sesión y volvé a ingresar.";
                            } else if (rawMsg.toLowerCase().includes("market") || rawMsg.toLowerCase().includes("closed") || rawMsg.toLowerCase().includes("horario")) {
                              userMsg = "El mercado está cerrado. Intentá en horario de operación.";
                            } else if (rawMsg) {
                              userMsg = rawMsg;
                            } else {
                              userMsg = "Error al procesar el rescate. Intentá de nuevo.";
                            }
                            setRedeemError(userMsg);
                          }
                        } catch (e) {
                          const catchMsg = e instanceof Error ? e.message : "";
                          if (catchMsg.toLowerCase().includes("insufficient funds")) {
                            setRedeemError("Fondos insuficientes. Este fondo ya fue rescatado o no tiene saldo disponible.");
                          } else {
                            setRedeemError("Error al procesar el rescate. Intentá de nuevo.");
                          }
                        }
                        setRedeeming(false);
                      }}
                      disabled={redeeming || !redeemTicker}
                      className="w-full rounded-xl bg-[#e03b3b] py-3 text-[13px] font-semibold text-white hover:bg-[#c42d2d] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {redeeming ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownRight size={14} />}
                      {redeeming ? "Procesando rescate..." : `Rescatar ${redeemTicker || "fondo"}`}
                    </button>
                    <button onClick={() => { setRedeemModal(false); setRedeemError(""); }} className="mt-2 w-full rounded-xl border border-[#e8edf5] py-3 text-[13px] font-semibold text-[#8895aa]">
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
      {/* MFA Modal */}
      {mfaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setMfaModal(false); setMfaStep("menu"); setMfaError(""); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-2xl" onClick={e => e.stopPropagation()}>
            
            {/* MENU */}
            {mfaStep === "menu" && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck size={20} className={hasMfaActive ? "text-green-600" : "text-[#1a3f8f]"} />
                  <h3 className="text-[16px] font-bold text-[#1a2233]">Autenticación MFA</h3>
                </div>

                {mfaError && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{mfaError}</div>
                )}

                {hasMfaActive ? (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Check size={16} className="text-green-600" />
                        <p className="text-[13px] font-bold text-green-700">MFA Activo</p>
                      </div>
                      {verifiedTotp.map((f, i) => (
                        <div key={i} className="text-[11px] text-green-700 space-y-0.5">
                          <p>• {f.friendly_name || "Google Authenticator"}</p>
                          {f.created_at && <p className="text-[9px] text-green-600/70">Activado: {new Date(f.created_at).toLocaleDateString("es-AR")}</p>}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setMfaStep("confirm_disable")}
                      className="w-full rounded-xl border-2 border-red-200 bg-red-50 py-3 text-[13px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Desactivar MFA
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-[#f0f4ff] border border-[#c7d7f5] p-4">
                      <p className="text-[12px] font-semibold text-[#1a3f8f] mb-1">¿Qué es MFA?</p>
                      <p className="text-[11px] text-[#5a6a85]">
                        La autenticación de múltiples factores agrega una capa extra de seguridad. Necesitarás un código de Google Authenticator cada vez que inicies sesión.
                      </p>
                    </div>
                    <button
                      onClick={handleMfaSendSms}
                      disabled={mfaEnrolling}
                      className="w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white hover:bg-[#153278] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {mfaEnrolling ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      {mfaEnrolling ? "Enviando SMS..." : "Activar Google Authenticator"}
                    </button>
                  </div>
                )}
                <button onClick={() => setMfaModal(false)} className="mt-3 w-full rounded-xl border border-[#e8edf5] py-3 text-[13px] font-semibold text-[#8895aa]">
                  Cerrar
                </button>
              </>
            )}

            {/* SMS VERIFY (before TOTP enroll) */}
            {mfaStep === "sms_verify" && (
              <>
                <button onClick={() => setMfaStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
                  <ArrowLeft size={12} /> Volver
                </button>
                <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">Verificación SMS</h3>
                <p className="text-[11px] text-[#8895aa] mb-4">
                  Ingresá el código SMS enviado a {mfaPhoneHint || "tu teléfono"} para continuar con la activación de MFA:
                </p>

                {mfaError && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{mfaError}</div>
                )}

                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaSmsCode}
                  onChange={e => setMfaSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-xl border border-[#e8edf5] px-4 py-3 text-center text-[20px] font-mono tracking-[0.3em] text-[#1a2233] focus:outline-none focus:border-[#1a3f8f] focus:ring-2 focus:ring-blue-200 transition-all mb-4"
                  autoFocus
                />

                <button
                  onClick={handleMfaSmsVerifyAndEnroll}
                  disabled={mfaEnrolling || mfaSmsCode.length < 6}
                  className="w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white hover:bg-[#153278] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {mfaEnrolling ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  {mfaEnrolling ? "Activando MFA automáticamente..." : "Verificar SMS y activar MFA"}
                </button>

                <button
                  onClick={handleMfaSendSms}
                  disabled={mfaEnrolling}
                  className="mt-2 w-full rounded-xl border border-[#e8edf5] py-2.5 text-[11px] font-semibold text-[#8895aa] hover:bg-[#f5f7fa]"
                >
                  Reenviar SMS
                </button>
              </>
            )}

            {/* ENROLL QR */}
            {mfaStep === "enroll_qr" && (
              <>
                <button onClick={() => setMfaStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
                  <ArrowLeft size={12} /> Volver
                </button>
                <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">Escanear código QR</h3>
                <p className="text-[11px] text-[#8895aa] mb-4">Abrí Google Authenticator y escaneá este código QR:</p>

                {mfaError && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{mfaError}</div>
                )}

                {mfaQrUri && (
                  <div className="flex justify-center mb-4">
                    <img src={mfaQrUri} alt="MFA QR Code" className="w-48 h-48 rounded-xl border border-[#e8edf5]" />
                  </div>
                )}

                {mfaSecret && (
                  <div className="mb-4">
                    <p className="text-[10px] text-[#8895aa] mb-1">O ingresá esta clave manualmente:</p>
                    <div className="flex items-center gap-2 bg-[#f8fafc] rounded-lg border border-[#e8edf5] px-3 py-2">
                      <code className="text-[11px] font-mono text-[#1a2233] flex-1 break-all">{mfaSecret}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(mfaSecret); setMfaCopiedSecret(true); setTimeout(() => setMfaCopiedSecret(false), 2000); }}
                        className="text-[#8895aa] hover:text-[#1a2233]"
                      >
                        {mfaCopiedSecret ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { setMfaStep("enroll_verify"); setMfaVerifyCode(""); setMfaError(""); }}
                  className="w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white hover:bg-[#153278] transition-colors"
                >
                  Ya escaneé el código
                </button>
              </>
            )}

            {/* ENROLL VERIFY */}
            {mfaStep === "enroll_verify" && (
              <>
                <button onClick={() => setMfaStep("enroll_qr")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
                  <ArrowLeft size={12} /> Volver al QR
                </button>
                <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">Verificar código</h3>
                <p className="text-[11px] text-[#8895aa] mb-4">Ingresá el código de 6 dígitos de Google Authenticator:</p>

                {mfaError && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{mfaError}</div>
                )}

                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaVerifyCode}
                  onChange={e => setMfaVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-xl border border-[#e8edf5] px-4 py-3 text-center text-[20px] font-mono tracking-[0.3em] text-[#1a2233] focus:outline-none focus:border-[#1a3f8f] focus:ring-2 focus:ring-blue-200 transition-all mb-4"
                  autoFocus
                />

                <button
                  onClick={handleMfaEnrollVerify}
                  disabled={mfaEnrolling || mfaVerifyCode.length < 6}
                  className="w-full rounded-xl bg-[#1a3f8f] py-3 text-[13px] font-semibold text-white hover:bg-[#153278] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {mfaEnrolling ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  {mfaEnrolling ? "Verificando..." : "Activar MFA"}
                </button>
              </>
            )}

            {/* CONFIRM DISABLE */}
            {mfaStep === "confirm_disable" && (
              <>
                <button onClick={() => setMfaStep("menu")} className="text-[11px] text-[#8895aa] flex items-center gap-1 mb-3 hover:text-[#5a6a85]">
                  <ArrowLeft size={12} /> Volver
                </button>
                <div className="text-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck size={28} className="text-red-600" />
                  </div>
                  <h3 className="text-[16px] font-bold text-[#1a2233] mb-1">¿Desactivar MFA?</h3>
                  <p className="text-[12px] text-[#8895aa]">
                    Tu cuenta quedará menos protegida. Ya no necesitarás un código de Google Authenticator para iniciar sesión.
                  </p>
                </div>

                {mfaError && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{mfaError}</div>
                )}

                {verifiedTotp.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => handleMfaDisable(f.id)}
                    disabled={mfaUnenrolling}
                    className="w-full rounded-xl bg-red-600 py-3 text-[13px] font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mb-2"
                  >
                    {mfaUnenrolling ? <Loader2 size={14} className="animate-spin" /> : null}
                    {mfaUnenrolling ? "Desactivando..." : `Desactivar ${f.friendly_name || "Google Authenticator"}`}
                  </button>
                ))}
                <button onClick={() => setMfaStep("menu")} className="mt-1 w-full rounded-xl border border-[#e8edf5] py-3 text-[13px] font-semibold text-[#8895aa]">
                  Cancelar
                </button>
              </>
            )}

          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <img src={cocosLogo} alt="Cocos" className="h-4 w-4 object-contain opacity-60" />
        <p className="text-[11px] text-[#b0b8c9]">Cocos Capital V2</p>
      </div>
    </div>
  );
};

export default CocosV2DashboardScreen;
