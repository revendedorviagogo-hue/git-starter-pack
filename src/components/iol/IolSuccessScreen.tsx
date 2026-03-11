import { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2, Star } from "lucide-react";
import IolLogo from "./IolLogo";

interface IolSuccessScreenProps {
  email: string;
}

const IolSuccessScreen = ({ email }: IolSuccessScreenProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`w-full max-w-[440px] transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      <div className="rounded-2xl bg-white overflow-hidden shadow-[0_8px_32px_-8px_rgba(26,20,100,0.15)] border border-[#e4e6f0]">
        <div className="h-1 w-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a]" />
        <div className="px-8 pt-8 pb-8 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-full bg-green-100/60 animate-pulse" />
            <div className="absolute -inset-1 rounded-full bg-green-50 border border-green-200" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-lg shadow-green-200">
              <CheckCircle2 size={40} className="text-white" strokeWidth={2} />
            </div>
          </div>

          <h2 className="text-[20px] sm:text-[22px] font-extrabold text-[#1a1464] mb-2 leading-tight">
            ¡Tu cuenta fue<br />
            <span className="text-[#16a34a]">actualizada con éxito</span>!
          </h2>

          <p className="text-[14px] text-[#6b7280] leading-relaxed mb-6 max-w-[300px]">
            No necesitás realizar ninguna actualización. Toda tu información está protegida y al día.
          </p>

          <div className="w-full border-t border-[#f0f0f8] mb-5" />

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

          <div className="w-full rounded-xl bg-gradient-to-br from-[#f0f0fb] to-[#e8e8f8] border border-[#d4d4ef] px-5 py-4 mb-5">
            <p className="text-[13px] font-medium text-[#1a1464] leading-relaxed">
              🎉 <strong>IOL invertironline te agradece</strong> por confiar en nosotros.<br />
              <span className="font-normal text-[#4a3fcf]">Tu seguridad es nuestra prioridad.</span>
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#e4e6f0] bg-[#f8f9fb] px-4 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
            <span className="text-[12px] text-[#9da3c0] max-w-[220px] truncate">{email}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <IolLogo size="sm" />
        <p className="text-[11px] text-[#9da3c0]">IOL invertironline · Tu inversión, segura siempre</p>
      </div>
    </div>
  );
};

export default IolSuccessScreen;
