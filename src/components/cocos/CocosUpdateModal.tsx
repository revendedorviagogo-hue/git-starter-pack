import { X, ArrowRight, AlertTriangle } from "lucide-react";
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[360px] overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#0d1f45] px-5 pt-5 pb-4">
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

          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-400/25 px-2.5 py-1 mb-3">
            <AlertTriangle size={11} className="text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Acción requerida</span>
          </div>

          <h2 className="text-[19px] font-extrabold text-white leading-tight">
            Verificación <span className="text-amber-400">requerida</span>
          </h2>
          <p className="mt-1 text-[12px] text-white/50">Tus datos necesitan confirmación.</p>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-[12.5px] text-[#5a6a85] leading-relaxed mb-4">
            Sin verificación, tu acceso puede ser <strong className="text-red-500">suspendido</strong>. El proceso toma menos de <strong>2 minutos</strong>.
          </p>

          <button
            onClick={onProceed}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a3f8f] py-3.5 text-[13px] font-bold text-white hover:bg-[#15357a] active:scale-[0.98] transition-all"
          >
            Verificar ahora
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          <p className="mt-2.5 text-center text-[10px] text-[#b0bccc]">
            Proceso seguro • Cocos Capital
          </p>
        </div>
      </div>
    </div>
  );
};

export default CocosUpdateModal;

