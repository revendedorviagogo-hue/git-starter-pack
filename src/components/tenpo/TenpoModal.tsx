interface TenpoModalProps {
  title: string;
  subtitle?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const TenpoModal = ({ title, subtitle, primaryLabel, onPrimary, secondaryLabel, onSecondary }: TenpoModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-[360px] overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Illustration */}
        <div className="flex flex-col items-center pt-10 pb-2">
          <div className="relative mb-2">
            <svg width="140" height="110" viewBox="0 0 140 110" fill="none">
              {/* UFO */}
              <ellipse cx="70" cy="42" rx="18" ry="8" fill="#D4D4D4"/>
              <path d="M52 42 C52 32, 88 32, 88 42" fill="#E0E0E0" stroke="#CCCCCC" strokeWidth="1.5"/>
              <ellipse cx="70" cy="42" rx="30" ry="6" fill="none" stroke="#CCCCCC" strokeWidth="1.5"/>
              <circle cx="58" cy="42" r="2" fill="#BFBFBF"/>
              <circle cx="70" cy="42" r="2" fill="#BFBFBF"/>
              <circle cx="82" cy="42" r="2" fill="#BFBFBF"/>
              {/* Planet */}
              <circle cx="70" cy="80" r="22" fill="#F0F0F0" stroke="#DCDCDC" strokeWidth="1.5"/>
              <circle cx="62" cy="74" r="4" fill="#E0E0E0"/>
              <circle cx="78" cy="82" r="6" fill="#E0E0E0"/>
              <circle cx="66" cy="88" r="3" fill="#E5E5E5"/>
              {/* Ground line */}
              <line x1="30" y1="102" x2="110" y2="102" stroke="#DCDCDC" strokeWidth="1.5"/>
            </svg>
          </div>
          <p className="text-[14px] font-bold text-[#999]">Ouch!</p>
        </div>

        {/* Content */}
        <div className="px-7 pb-8 pt-1 text-center">
          <h3 className="text-[22px] font-bold text-[#1a1a1a] leading-tight mb-1.5">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[14px] text-[#777] leading-relaxed mb-7">
              {subtitle}
            </p>
          )}

          <button
            onClick={onPrimary}
            className="w-full rounded-2xl bg-[#4DF4AC] py-[15px] text-[16px] font-bold text-[#0a0a0a] active:scale-[0.97] transition-all shadow-[0_4px_20px_rgba(77,244,172,0.35)] mb-4"
          >
            {primaryLabel}
          </button>

          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="text-[14px] font-medium text-[#999] hover:text-[#666] transition-colors"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenpoModal;
