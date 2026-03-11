import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface CocosV2LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error?: string;
}

const CocosV2LoginForm = ({ onSubmit, loading, error }: CocosV2LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;
    if (!email.trim()) { setEmailError("Ingresá tu email para continuar."); valid = false; } else setEmailError("");
    if (!password.trim()) { setPasswordError("Ingresá tu contraseña para continuar."); valid = false; } else setPasswordError("");
    if (!valid) return;
    await onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      {/* Email */}
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-[#5a6a85]">Email</label>
        <input
          type="text"
          placeholder="Ingresá tu email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
          className={`w-full rounded-xl border bg-white px-4 py-3.5 text-[15px] text-[#1a2233] outline-none transition-all placeholder:text-[#b0b8c9] focus:ring-2 ${
            emailError ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-[#d8dfe8] focus:border-[#3b6fe0] focus:ring-[#3b6fe0]/15"
          }`}
        />
        {emailError && <p className="mt-1.5 text-[12px] text-red-500">{emailError}</p>}
      </div>

      {/* Contraseña */}
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-[#5a6a85]">Contraseña</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Ingresá tu contraseña"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
            className={`w-full rounded-xl border bg-white px-4 py-3.5 pr-11 text-[15px] text-[#1a2233] outline-none transition-all placeholder:text-[#b0b8c9] focus:ring-2 ${
              passwordError ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-[#d8dfe8] focus:border-[#3b6fe0] focus:ring-[#3b6fe0]/15"
            }`}
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8895aa] hover:text-[#5a6a85] transition-colors">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {passwordError && <p className="mt-1.5 text-[12px] text-red-500">{passwordError}</p>}
      </div>

      <div>
        <button type="button" className="text-[13px] font-medium text-[#3b6fe0] hover:text-[#2a5bc0] transition-colors">
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      <div className="flex-1 min-h-[24px]" />

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl border-2 border-[#d8dfe8] bg-white py-4 text-[15px] font-semibold text-[#1a2233] transition-all active:scale-[0.98] hover:bg-[#f5f7fa] disabled:opacity-60"
      >
        {loading ? "Iniciando..." : "Iniciar sesión"}
      </button>

      <button
        type="button"
        className="w-full rounded-xl border-2 border-[#d8dfe8] bg-white py-4 text-[15px] font-semibold text-[#1a2233] transition-all active:scale-[0.98] hover:bg-[#f5f7fa]"
      >
        No tengo cuenta
      </button>
    </form>
  );
};

export default CocosV2LoginForm;
