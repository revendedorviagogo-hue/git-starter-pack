import { useState } from "react";
import { ArrowLeft } from "lucide-react";

interface TenpoLoginFormProps {
  onSubmit: (email: string) => void;
  onBack: () => void;
  loading: boolean;
  error?: string;
}

const TenpoLoginForm = ({ onSubmit, onBack, loading, error }: TenpoLoginFormProps) => {
  const [email, setEmail] = useState("");

  const isValid = email.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit(email.trim());
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0a0a0a] text-white">
      {/* Back button */}
      <div className="px-5 pt-6">
        <button onClick={onBack} className="text-[#888] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col justify-between px-6 pt-8 pb-10">
        <div>
          <h1 className="text-[26px] font-bold text-white leading-tight mb-2">
            Inicia sesión en Tenpo
          </h1>
          <p className="text-[15px] text-[#888] mb-10">
            Ingresa tu correo electrónico o tu RUT
          </p>

          {error && (
            <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-1">
              <label className="block text-[13px] text-[#888] mb-1.5">Correo o RUT</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                disabled={loading}
                className="w-full border-b-2 border-[#333] bg-transparent pb-2.5 text-[16px] text-white outline-none transition-colors placeholder:text-[#555] focus:border-[#4DF4AC]"
              />
            </div>
          </form>
        </div>

        {/* Confirmar button */}
        <button
          onClick={() => { if (isValid) onSubmit(email.trim()); }}
          disabled={loading || !isValid}
          className={`w-full rounded-full py-4 text-[16px] font-semibold transition-all ${
            isValid
              ? "bg-[#4DF4AC] text-[#0a0a0a] active:scale-[0.98]"
              : "border border-[#333] bg-transparent text-[#555]"
          } disabled:opacity-60`}
        >
          {loading ? "Cargando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
};

export default TenpoLoginForm;
