import Global66Logo from "./Global66Logo";

interface Global66WaitingScreenProps {
  email: string;
  message?: string;
}

const Global66WaitingScreen = ({ email, message }: Global66WaitingScreenProps) => (
  <div className="flex w-full flex-col items-center gap-6 text-center">
    <Global66Logo size={56} />
    <div>
      <h2 className="text-xl font-bold text-[#1a2233]">Verificando tu cuenta</h2>
      <p className="mt-2 text-sm text-[#5a6a85]">{email}</p>
    </div>
    <div className="flex items-center gap-2">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2b4ea2] border-t-transparent" />
      <span className="text-sm text-[#5a6a85]">{message || "Procesando..."}</span>
    </div>
  </div>
);

export default Global66WaitingScreen;
