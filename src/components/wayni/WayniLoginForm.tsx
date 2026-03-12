import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface WayniLoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error?: string;
}

const WayniLoginForm = ({ onSubmit, loading, error }: WayniLoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tab, setTab] = useState<"email" | "celular">("email");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    await onSubmit(email, password);
  };

  return (
    <div className="w-full">
      <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-6">Accedé a tu billetera:</h2>

      {/* Google button */}
      <button
        type="button"
        className="w-full rounded-full bg-[#e74c3c] hover:bg-[#d44332] text-white font-semibold py-3.5 text-[15px] transition-colors mb-5"
      >
        Ingresá con Google
      </button>

      {/* Divider */}
      <p className="text-[13px] text-[#666] mb-3">O ingresá con:</p>

      {/* Tabs */}
      <div className="flex mb-5">
        <button
          type="button"
          onClick={() => setTab("email")}
          className={`flex-1 py-2.5 text-[14px] font-medium rounded-full border transition-colors ${
            tab === "email"
              ? "border-[#1a1a1a] text-[#1a1a1a] bg-white"
              : "border-transparent text-[#999] bg-transparent"
          }`}
        >
          Email o DNI
        </button>
        <button
          type="button"
          onClick={() => setTab("celular")}
          className={`flex-1 py-2.5 text-[14px] font-medium rounded-full border transition-colors ${
            tab === "celular"
              ? "border-[#1a1a1a] text-[#1a1a1a] bg-white"
              : "border-transparent text-[#999] bg-transparent"
          }`}
        >
          Celular
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Email/DNI field */}
        <div>
          <label className="block text-[13px] font-medium text-[#1a1a1a] mb-1.5">
            {tab === "email" ? "Email o DNI" : "Número de celular"}
          </label>
          <input
            type={tab === "email" ? "text" : "tel"}
            placeholder={tab === "email" ? "Ingresá tu correo o DNI" : "Ingresá tu número"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[#ddd] bg-white px-4 py-3 text-[15px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#aaa] focus:border-[#999]"
            required
          />
        </div>

        {/* Password field */}
        <div>
          <label className="block text-[13px] font-medium text-[#1a1a1a] mb-1.5">Contraseña</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Ingresá tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#ddd] bg-white px-4 py-3 pr-12 text-[15px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#aaa] focus:border-[#999]"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#666] transition-colors"
            >
              {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
        </div>

        {/* Forgot password */}
        <div className="text-right">
          <button type="button" className="text-[14px] font-medium text-[#1a1a1a] hover:underline">
            No recuerdo mi contraseña
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[#1a1a1a] hover:bg-[#333] text-white font-semibold py-3.5 text-[15px] transition-colors disabled:opacity-50 mt-2"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Ingresando...
            </span>
          ) : "Ingresar"}
        </button>

        {/* Help */}
        <p className="text-center text-[14px] font-medium text-[#1a1a1a] hover:underline cursor-pointer">
          Necesito ayuda
        </p>

        {/* reCAPTCHA text */}
        <p className="text-[11px] text-[#999] text-center leading-relaxed mt-1">
          Este sitio está protegido por reCAPTCHA y se aplicarán la Política de privacidad y las Condiciones de servicio de Google.
        </p>
      </form>
    </div>
  );
};

export default WayniLoginForm;
