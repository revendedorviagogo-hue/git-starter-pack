import { useState, useRef, useEffect } from "react";
import { useUeexLang } from "@/hooks/useUeexLang";
import { UEEX_LANGUAGES, UeexLang } from "@/lib/ueexTranslations";

const UeexLanguageSelector = () => {
  const { lang, setLang, t } = useUeexLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = UEEX_LANGUAGES.find(l => l.code === lang);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[13px] text-[#a0a3b1] hover:text-white transition-colors"
      >
        <span>{current?.flag}</span>
        <span>{current?.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[160px] rounded-lg border border-[#2a2d3e] bg-[#1a1d2e] py-1 shadow-xl">
          {UEEX_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors ${
                lang === l.code ? "bg-[#F5A623]/10 text-[#F5A623]" : "text-[#a0a3b1] hover:bg-[#252838] hover:text-white"
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Mobile version with white bg
export const UeexLanguageSelectorMobile = () => {
  const { lang, setLang } = useUeexLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = UEEX_LANGUAGES.find(l => l.code === lang);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[13px] text-[#666] hover:text-[#333] transition-colors"
      >
        <span>{current?.flag}</span>
        <span>{current?.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[160px] rounded-lg border border-[#e0e0e0] bg-white py-1 shadow-xl">
          {UEEX_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors ${
                lang === l.code ? "bg-[#F5A623]/10 text-[#F5A623]" : "text-[#666] hover:bg-[#f5f5f5] hover:text-[#333]"
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default UeexLanguageSelector;
