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

const PpiWaitingScreen = ({ username }: PpiWaitingScreenProps) => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, 3200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex w-full min-w-0 flex-col items-center text-center" role="status" aria-live="polite">
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-2xl bg-primary/15 blur-md" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-gradient-to-b from-background to-muted/50 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>

      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-[11px] font-medium text-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Validación de seguridad
      </div>

      <p className="min-h-10 max-w-sm text-sm leading-6 text-muted-foreground transition-all duration-500">
        {WAITING_MESSAGES[messageIndex]}
      </p>

      <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/55 [animation-delay:140ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/40 [animation-delay:280ms]" />
      </div>

      <p className="mt-4 max-w-sm break-all rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground/80">
        {username}
      </p>
    </div>
  );
};

export default PpiWaitingScreen;