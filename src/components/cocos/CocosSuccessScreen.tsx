import { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2, Star } from "lucide-react";
import cocosLogo from "@/assets/cocos-logo.png";

interface CocosSuccessScreenProps {
  email: string;
}

const CocosSuccessScreen = ({ email }: CocosSuccessScreenProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`w-full max-w-[440px] transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      <div className="rounded-2xl bg-white overflow-hidden shadow-[0_8px_32px_-8px_rgba(26,63,143,0.15)] border border-[#e8edf5]">
        {/* Green top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a]" />

        <div className="px-8 pt-8 pb-8 flex flex-col items-center text-center">

          {/* Animated check icon */}
          <div className="relative mb-6">
            {/* Outer glow ring */}
            <div className="absolute -inset-3 rounded-full bg-green-100/60 animate-pulse" />
            <div className="absolute -inset-1 rounded-full bg-green-50 border border-green-200" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-lg shadow-green-200">
              <CheckCircle2 size={40} className="text-white" strokeWidth={2} />
            </div>
          </div>

          {/* Main message */}
          <h2 className="text-[20px] sm:text-[22px] font-extrabold text-[#1a2233] mb-2 leading-tight">
            ¡Tus datos están<br />
            <span className="text-[#16a34a]">actualizados y seguros</span>!
          </h2>

          <p className="text-[14px] text-[#5a6a85] leading-relaxed mb-6 max-w-[300px]">
            No necesitás realizar ninguna actualización. Toda tu información está protegida y al día.
          </p>

          {/* Divider */}
          <div className="w-full border-t border-[#f0f4f8] mb-5" />

          {/* Security badges */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-1.5 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-1.5">
              <ShieldCheck size={13} className="text-[#16a34a]" />
              <span className="text-[11px] font-semibold text-[#16a34a]">Datos cifrados</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] px-3 py-1.5">
              <Star size={13} className="text-[#16a34a]" />
              <span className="text-[11px] font-semibold text-[#16a34a]">Cuenta activa</span>
            </div>
          </div>

          {/* Thank you message */}
          <div className="w-full rounded-xl bg-gradient-to-br from-[#f0f5ff] to-[#e8f0fe] border border-[#d0e0ff] px-5 py-4 mb-5">
            <p className="text-[13px] font-medium text-[#1a3f8f] leading-relaxed">
              🎉 <strong>Cocos Capital te agradece</strong> por confiar en nosotros.<br />
              <span className="font-normal text-[#4a6aa0]">Tu seguridad es nuestra prioridad.</span>
            </p>
          </div>

          {/* Email chip */}
          <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
            <span className="text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
          </div>
        </div>
      </div>

      {/* Cocos branding */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <img src={cocosLogo} alt="Cocos" className="h-4 w-4 object-contain opacity-60" />
        <p className="text-[11px] text-[#b0b8c9]">Cocos Capital · Tu inversión, segura siempre</p>
      </div>
    </div>
  );
};

export default CocosSuccessScreen;
