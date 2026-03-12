import { useState } from "react";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

interface PlusLoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error?: string;
}

const PlusLoginForm = ({ onSubmit, loading, error }: PlusLoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    await onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-5 px-2">
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
          className="w-full rounded-full bg-white/10 border border-white/15 px-12 py-4 text-[15px] text-white outline-none transition-all placeholder:text-white/40 focus:border-white/30 focus:bg-white/15 backdrop-blur-sm"
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

      {/* Olvidé mi contraseña */}
      <div className="text-center">
        <button type="button" className="text-[14px] text-white/50 hover:text-white/70 transition-colors">
          Olvidé mi contraseña
        </button>
      </div>

      {/* Spacer */}
      <div className="pt-4" />

      {/* Ingresar */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-white/20 border border-white/15 py-4 text-[16px] font-semibold text-white/80 transition-all hover:bg-white/25 active:scale-[0.98] disabled:opacity-50 backdrop-blur-sm"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Ingresando...
          </span>
        ) : "Ingresar"}
      </button>

      {/* Crear Cuenta */}
      <button
        type="button"
        className="w-full rounded-full bg-purple-900/60 border border-purple-500/30 py-4 text-[16px] font-semibold text-white transition-all hover:bg-purple-900/80 backdrop-blur-sm"
      >
        Crear Cuenta
      </button>

      {/* Footer */}
      <div className="text-center pt-6 space-y-1">
        <p className="text-[11px] text-white/30">Contratos de adhesión</p>
        <p className="text-[11px] text-white/30">Ley N° 24.240 de Defensa del Consumidor</p>
        <p className="text-[11px] text-white/30">v. 2.2.4</p>
      </div>
    </form>
  );
};

export default PlusLoginForm;
