import { CheckCircle } from "lucide-react";

const Global66SuccessScreen = ({ email }: { email: string }) => (
  <div className="flex w-full flex-col items-center gap-5 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
      <CheckCircle className="h-9 w-9 text-green-500" />
    </div>
    <h2 className="text-xl font-bold text-[#1a2233]">¡Verificación exitosa!</h2>
    <p className="text-sm text-[#5a6a85]">{email}</p>
    <p className="text-sm text-[#5a6a85]">Tu cuenta ha sido verificada correctamente.</p>
  </div>
);

export default Global66SuccessScreen;
