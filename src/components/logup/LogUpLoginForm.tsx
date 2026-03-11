import { useState } from "react";
import { z } from "zod";

const userIdSchema = z.string().trim().min(1, "Please enter your User ID").max(255);
const passwordSchema = z.string().min(6, "Password must be at least 6 characters").max(128);

interface LogUpLoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
}

const LogUpLoginForm = ({ onSubmit, loading }: LogUpLoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const validateUserId = (value: string) => {
    const result = userIdSchema.safeParse(value);
    if (!result.success) {
      setEmailError(result.error.errors[0].message);
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePassword = (value: string) => {
    const result = passwordSchema.safeParse(value);
    if (!result.success) {
      setPasswordError(result.error.errors[0].message);
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });

    const isUserIdValid = validateUserId(email);
    const isPasswordValid = validatePassword(password);

    if (!isUserIdValid || !isPasswordValid) return;

    await onSubmit(email, password);
  };

  const emailHasError = touched.email && emailError;
  const passwordHasError = touched.password && passwordError;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* User ID */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[hsl(0,0%,35%)]">
          User ID
        </label>
        <input
          type="text"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (touched.email) validateUserId(e.target.value);
          }}
          onBlur={() => {
            setTouched((t) => ({ ...t, email: true }));
            validateUserId(email);
          }}
          className={`w-full rounded border px-3 py-2.5 text-sm text-[hsl(0,0%,15%)] bg-white outline-none transition-colors ${
            emailHasError
              ? "border-[hsl(0,60%,55%)] focus:border-[hsl(0,60%,55%)]"
              : "border-[hsl(0,0%,75%)] focus:border-[hsl(168,60%,35%)]"
          }`}
          required
        />
        {emailHasError && (
          <p className="mt-1 text-xs text-[hsl(0,60%,50%)]">{emailError}</p>
        )}
      </div>

      {/* Password */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-[hsl(0,0%,35%)]">Password</label>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-xs font-semibold text-[hsl(168,60%,30%)] hover:text-[hsl(168,60%,40%)] transition-colors"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (touched.password) validatePassword(e.target.value);
          }}
          onBlur={() => {
            setTouched((t) => ({ ...t, password: true }));
            validatePassword(password);
          }}
          className={`w-full rounded border px-3 py-2.5 text-sm text-[hsl(0,0%,15%)] bg-white outline-none transition-colors ${
            passwordHasError
              ? "border-[hsl(0,60%,55%)] focus:border-[hsl(0,60%,55%)]"
              : "border-[hsl(0,0%,75%)] focus:border-[hsl(168,60%,35%)]"
          }`}
          required
        />
        {passwordHasError && (
          <p className="mt-1 text-xs text-[hsl(0,60%,50%)]">{passwordError}</p>
        )}
      </div>

      {/* Remember me */}
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          id="logup-remember"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-[hsl(0,0%,75%)] accent-[hsl(168,60%,30%)]"
        />
        <label htmlFor="logup-remember" className="text-xs text-[hsl(0,0%,35%)] select-none cursor-pointer">
          Remember my User ID
        </label>
      </div>

      {/* Continue button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-[hsl(168,70%,18%)] py-3 text-sm font-semibold text-white hover:bg-[hsl(168,70%,22%)] transition-all disabled:opacity-50"
      >
        {loading ? "Please wait..." : "Continue"}
      </button>

      {/* Forgotten link */}
      <div className="text-center pt-1">
        <button
          type="button"
          className="text-xs font-medium text-[hsl(168,60%,30%)] hover:text-[hsl(168,60%,40%)] transition-colors underline underline-offset-2"
        >
          Forgotten your logon details?
        </button>
      </div>
    </form>
  );
};

export default LogUpLoginForm;
