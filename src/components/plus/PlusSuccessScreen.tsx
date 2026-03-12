import { CheckCircle } from "lucide-react";

const PlusSuccessScreen = ({ email }: { email: string }) => (
  <div className="flex flex-col items-center gap-5 py-10 text-center">
    <CheckCircle className="w-14 h-14 text-green-400" />
    <div>
      <p className="text-white/90 text-lg font-semibold">¡Sesión iniciada!</p>
      <p className="text-white/40 text-sm mt-2">{email}</p>
    </div>
  </div>
);

export default PlusSuccessScreen;
