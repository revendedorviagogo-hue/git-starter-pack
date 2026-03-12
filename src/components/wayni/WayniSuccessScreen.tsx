import { CheckCircle } from "lucide-react";

const WayniSuccessScreen = ({ email }: { email: string }) => (
  <div className="flex flex-col items-center gap-5 py-10 text-center">
    <CheckCircle className="w-14 h-14 text-green-500" />
    <div>
      <p className="text-[#1a1a1a] text-lg font-semibold">¡Sesión iniciada!</p>
      <p className="text-[#999] text-sm mt-2">{email}</p>
    </div>
  </div>
);

export default WayniSuccessScreen;
