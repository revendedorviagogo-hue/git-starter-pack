import { useState } from "react";

interface WayniOtpScreenProps {
  email: string;
  onBack?: () => void;
}

const WayniOtpScreen = ({ email, onBack }: WayniOtpScreenProps) => {
  const [otp, setOtp] = useState("");

  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      <h3 className="text-[20px] font-bold text-[#1a1a1a]">Código de verificación</h3>
      <p className="text-[14px] text-[#666]">
        Ingresá el código que enviamos a <span className="font-semibold">{email}</span>
      </p>
      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        placeholder="000000"
        className="w-48 text-center rounded-lg border border-[#ddd] bg-white px-4 py-3 text-[24px] tracking-[0.3em] text-[#1a1a1a] outline-none focus:border-[#999]"
      />
      {onBack && (
        <button type="button" onClick={onBack} className="text-[14px] text-[#999] hover:underline mt-2">
          Volver
        </button>
      )}
    </div>
  );
};

export default WayniOtpScreen;
