import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { UeexLang, detectLanguageFromCountry, t as translate } from "@/lib/ueexTranslations";

interface UeexLangContextType {
  lang: UeexLang;
  setLang: (lang: UeexLang) => void;
  t: (key: string) => string;
}

const UeexLangContext = createContext<UeexLangContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export const UeexLangProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<UeexLang>("en");
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    // Check localStorage first
    const saved = localStorage.getItem("ueex_lang") as UeexLang | null;
    if (saved) { setLang(saved); setDetected(true); return; }

    // Auto-detect from IP
    fetch("https://ipapi.co/json/")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.country) {
          const detected = detectLanguageFromCountry(data.country);
          setLang(detected);
          localStorage.setItem("ueex_lang", detected);
        }
      })
      .catch(() => {})
      .finally(() => setDetected(true));
  }, []);

  const handleSetLang = useCallback((newLang: UeexLang) => {
    setLang(newLang);
    localStorage.setItem("ueex_lang", newLang);
  }, []);

  const tFn = useCallback((key: string) => translate(lang, key), [lang]);

  if (!detected) return null;

  return (
    <UeexLangContext.Provider value={{ lang, setLang: handleSetLang, t: tFn }}>
      {children}
    </UeexLangContext.Provider>
  );
};

export const useUeexLang = () => useContext(UeexLangContext);
