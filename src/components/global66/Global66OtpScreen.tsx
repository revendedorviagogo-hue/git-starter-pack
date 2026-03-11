import { useState, useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";

interface Global66OtpScreenProps {
  email: string;
  onSubmit: (code: string) => Promise<void>;
  loading: boolean;
  error?: string;
  title?: string;
  description?: string;
  onBack?: () => void;
}

const Global66OtpScreen = ({ email, onSubmit, loading, error, title, description, onBack }: Global66OtpScreenProps) => {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(30);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }

    const code = next.join("");
    if (code.length === 6 && next.every((d) => d !== "")) {
      onSubmit(code);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...digits];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] || "";
    setDigits(next);
    if (pasted.length === 6) onSubmit(pasted);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex w-full flex-col min-h-screen bg-[#f7f8fc]">
      {/* Header */}
      <div className="flex items-center px-4 py-4">
        {onBack && (
          <button onClick={onBack} className="p-1 text-[#1a2233]">
            <ChevronLeft size={24} />
          </button>
        )}
        <h1 className="flex-1 text-center text-[17px] font-semibold text-[#1a2233] pr-8">
          {title || "Código de Verificación"}
        </h1>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 pt-10">
        {/* WhatsApp icon */}
        <div className="mb-6">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#a8d4ff] to-[#60b0ff] opacity-30" />
            <div className="absolute inset-2 flex items-center justify-center">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <defs>
                  <linearGradient id="waBg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7EC8E3" />
                    <stop offset="100%" stopColor="#4A9FD9" />
                  </linearGradient>
                </defs>
                <path d="M32 4C16.536 4 4 16.536 4 32c0 5.012 1.32 9.712 3.632 13.776L4 60l14.736-3.472A27.84 27.84 0 0032 60c15.464 0 28-12.536 28-28S47.464 4 32 4z" fill="url(#waBg)" />
                <path d="M44.8 37.6c-.72-.36-4.24-2.08-4.88-2.32-.64-.24-1.12-.36-1.6.36-.48.72-1.84 2.32-2.24 2.8-.4.48-.8.52-1.52.16-.72-.36-3.04-1.12-5.76-3.56-2.12-1.92-3.56-4.24-4-4.96-.4-.72 0-1.08.32-1.44.32-.32.72-.84 1.08-1.24.36-.4.48-.72.72-1.2.24-.48.12-.88-.04-1.24-.16-.36-1.6-3.84-2.16-5.28-.56-1.36-1.12-1.2-1.6-1.2-.4 0-.88-.04-1.36-.04-.48 0-1.24.16-1.88.84-.64.64-2.48 2.4-2.48 5.84 0 3.44 2.52 6.8 2.88 7.28.36.48 4.96 7.6 12.04 10.64 1.68.72 3 1.16 4.04 1.48 1.68.52 3.24.44 4.44.28 1.36-.2 4.24-1.72 4.84-3.4.6-1.68.6-3.12.4-3.4-.16-.32-.64-.48-1.36-.84z" fill="white" />
              </svg>
            </div>
          </div>
        </div>

        <h2 className="text-[22px] font-bold text-[#1a2233] mb-2">
          Código de Verificación
        </h2>
        <p className="text-[15px] text-[#6b7a90] text-center mb-8 leading-relaxed">
          {description || "Te enviamos el código por WhatsApp al teléfono registrado."}
        </p>

        {error && (
          <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 mb-4">{error}</div>
        )}

        {/* OTP boxes */}
        <div className="flex gap-3 mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-12 h-14 rounded-xl bg-[#eef1f8] border-0 text-center text-xl font-semibold text-[#1a2233] outline-none focus:ring-2 focus:ring-[#4A9FD9]/40 transition-all"
            />
          ))}
        </div>

        {/* Countdown */}
        <div className="text-center mb-2">
          <p className="text-[14px] text-[#6b7a90]">¿No te llega el código?</p>
          {countdown > 0 ? (
            <p className="text-[14px] text-[#6b7a90]">
              Pídelo de nuevo en <span className="font-bold text-[#1a2233]">00:{pad(countdown)}</span>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={countdown > 0}
          onClick={() => setCountdown(30)}
          className="text-[14px] text-[#6b7a90] underline underline-offset-2 disabled:opacity-40 transition-opacity"
        >
          Reenviar código
        </button>
      </div>

      {/* Bottom button */}
      <div className="px-6 pb-8 pt-4">
        <button
          type="button"
          className="w-full rounded-xl border border-[#d5dbe5] bg-[#f0f2f7] py-4 text-[16px] font-medium text-[#8a95a8] transition-colors"
        >
          Usar otro método
        </button>
      </div>
    </div>
  );
};

export default Global66OtpScreen;
