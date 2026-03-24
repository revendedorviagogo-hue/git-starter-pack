import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

interface PpiWaitingScreenProps {
  username: string;
  onContinue?: () => void;
}

const WAITING_MESSAGES = [
  "Espere un poco más, estamos validando su cuenta.",
  "Su cuenta está siempre segura.",
  "Estamos cargando su información.",
];

const PpiWaitingScreen = ({ username, onContinue }: PpiWaitingScreenProps) => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, 3200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex w-full min-w-0 flex-col items-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>

      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-medium text-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Validación de seguridad
      </div>

      <p className="min-h-10 max-w-sm text-sm leading-6 text-muted-foreground transition-opacity duration-300">
        {WAITING_MESSAGES[messageIndex]}
      </p>

      <p className="mt-3 break-all text-xs text-muted-foreground/70">{username}</p>

      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Continuar
        </button>
      )}
    </div>
  );
};

export default PpiWaitingScreen;