import { Loader2 } from "lucide-react";

interface TenpoWaitingScreenProps {
  email: string;
  message?: string;
}

const TenpoWaitingScreen = ({ email, message }: TenpoWaitingScreenProps) => (
  <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a0a] px-6">
    <Loader2 className="h-10 w-10 animate-spin text-[#4DF4AC] mb-6" />
    <h1 className="text-[20px] font-bold text-white text-center mb-2">
      {message || "Verificando tu cuenta"}
    </h1>
    <p className="text-[14px] text-[#888] text-center">Por favor, esperá un momento...</p>
    <p className="mt-4 text-[12px] text-[#555]">{email}</p>
  </div>
);

export default TenpoWaitingScreen;
