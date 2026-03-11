import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, Star } from "lucide-react";
import cocosLogo from "@/assets/cocos-logo.png";

interface CocosV2SuccessScreenProps {
  email: string;
  onContinue: () => void;
}

const CocosV2SuccessScreen = ({ email, onContinue }: CocosV2SuccessScreenProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`w-full max-w-[440px] transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      <div className="rounded-2xl bg-white overflow-hidden shadow-[0_8px_32px_-8px_rgba(26,63,143,0.15)] border border-[#e8edf5]">
        <div className="h-1 w-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a]" />

        <div className="px-8 pt-8 pb-8 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-full bg-green-100/60 animate-pulse" />
            <div className="absolute -inset-1 rounded-full bg-green-50 border border-green-200" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-lg shadow-green-200">
              <CheckCircle2 size={40} className="text-white" strokeWidth={2} />
            </div>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#1a2233] mb-2">
            ¡Verificación <span className="text-[#16a34a]">completada</span>!
          </h2>
          <p className="text-[14px] text-[#5a6a85] leading-relaxed mb-6 max-w-[300px]">
            Tu identidad fue verificada exitosamente. Ya podés acceder a tu cuenta completa.
          </p>

          <div className="w-full border-t border-[#f0f4f8] mb-5" />

          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-1.5 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-1.5">
              <ShieldCheck size={13} className="text-[#16a34a]" />
              <span className="text-[11px] font-semibold text-[#16a34a]">MFA Activo</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-1.5">
              <Star size={13} className="text-[#16a34a]" />
              <span className="text-[11px] font-semibold text-[#16a34a]">AAL2</span>
            </div>
          </div>

          <button
            onClick={onContinue}
            className="w-full rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] py-3.5 text-[14px] font-bold text-white transition-all hover:from-[#15803d] hover:to-[#16a34a] active:scale-[0.98] shadow-md shadow-green-200"
          >
            Ir al dashboard
          </button>

          <div className="mt-4 flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
            <span className="text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CocosV2SuccessScreen;
