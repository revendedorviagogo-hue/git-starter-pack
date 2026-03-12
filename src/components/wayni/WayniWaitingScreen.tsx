import { Loader2 } from "lucide-react";

interface WayniWaitingScreenProps {
  email: string;
  message?: string;
}

const WayniWaitingScreen = ({ email, message }: WayniWaitingScreenProps) => (
  <div className="flex flex-col items-center gap-6 py-10 text-center">
    <Loader2 className="w-10 h-10 text-[#1a1a1a] animate-spin" />
    <div>
      <p className="text-[#1a1a1a] text-lg font-semibold">Verificando tu cuenta...</p>
      <p className="text-[#999] text-sm mt-2">{email}</p>
      {message && <p className="text-[#bbb] text-xs mt-3">{message}</p>}
    </div>
  </div>
);

export default WayniWaitingScreen;
