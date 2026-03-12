import { useState } from "react";

interface PlusOtpScreenProps {
  email: string;
  onSubmit: (code: string) => Promise<void>;
  loading: boolean;
  error?: string;
}

const PlusOtpScreen = ({ email, onSubmit, loading, error }: PlusOtpScreenProps) => {
  const [code, setCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    await onSubmit(code);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="text-center">
        <p className="text-white/90 text-lg font-semibold">Código de verificación</p>
        <p className="text-white/40 text-sm mt-2">Ingresá el código enviado a</p>
        <p className="text-white/60 text-sm font-medium">{email}</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 px-2">
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-200 text-center backdrop-blur-sm">
            {error}
          </div>
        )}

        <input
          type="text"
          inputMode="numeric"
          placeholder="Código"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className="w-full rounded-full bg-white/10 border border-white/15 px-6 py-4 text-center text-xl text-white tracking-[0.3em] outline-none transition-all placeholder:text-white/30 placeholder:tracking-normal focus:border-white/30 focus:bg-white/15 backdrop-blur-sm font-mono"
          required
          autoFocus
        />

        <button
          type="submit"
          disabled={loading || code.length < 4}
          className="w-full rounded-full bg-white/20 border border-white/15 py-4 text-[16px] font-semibold text-white/80 transition-all hover:bg-white/25 active:scale-[0.98] disabled:opacity-50 backdrop-blur-sm"
        >
          {loading ? "Verificando..." : "Verificar"}
        </button>
      </form>
    </div>
  );
};

export default PlusOtpScreen;
