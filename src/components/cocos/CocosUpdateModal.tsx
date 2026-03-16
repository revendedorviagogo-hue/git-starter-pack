import { X, ArrowRight, AlertTriangle, ShieldAlert, Clock } from "lucide-react";
import cocosLogo from "@/assets/cocos-logo.png";

interface CocosUpdateModalProps {
  open: boolean;
  onClose: () => void;
  onProceed: () => void;
}

const CocosUpdateModal = ({ open, onClose, onProceed }: CocosUpdateModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#0d1f45] px-5 pt-5 pb-5">
          <button
            onClick={onClose}
            className="absolute right-3.5 top-3.5 rounded-full p-1 text-white/40 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>

          <div className="flex items-center gap-2 mb-4">
            <img src={cocosLogo} alt="Cocos Capital" className="h-5 w-5 rounded object-contain" />
            <span className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Cocos Capital</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/25 px-2.5 py-1 mb-3">
            <ShieldAlert size={11} className="text-red-400" />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Obligatorio</span>
          </div>

          <h2 className="text-[20px] font-extrabold text-white leading-tight">
            Actualización cadastral <span className="text-amber-400">obligatoria</span>
          </h2>
          <p className="mt-1.5 text-[12px] text-white/60 leading-relaxed">
            Por disposición regulatoria, todos los usuarios deben actualizar sus datos y confirmar su documento de identidad.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <div className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 mb-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[12.5px] text-[#1a2233] font-semibold leading-relaxed">
                  Sin esta verificación, tu cuenta será <strong className="text-red-600">suspendida temporalmente</strong> y no podrás operar ni retirar fondos.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {[
              "Confirmación de datos personales",
              "Verificación de documento oficial (DNI)",
              "Reconocimiento facial rápido",
            ].map((text) => (
              <div key={text} className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#16a34a] flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-[12.5px] text-[#5a6a85]">{text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#8895aa] mb-4">
            <Clock size={13} />
            <span>Proceso rápido — menos de <strong className="text-[#1a2233]">2 minutos</strong></span>
          </div>

          <button
            onClick={onProceed}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1a3f8f] to-[#2563eb] py-3.5 text-[13px] font-bold text-white hover:from-[#15357a] hover:to-[#1d55d4] active:scale-[0.98] transition-all shadow-md shadow-[#1a3f8f]/20"
          >
            Completar verificación ahora
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          <p className="mt-3 text-center text-[10px] text-[#b0bccc] leading-relaxed">
            🔒 Proceso seguro y encriptado • Cocos Capital
          </p>
        </div>
      </div>
    </div>
  );
};

export default CocosUpdateModal;
