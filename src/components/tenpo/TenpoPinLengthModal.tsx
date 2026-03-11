interface TenpoPinLengthModalProps {
  onSelect: (length: 4 | 6) => void;
  onClose: () => void;
}

const TenpoPinLengthModal = ({ onSelect, onClose }: TenpoPinLengthModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-[360px] overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Illustration area */}
        <div className="flex flex-col items-center pt-10 pb-2">
          <div className="relative mb-2">
            <svg width="120" height="90" viewBox="0 0 120 90" fill="none">
              {/* Simple lock/key illustration */}
              <rect x="35" y="30" width="50" height="40" rx="8" fill="#E8E8E8" stroke="#CCCCCC" strokeWidth="2"/>
              <rect x="45" y="18" width="30" height="20" rx="10" fill="none" stroke="#CCCCCC" strokeWidth="3"/>
              <circle cx="60" cy="50" r="6" fill="#4DF4AC"/>
              <rect x="58" y="54" width="4" height="10" rx="2" fill="#4DF4AC"/>
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-[#999] tracking-wide uppercase">Verificación</p>
        </div>

        {/* Content */}
        <div className="px-7 pb-8 pt-2 text-center">
          <h3 className="text-[22px] font-bold text-[#1a1a1a] leading-tight mb-1.5">
            Tipo de clave
          </h3>
          <p className="text-[14px] text-[#777] leading-relaxed mb-7">
            ¿Tu clave de acceso es de 4 o 6 dígitos?
          </p>

          <button
            onClick={() => onSelect(4)}
            className="w-full rounded-2xl bg-[#4DF4AC] py-[15px] text-[16px] font-bold text-[#0a0a0a] active:scale-[0.97] transition-all shadow-[0_4px_20px_rgba(77,244,172,0.35)] mb-3"
          >
            4 dígitos
          </button>

          <button
            onClick={() => onSelect(6)}
            className="w-full rounded-2xl border border-[#e5e5e5] bg-[#f7f7f7] py-[15px] text-[16px] font-bold text-[#1a1a1a] active:scale-[0.97] transition-all mb-5"
          >
            6 dígitos
          </button>

          <button
            onClick={onClose}
            className="text-[14px] font-medium text-[#999] hover:text-[#666] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenpoPinLengthModal;
