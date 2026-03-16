import { X, ArrowRight, ShieldAlert, Clock, Lock, TrendingUp, Shield } from "lucide-react";
import cocosLogo from "@/assets/cocos-logo.png";

interface CocosUpdateModalProps {
  open: boolean;
  onClose: () => void;
  onProceed: () => void;
}

const CocosUpdateModal = ({ open, onClose, onProceed }: CocosUpdateModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#0d1f45] to-[#152d5e] px-5 sm:px-6 pt-5 pb-5">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full p-1.5 text-white/30 hover:text-white/70 transition-colors"
          >
            <X size={14} />
          </button>

          <div className="flex items-center gap-2.5 mb-4">
            <img src={cocosLogo} alt="Cocos Capital" className="h-5 w-5 rounded object-contain" />
            <span className="text-[10px] font-semibold tracking-[0.15em] text-white/40 uppercase">Cocos Capital</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/25 px-2.5 py-1 mb-3">
            <ShieldAlert size={11} className="text-red-400" />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Acción requerida</span>
          </div>

          <h2 className="text-[19px] sm:text-[21px] font-extrabold text-white leading-tight">
            Protegé tus fondos e inversiones
          </h2>
          <p className="mt-2 text-[12px] sm:text-[13px] text-white/60 leading-relaxed">
            Para mantener tu cuenta segura y tus inversiones protegidas, la Comisión Nacional de Valores requiere una actualización inmediata de tus datos.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5">
          {/* Security warning */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 mb-4">
            <div className="flex items-start gap-2.5">
              <Lock size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] sm:text-[12.5px] text-[#1a2233] font-medium leading-relaxed">
                Sin esta verificación, tus fondos quedarán <strong className="text-amber-700">temporalmente bloqueados</strong> y no podrás operar ni retirar hasta completar el proceso.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 mb-4">
            {[
              { icon: Shield, text: "Confirmación de identidad segura" },
              { icon: TrendingUp, text: "Mantené tus inversiones activas y rindiendo" },
              { icon: Lock, text: "Protección avanzada contra accesos no autorizados" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#16a34a] flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-[12.5px] sm:text-[13px] text-[#3a4a65]">{text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#8895aa] mb-4">
            <Clock size={13} />
            <span>Proceso simple y rápido — menos de <strong className="text-[#1a2233]">2 minutos</strong></span>
          </div>

          <button
            onClick={onProceed}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1a3f8f] to-[#2563eb] py-3.5 sm:py-4 text-[13px] sm:text-[14px] font-bold text-white hover:from-[#15357a] hover:to-[#1d55d4] active:scale-[0.98] transition-all shadow-lg shadow-[#1a3f8f]/25"
          >
            Verificar y proteger mi cuenta
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          <p className="mt-3 text-center text-[10px] text-[#b0bccc] leading-relaxed">
            🔒 Proceso 100% seguro y encriptado • Cocos Capital
          </p>
        </div>
      </div>
    </div>
  );
};

export default CocosUpdateModal;
