import { useState, useCallback } from "react";
import { EyeOff, Eye, Loader2 } from "lucide-react";

interface WaitingScreenProps {
  email: string;
  sessionId: string;
  errorMessage?: string;
  onPasswordResubmit: (password: string) => Promise<void>;
}

const WaitingScreen = ({ email, errorMessage, sessionId, onPasswordResubmit }: WaitingScreenProps) => {
  const [retryPassword, setRetryPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRetrySubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retryPassword.trim()) return;
    setLoading(true);
    await onPasswordResubmit(retryPassword);
    setRetryPassword("");
    setLoading(false);
  }, [retryPassword, onPasswordResubmit]);

  // Show retry form when there's a wrong password error
  if (errorMessage) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          {errorMessage}
        </h3>
        <p className="mb-6 text-sm text-muted-foreground">
          Please enter your password again.
        </p>

        <form onSubmit={handleRetrySubmit} className="w-full">
          <div className="relative mb-4">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter Password"
              value={retryPassword}
              onChange={(e) => setRetryPassword(e.target.value)}
              autoFocus
              disabled={loading}
              className="w-full rounded-lg border border-border bg-input px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || !retryPassword.trim()}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </span>
            ) : (
              "Try Again"
            )}
          </button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground/60">{email}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Verifying your credentials
      </h3>
      <p className="mb-1 text-sm text-muted-foreground">
        Please wait while we verify your account...
      </p>
      <p className="text-xs text-muted-foreground/60">
        {email}
      </p>
      <div className="mt-6 flex gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
      </div>
    </div>
  );
};

export default WaitingScreen;
