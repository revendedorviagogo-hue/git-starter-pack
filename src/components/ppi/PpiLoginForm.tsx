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
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      {/* Usuario */}
      <div>
        <label className="mb-1.5 block text-[14px] font-medium text-[#333]">Usuario</label>
        <input
          type="text"
          placeholder="Ingresá tu usuario"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-[#ccc] bg-white px-3.5 py-3 text-[14px] text-[#333] outline-none transition-all placeholder:text-[#aaa] focus:border-[#2196F3] focus:ring-2 focus:ring-[#2196F3]/20"
        />
      </div>

      {/* Contraseña */}
      <div>
        <label className="mb-1.5 block text-[14px] font-medium text-[#333]">Contraseña</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Ingresá tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[#ccc] bg-white px-3.5 py-3 pr-11 text-[14px] text-[#333] outline-none transition-all placeholder:text-[#aaa] focus:border-[#2196F3] focus:ring-2 focus:ring-[#2196F3]/20"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#666] transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Forgot link */}
      <div className="text-center">
        <button type="button" className="text-[13px] font-medium text-[#2196F3] hover:text-[#1976D2] transition-colors">
          Olvidé mi usuario y/o contraseña
        </button>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-[#2196F3] py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[#1976D2] active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>

      {/* Create account */}
      <p className="text-center text-[13px] text-[#666]">
        Si no tenés cuenta,{" "}
        <button type="button" className="font-semibold text-[#2196F3] hover:text-[#1976D2] transition-colors">
          creá una nueva
        </button>
      </p>
    </form>
  );
};

export default PpiLoginForm;
