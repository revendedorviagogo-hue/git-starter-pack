import { CheckCircle } from "lucide-react";

interface SuccessScreenProps {
  email: string;
}

const SuccessScreen = ({ email }: SuccessScreenProps) => {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
        <CheckCircle className="h-8 w-8 text-green-500" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Login Successful
      </h3>
      <p className="mb-1 text-sm text-muted-foreground">
        Welcome back! Redirecting you now...
      </p>
      <p className="text-xs text-muted-foreground/60">
        {email}
      </p>
    </div>
  );
};

export default SuccessScreen;
