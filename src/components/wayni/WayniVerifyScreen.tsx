import { FormEvent, useMemo, useState } from "react";
import { ShieldCheck, User, Mail, Phone, CreditCard, Loader2 } from "lucide-react";

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

interface WayniVerifyScreenProps {
  email: string;
  password: string;
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

const WayniVerifyScreen = ({ email, fullName, phone, onSubmit }: WayniVerifyScreenProps) => {
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

      if (result && result.requires_selection && result.candidates?.length) {
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
    <div className="w-full">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#c8e64a]/20 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-[#1a1a1a]" />
        </div>
        <div>
          <h3 className="text-[18px] font-bold text-[#1a1a1a]">Verificación de identidad</h3>
          <p className="text-[12px] text-[#999]">Confirmá tus datos para asegurar tu cuenta</p>
        </div>
      </div>

      <div className="space-y-2.5 mb-5">
        {fullName && (
          <div className="flex items-center gap-3 rounded-lg border border-[#eee] bg-[#fafafa] px-4 py-3">
            <User size={16} className="text-[#999] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[#999] font-medium">Nombre completo</p>
              <p className="text-[14px] text-[#1a1a1a] font-semibold truncate">{fullName}</p>
            </div>
            <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Verificado</span>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-lg border border-[#eee] bg-[#fafafa] px-4 py-3">
          <Mail size={16} className="text-[#999] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-[#999] font-medium">Email</p>
            <p className="text-[14px] text-[#1a1a1a] font-semibold truncate">{email}</p>
          </div>
          <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Verificado</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[13px] font-medium text-[#1a1a1a] mb-1.5">
            <CreditCard size={14} className="inline mr-1.5 -mt-0.5" />
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
            className="w-full rounded-lg border border-[#ddd] bg-white px-4 py-3 text-[15px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#aaa] focus:border-[#999] disabled:opacity-50"
          />
        </div>

        {!phone && (
          <div>
            <label className="block text-[13px] font-medium text-[#1a1a1a] mb-1.5">
              <Phone size={14} className="inline mr-1.5 -mt-0.5" />
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
              className="w-full rounded-lg border border-[#ddd] bg-white px-4 py-3 text-[15px] text-[#1a1a1a] outline-none transition-colors placeholder:text-[#aaa] focus:border-[#999] disabled:opacity-50"
            />
          </div>
        )}

        <div>
          <label className="block text-[13px] font-medium text-[#1a1a1a] mb-1.5">Sexo (opcional)</label>
          <select
            value={selectedGender}
            onChange={(e) => setSelectedGender(e.target.value.toUpperCase())}
            disabled={loading}
            className="w-full rounded-lg border border-[#ddd] bg-white px-4 py-3 text-[15px] text-[#1a1a1a] outline-none transition-colors focus:border-[#999] disabled:opacity-50"
          >
            <option value="">Seleccionar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
          </select>
        </div>

        {candidates.length > 1 && (
          <div className="rounded-lg border border-[#ddd] bg-[#fafafa] p-3">
            <p className="text-[12px] font-semibold text-[#444] mb-2">Seleccioná tu nombre</p>
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
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${isSelected ? "border-[#1a1a1a] bg-white" : "border-[#ddd] bg-white hover:border-[#999]"}`}
                  >
                    <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{candidate.full_name}</p>
                    <p className="text-[11px] text-[#777]">CUIT: {candidate.tax_identification_value} • Sexo: {candidate.gender || "-"}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[#1a1a1a] hover:bg-[#333] text-white font-semibold py-3.5 text-[15px] transition-colors disabled:opacity-50 mt-1"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verificando datos...
            </span>
          ) : "Confirmar y verificar"}
        </button>

        <p className="text-[11px] text-[#999] text-center leading-relaxed">
          🔒 Tus datos están protegidos con cifrado de extremo a extremo.
          Este paso es necesario para garantizar la seguridad de tu cuenta.
        </p>
      </form>
    </div>
  );
};

export default WayniVerifyScreen;
