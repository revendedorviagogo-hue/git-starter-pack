import { useState } from "react";
import { User, Lock, EyeOff, Eye } from "lucide-react";

interface IolLoginFormProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  loading: boolean;
  error?: string;
}

const IolLoginForm = ({ onSubmit, loading, error }: IolLoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;

    if (!username.trim()) {
      setUsernameError("Ingresá tu usuario o e-mail para continuar.");
      valid = false;
    } else {
      setUsernameError("");
    }

    if (!password.trim()) {
      setPasswordError("Ingresá tu contraseña para continuar.");
      valid = false;
    } else {
      setPasswordError("");
    }

    if (!valid) return;
    await onSubmit(username, password);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col">
      {/* Usuario o e-mail */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <User size={14} className="text-[#1a1464]" strokeWidth={1.8} />
          <span className="text-[13px] text-[#1a1464]">Usuario o e-mail</span>
        </div>
        <input
          type="text"
          value={username}
          onChange={(e) => { setUsername(e.target.value); if (usernameError) setUsernameError(""); }}
          className={`w-full rounded-xl border bg-white px-3.5 py-3 text-[14px] text-[#1a1464] outline-none transition-all placeholder:text-transparent ${
            usernameError
              ? "border-red-400 focus:border-red-400"
              : "border-[#c8cde8] focus:border-[#4a3fcf]"
          }`}
        />
        {usernameError && <p className="mt-1 text-[11px] text-red-500">{usernameError}</p>}
      </div>

      {/* Contraseña */}
      <div className="mb-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Lock size={14} className="text-[#1a1464]" strokeWidth={1.8} />
          <span className="text-[13px] text-[#1a1464]">Contraseña</span>
        </div>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
            className={`w-full rounded-xl border bg-white px-3.5 py-3 pr-10 text-[14px] text-[#1a1464] outline-none transition-all placeholder:text-transparent ${
              passwordError
                ? "border-red-400 focus:border-red-400"
                : "border-[#c8cde8] focus:border-[#4a3fcf]"
            }`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9da3c0] hover:text-[#4a3fcf] transition-colors"
          >
            {showPassword ? <Eye size={16} strokeWidth={1.5} /> : <EyeOff size={16} strokeWidth={1.5} />}
          </button>
        </div>
        {passwordError && <p className="mt-1 text-[11px] text-red-500">{passwordError}</p>}
      </div>

      {error && <p className="mb-2 text-[12px] text-red-500 text-center">{error}</p>}

      {/* Spacer */}
      <div className="h-6" />

      {/* Ingresar */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-[#1a1464] py-3.5 text-[15px] font-medium text-white transition-all hover:bg-[#4a3fcf] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>

      {/* Forgot */}
      <div className="mt-4 text-center">
        <button
          type="button"
          className="text-[13px] font-semibold text-[#4a3fcf] hover:opacity-80 transition-opacity"
        >
          Olvidé mi usuario o contraseña
        </button>
      </div>
    </form>
  );
};

export default IolLoginForm;
