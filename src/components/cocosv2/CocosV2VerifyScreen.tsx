import { FormEvent, useMemo, useState } from "react";
import { User, Mail, Phone, CreditCard, Loader2 } from "lucide-react";
import CocosLogo from "@/components/cocos/CocosLogo";

interface LegalCandidate {
  identity_number?: string;
  full_name: string;
  gender: string;
  tax_identification_value: string;
}

interface VerifySubmitResult {
  requires_selection?: boolean;
  candidates?: LegalCandidate[];
  suggested_gender?: string;
}

interface CocosV2VerifyScreenProps {
  email: string;
  fullName: string;
  phone: string;
  onSubmit: (data: {
    identity_number: string;
    phone_number: string;
    selected_full_name?: string;
    selected_gender?: string;
    selected_tax_identification_value?: string;
  }) => Promise<void | VerifySubmitResult>;
}

const CocosV2VerifyScreen = ({ email, fullName, phone, onSubmit }: CocosV2VerifyScreenProps) => {
  const [dni, setDni] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(phone || "");
  const [selectedGender, setSelectedGender] = useState("");
  const [candidates, setCandidates] = useState<LegalCandidate[]>([]);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const candidateKey = (candidate: LegalCandidate) =>
    `${candidate.full_name}|${candidate.gender}|${candidate.tax_identification_value}`;

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidateKey(candidate) === selectedCandidateKey),
    [candidates, selectedCandidateKey],
  );

  const resetCandidateSelection = () => {
    setCandidates([]);
    setSelectedCandidateKey("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!dni.trim()) {
      setError("Ingresá tu DNI para continuar.");
      return;
    }

    if (dni.trim().length < 7) {
      setError("El DNI debe tener al menos 7 dígitos.");
      return;
    }

    if (!phone && !phoneNumber.trim()) {
      setError("Ingresá tu número de celular.");
      return;
    }

    if (candidates.length > 1 && !selectedCandidate) {
      setError("Seleccioná el nombre correcto para continuar.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const resolvedPhone = (phoneNumber.trim() || phone || "").trim();
      const result = await onSubmit({
        identity_number: dni.trim(),
        phone_number: resolvedPhone,
        selected_full_name: selectedCandidate?.full_name,
        selected_tax_identification_value: selectedCandidate?.tax_identification_value,
        selected_gender: selectedGender || undefined,
      });

      if (result?.requires_selection && result.candidates?.length) {
        setCandidates(result.candidates);
        setSelectedCandidateKey("");
        if (!selectedGender) {
          setSelectedGender(String(result.suggested_gender || result.candidates[0]?.gender || "").toUpperCase());
        }
        setError("Encontramos más de un titular para este DNI. Seleccioná el nombre correcto para continuar.");
        return;
      }

      resetCandidateSelection();
    } catch (submitError: any) {
      setError(submitError?.message || "Error al verificar. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[480px]">
      <div className="flex justify-center mb-6">
        <CocosLogo />
      </div>

      <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />
        <div className="px-7 pt-6 pb-7">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[#eef2ff] border border-[#dbe4ff] flex items-center justify-center mb-3">
              <CreditCard size={22} className="text-[#3b6fe0]" />
            </div>
            <h3 className="text-[17px] font-bold text-[#1a2233] mb-1">Verificación de identidad</h3>
            <p className="text-[13px] text-[#8895aa] max-w-[280px]">
              Confirmá tus datos para asegurar tu cuenta y completar la verificación.
            </p>
          </div>

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
                onChange={(e) => {
                  setDni(e.target.value.replace(/\D/g, ""));
                  resetCandidateSelection();
                }}
                maxLength={10}
                autoFocus
                disabled={loading}
                className="w-full rounded-xl border border-[#d8dfe8] bg-[#f8fafc] px-4 py-3 text-[14px] text-[#1a2233] outline-none transition-all placeholder:text-[#b0b8c9] focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/15 disabled:opacity-50"
              />
            </div>

            {!phone && (
              <div>
                <label className="block text-[12px] font-semibold text-[#5a6a85] mb-1.5">
                  <Phone size={13} className="inline mr-1.5 -mt-0.5" />
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

            <div>
              <label className="block text-[12px] font-semibold text-[#5a6a85] mb-1.5">Sexo (opcional)</label>
              <select
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value.toUpperCase())}
                disabled={loading}
                className="w-full rounded-xl border border-[#d8dfe8] bg-[#f8fafc] px-4 py-3 text-[14px] text-[#1a2233] outline-none transition-all focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/15 disabled:opacity-50"
              >
                <option value="">Seleccionar</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
            </div>

            {candidates.length > 1 && (
              <div className="rounded-xl border border-[#d8dfe8] bg-[#f8fafc] p-3">
                <p className="text-[12px] font-semibold text-[#5a6a85] mb-2">Seleccioná tu nombre</p>
                <div className="space-y-2">
                  {candidates.map((candidate) => {
                    const key = candidateKey(candidate);
                    const isSelected = selectedCandidateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedCandidateKey(key)}
                        disabled={loading}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${isSelected ? "border-[#3b6fe0] bg-[#eef2ff]" : "border-[#d8dfe8] bg-white hover:border-[#9ab3ef]"}`}
                      >
                        <p className="text-[13px] font-semibold text-[#1a2233] truncate">{candidate.full_name}</p>
                        <p className="text-[11px] text-[#8895aa]">CUIT: {candidate.tax_identification_value} • Sexo: {candidate.gender || "-"}</p>
                      </button>
                    );
                  })}
                </div>
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
