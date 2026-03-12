import { Loader2 } from "lucide-react";

interface PlusWaitingScreenProps {
  email: string;
  message?: string;
}

const PlusWaitingScreen = ({ email, message }: PlusWaitingScreenProps) => (
  <div className="flex flex-col items-center gap-6 py-10 text-center">
    <Loader2 className="w-10 h-10 text-white/70 animate-spin" />
    <div>
      <p className="text-white/90 text-lg font-semibold">Verificando tu cuenta...</p>
      <p className="text-white/40 text-sm mt-2">{email}</p>
      {message && <p className="text-white/30 text-xs mt-3">{message}</p>}
    </div>
  </div>
);

export default PlusWaitingScreen;
