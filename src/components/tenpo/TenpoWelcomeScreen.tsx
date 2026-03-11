import { useState, useEffect, useCallback, useRef } from "react";

interface TenpoWelcomeScreenProps {
  onLogin: () => void;
}

const slides = [
  {
    title: "Compra en tus comercios internacionales y nacionales favoritos con",
    highlight: "tu tarjeta Tenpo Mastercard.",
  },
  {
    title: "Envía dinero a cualquier parte del mundo con",
    highlight: "transferencias internacionales.",
  },
  {
    title: "Ahorra e invierte de manera simple con",
    highlight: "Tenpo Inversiones.",
  },
  {
    title: "Paga tus cuentas y servicios desde la app con",
    highlight: "pagos en línea.",
  },
];

const TenpoWelcomeScreen = ({ onLogin }: TenpoWelcomeScreenProps) => {
  const [current, setCurrent] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback((idx: number) => {
    setFade(false);
    setTimeout(() => {
      setCurrent(idx);
      setFade(true);
    }, 200);
  }, []);

  // Auto-advance
  useEffect(() => {
    timerRef.current = setInterval(() => {
      goTo((current + 1) % slides.length);
    }, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [current, goTo]);

  const handleDotClick = (idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    goTo(idx);
  };

  // Swipe support
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (diff > 0) goTo((current + 1) % slides.length);
      else goTo((current - 1 + slides.length) % slides.length);
    }
  };

  const slide = slides[current];

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-[#0a0a0a] text-white"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar / dots */}
      <div className="flex items-center gap-1.5 px-5 pt-6">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => handleDotClick(i)}
            className={`h-[3px] flex-1 rounded-full transition-all duration-500 ${
              i === current ? "bg-[#4DF4AC]" : i < current ? "bg-[#4DF4AC]/40" : "bg-[#1a3a2a]"
            }`}
          />
        ))}
      </div>

      {/* Hero area */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* Card mockup */}
        <div className="relative mb-10 w-full max-w-[320px] h-[280px] flex items-center justify-center">
          {/* Phone frame */}
          <div className="relative z-10 w-[155px] h-[270px] rounded-[22px] border-2 border-[#1a1a1a] bg-[#0f0f0f] shadow-2xl shadow-[#4DF4AC]/5 overflow-hidden">
            <div className="px-3 pt-4">
              <div className="text-[8px] text-[#555] mb-1">Tarjeta</div>
              <div className="w-full h-[75px] rounded-lg bg-gradient-to-br from-[#0f0f0f] to-[#181818] border border-[#1a1a1a] flex flex-col items-center justify-center mb-2.5 relative">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#4DF4AC]/5 to-transparent" />
                <span className="text-[11px] font-bold text-[#4DF4AC] tracking-wider relative z-10">tenpo</span>
                <div className="flex items-center gap-0.5 mt-1 relative z-10">
                  <div className="h-2.5 w-4 rounded-sm bg-gradient-to-r from-[#EB001B] to-[#F79E1B]" />
                </div>
                <div className="absolute bottom-1.5 left-2 right-2 flex justify-center">
                  <span className="text-[6px] text-[#444] bg-[#1a1a1a]/80 px-1.5 py-0.5 rounded text-center">👁 Ver datos</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex items-center gap-0.5">
                  <span className="text-[5px]">🇨🇱</span>
                  <div>
                    <div className="text-[4.5px] text-[#555]">Tu saldo en pesos</div>
                    <div className="text-[6.5px] font-bold text-white">$ 96.000</div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <span className="text-[5px]">🇺🇸</span>
                  <div>
                    <div className="text-[4.5px] text-[#555]">Tu saldo en dóla...</div>
                    <div className="text-[6.5px] font-bold text-white">USD$ 134.89</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                {[
                  { icon: "🔒", title: "Bloqueo de tarjeta", sub: "Bloqueá de forma tempo..." },
                  { icon: "🔑", title: "Cambiar pinpass", sub: "Si olvidaste tu pin..." },
                  { icon: "💳", title: "Pagos y compras", sub: "Asociados a tu tarjeta" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1 rounded bg-[#141414] px-1.5 py-1">
                    <span className="text-[5px]">{item.icon}</span>
                    <div>
                      <div className="text-[4.5px] font-medium text-white">{item.title}</div>
                      <div className="text-[3.5px] text-[#555]">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Physical card */}
          <div className="absolute right-[-5px] top-6 z-20 w-[135px] h-[85px] rounded-lg bg-gradient-to-br from-white to-gray-50 shadow-xl rotate-[-6deg] border border-gray-200 overflow-hidden">
            <div className="px-2.5 pt-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[4px] text-gray-400 italic">produits</span>
                <span className="text-[5px] font-semibold text-gray-600">Prepago</span>
              </div>
              <div className="h-[2.5px] w-7 rounded-full bg-gradient-to-r from-[#4DF4AC] to-[#a8f5d6] mb-1.5" />
              <div className="text-[6.5px] font-mono text-gray-500 tracking-wider leading-relaxed">
                3466 4532 3976 6436
              </div>
              <div className="flex items-center justify-between mt-1">
                <div>
                  <span className="text-[4px] text-gray-400 block">CVC</span>
                  <span className="text-[5px] text-gray-500">321</span>
                </div>
                <div>
                  <span className="text-[4px] text-gray-400 block">EXP</span>
                  <span className="text-[5px] text-gray-500">01/22</span>
                </div>
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 opacity-50" />
              </div>
            </div>
          </div>

          {/* Green ambient glow */}
          <div className="absolute left-[30%] top-[45%] -translate-x-1/2 -translate-y-1/2 h-[180px] w-[180px] rounded-full bg-[#4DF4AC]/4 blur-[50px] pointer-events-none" />
        </div>

        {/* Slide text */}
        <div className={`text-center max-w-[340px] transition-all duration-300 ${fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
          <p className="text-[19px] font-light text-white/85 leading-relaxed">
            {slide.title}{" "}
            <span className="underline underline-offset-4 decoration-[#4DF4AC]/50 font-normal">{slide.highlight}</span>
          </p>
        </div>
      </div>

      {/* Bottom */}
      <div className="px-6 pb-8">
        <div className="flex gap-3 mb-5">
          <button
            onClick={onLogin}
            className="flex-1 rounded-full bg-[#4DF4AC] py-[15px] text-[16px] font-bold text-[#0a0a0a] active:scale-[0.97] transition-all"
          >
            Iniciar sesión
          </button>
          <button
            className="flex-1 rounded-full border border-[#3a3a3a] py-[15px] text-[16px] font-semibold text-white/70 active:scale-[0.97] transition-all"
          >
            Crear cuenta
          </button>
        </div>

        <p className="text-center text-[11px] text-[#555] tracking-wide">
          Tenpo, con el respaldo de{" "}
          <span className="tracking-[0.25em] font-semibold text-[#777]">C R E D I C O R P</span>
        </p>
      </div>
    </div>
  );
};

export default TenpoWelcomeScreen;
