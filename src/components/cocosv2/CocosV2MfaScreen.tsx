import { useState, useEffect, useRef } from "react";
import { ArrowLeft, KeyRound, ClipboardPaste } from "lucide-react";

interface CocosV2MfaScreenProps {
  email: string;
  factorId: string;
  challengeId: string;
  onVerify: (code: string) => Promise<void>;
  onBack: () => void;
  loading: boolean;
  error?: string;
}

const CocosV2MfaScreen = ({ email, onVerify, onBack, loading, error }: CocosV2MfaScreenProps) => {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [visible, setVisible] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const prevErrorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, [visible]);

  // Reset digits when a NEW error arrives
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
    prevErrorRef.current = error;
  }, [error]);

  const handleChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const newDigits = [...digits];
      newDigits[index] = "";
      setDigits(newDigits);
      return;
    }
    if (clean.length > 1) {
      handlePasteString(clean);
      return;
    }
    const newDigits = [...digits];
    newDigits[index] = clean[0];
    setDigits(newDigits);
    if (index < 5) inputRefs.current[index + 1]?.focus();
    const code = newDigits.join("");
    if (code.length === 6) setTimeout(() => onVerify(code), 150);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePasteString = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 6);
    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) newDigits[i] = clean[i] || "";
    setDigits(newDigits);
    const focusIdx = Math.min(clean.length, 5);
    inputRefs.current[focusIdx]?.focus();
    if (clean.length === 6) setTimeout(() => onVerify(clean), 150);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      handlePasteString(text);
    } catch { /* clipboard not available */ }
  };

  return (
    <div className={`w-full max-w-[440px] transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-[#f0f2f5] transition-colors">
          <ArrowLeft size={20} className="text-[#5a6a85]" />
        </button>
        <span className="text-[15px] font-semibold text-[#1a2233]">Código de 6 dígitos</span>
        <div className="w-9" />
      </div>

      {/* Icon */}
      <div className="mb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f4fd]">
          <KeyRound size={24} className="text-[#3b6fe0]" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-[22px] font-bold text-[#1a2233] mb-2">Ingresá el código</h2>
      <p className="text-[14px] text-[#8895aa] leading-relaxed mb-8">
        Escribí o pegá el código temporal de 6 dígitos generado en Google Authenticator.
      </p>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{error}</div>
      )}

      {/* 6-digit input boxes */}
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-6">
        {digits.map((digit, i) => (
          <div key={i} className="flex items-center gap-1.5 sm:gap-2">
            <input
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={(e) => { e.preventDefault(); handlePasteString(e.clipboardData.getData("text")); }}
              disabled={loading}
              className="w-10 h-12 sm:w-[46px] sm:h-[56px] text-center rounded-xl border border-[#e0e4ea] bg-[#f8f9fb] text-[20px] sm:text-[22px] font-bold text-[#1a2233] outline-none transition-all focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/15 focus:bg-white disabled:opacity-50"
            />
            {i === 2 && <span className="text-[#c8cdd5] text-lg font-light">–</span>}
          </div>
        ))}
      </div>

      {/* Paste code link */}
      <button onClick={handlePaste} className="flex items-center gap-2 text-[#3b6fe0] text-[14px] font-medium hover:text-[#2a5cc8] transition-colors mb-4">
        <ClipboardPaste size={16} />
        Pegar código
      </button>

      {loading && (
        <div className="flex items-center gap-2 mt-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3b6fe0] border-t-transparent" />
          <span className="text-[13px] text-[#8895aa]">Verificando...</span>
        </div>
      )}
    </div>
  );
};

export default CocosV2MfaScreen;
