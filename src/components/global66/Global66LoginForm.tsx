import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Global66LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error?: string;
}

const Global66LoginForm = ({ onSubmit, loading, error }: Global66LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [socialError, setSocialError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    await onSubmit(email, password);
  };

  const handleSocialClick = () => {
    setSocialError("Este método de inicio de sesión está deshabilitado. Por favor, usá tu correo electrónico.");
    setTimeout(() => setSocialError(""), 4000);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      {socialError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{socialError}</div>
      )}

      {/* Correo electrónico */}
      <div>
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-[#d5dbe5] bg-white px-4 py-4 text-[15px] text-[#1a2233] outline-none transition-all placeholder:text-[#9ba5b7] focus:border-[#2b4ea2] focus:ring-2 focus:ring-[#2b4ea2]/10"
          required
        />
      </div>

      {/* Contraseña */}
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-[#d5dbe5] bg-white px-4 py-4 pr-12 text-[15px] text-[#1a2233] outline-none transition-all placeholder:text-[#9ba5b7] focus:border-[#2b4ea2] focus:ring-2 focus:ring-[#2b4ea2]/10"
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9ba5b7] hover:text-[#5a6a85] transition-colors"
        >
          {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
      </div>

      {/* Continuar */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-[#2b4ea2] py-4 text-[16px] font-semibold text-white transition-all hover:bg-[#233f85] active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? "Cargando..." : "Continuar"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-[#d5dbe5]" />
        <span className="text-xs font-medium tracking-wider text-[#9ba5b7] uppercase">O continuar con</span>
        <div className="h-px flex-1 bg-[#d5dbe5]" />
      </div>

      {/* Social buttons - disabled */}
      <div className="grid grid-cols-3 gap-3">
        <button type="button" onClick={handleSocialClick} className="flex items-center justify-center rounded-xl border border-[#e2e7ef] bg-[#f5f7fa] py-3.5 transition-colors hover:bg-[#ebeef3] opacity-60">
          <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.003 24.003 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        </button>
        <button type="button" onClick={handleSocialClick} className="flex items-center justify-center rounded-xl border border-[#e2e7ef] bg-[#f5f7fa] py-3.5 transition-colors hover:bg-[#ebeef3] opacity-60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </button>
        <button type="button" onClick={handleSocialClick} className="flex items-center justify-center rounded-xl border border-[#e2e7ef] bg-[#f5f7fa] py-3.5 transition-colors hover:bg-[#ebeef3] opacity-60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#000"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
        </button>
      </div>

      {/* Bottom links */}
      <div className="flex flex-col items-center gap-4 pt-4">
        <div className="text-center">
          <p className="text-[14px] text-[#4a5568]">¿Aún no tenés cuenta?</p>
          <button type="button" className="text-[14px] font-semibold text-[#2b4ea2] hover:text-[#233f85] transition-colors">
            Crear cuenta
          </button>
        </div>
        <div className="text-center">
          <p className="text-[14px] text-[#4a5568]">¿Olvidaste tu contraseña?</p>
          <button type="button" className="text-[14px] font-semibold text-[#2b4ea2] hover:text-[#233f85] transition-colors">
            Restablecer contraseña
          </button>
        </div>
      </div>
    </form>
  );
};

export default Global66LoginForm;
