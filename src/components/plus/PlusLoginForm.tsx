import { useState } from "react";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

interface PlusLoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error?: string;
  variant?: "mobile" | "desktop";
}

const PlusLoginForm = ({ onSubmit, loading, error, variant = "mobile" }: PlusLoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    await onSubmit(email, password);
  };

  const isDesktop = variant === "desktop";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-200 text-center backdrop-blur-sm">
          {error}
        </div>
      )}

      {/* Email */}
      <div className="relative">
        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full ${isDesktop ? "rounded-full" : "rounded-full"} bg-white/10 border border-white/15 px-12 py-4 text-[15px] text-white outline-none transition-all placeholder:text-white/40 focus:border-white/30 focus:bg-white/15 backdrop-blur-sm`}
          required
          autoComplete="email"
        />
      </div>

      {/* Contraseña */}
      <div className="relative">
        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-full bg-white/10 border border-white/15 px-12 py-4 pr-12 text-[15px] text-white outline-none transition-all placeholder:text-white/40 focus:border-white/30 focus:bg-white/15 backdrop-blur-sm"
          required
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
        >
          {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
      </div>

      {/* Olvidé mi clave */}
      <div className={isDesktop ? "text-left" : "text-center"}>
        <button type="button" className="text-[14px] text-pink-400 hover:text-pink-300 transition-colors italic">
          Olvidé mi clave
        </button>
      </div>

      {/* Spacer */}
      <div className="pt-2" />

      {/* Ingresar */}
      <button
        type="submit"
        disabled={loading}
        className={`w-full rounded-full py-4 text-[16px] font-semibold transition-all active:scale-[0.98] disabled:opacity-50 backdrop-blur-sm ${
          isDesktop
            ? "bg-black text-white hover:bg-black/80"
            : "bg-white/20 border border-white/15 text-white/80 hover:bg-white/25"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Ingresando...
          </span>
        ) : "Ingresar"}
      </button>

      {/* Crear Cuenta - only mobile */}
      {!isDesktop && (
        <button
          type="button"
          className="w-full rounded-full bg-purple-900/60 border border-purple-500/30 py-4 text-[16px] font-semibold text-white transition-all hover:bg-purple-900/80 backdrop-blur-sm"
        >
          Crear Cuenta
        </button>
      )}
    </form>
  );
};

export default PlusLoginForm;
