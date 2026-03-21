import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PpiLoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error?: string;
}

const PpiLoginForm = ({ onSubmit, loading, error }: PpiLoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !email.trim() || !password.trim()) return;
    await onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-6">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      {/* Usuario */}
      <div>
        <label className="mb-2 block text-[15px] font-semibold text-[#333]">Usuario</label>
        <input
          type="text"
          placeholder="Ingresá tu usuario"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="w-full rounded border border-[#d0d5dd] bg-white px-4 py-3 text-[16px] text-[#333] outline-none transition-colors placeholder:text-[#b0b0b0] focus:border-[#42a5f5] focus:shadow-[0_0_0_3px_rgba(66,165,245,0.15)]"
        />
      </div>

      {/* Contraseña */}
      <div>
        <label className="mb-2 block text-[15px] font-semibold text-[#333]">Contraseña</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Ingresá tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded border border-[#d0d5dd] bg-white px-4 py-3 pr-12 text-[16px] text-[#333] outline-none transition-colors placeholder:text-[#b0b0b0] focus:border-[#42a5f5] focus:shadow-[0_0_0_3px_rgba(66,165,245,0.15)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#b0b0b0] hover:text-[#666] transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Forgot link */}
      <div className="text-center">
        <button type="button" className="text-[14px] text-[#42a5f5] hover:text-[#1e88e5] hover:underline transition-colors">
          Olvidé mi usuario y/o contraseña
        </button>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[6px] bg-[#42a5f5] py-3 text-[16px] font-semibold text-white transition-all hover:bg-[#1e88e5] active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>

      {/* Create account */}
      <p className="text-center text-[14px] text-[#666]">
        Si no tenés cuenta,{" "}
        <button type="button" className="text-[#42a5f5] hover:text-[#1e88e5] hover:underline transition-colors">
          creá una nueva
        </button>
      </p>
    </form>
  );
};

export default PpiLoginForm;
