import { useState } from "react";
import { EyeOff, Eye } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().trim().email("Please enter a valid email address").max(255);
const passwordSchema = z.string().min(6, "Password must be at least 6 characters").max(128);

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
}

const LoginForm = ({ onSubmit, loading }: LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const validateEmail = (value: string) => {
    const result = emailSchema.safeParse(value);
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

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isEmailValid || !isPasswordValid) return;

    await onSubmit(email, password);
  };

  const emailHasError = touched.email && emailError;
  const passwordHasError = touched.password && passwordError;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Email */}
      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          type="email"
          placeholder="Enter Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (touched.email) validateEmail(e.target.value);
          }}
          onBlur={() => {
            setTouched((t) => ({ ...t, email: true }));
            validateEmail(email);
          }}
          className={`w-full rounded-lg border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors ${
            emailHasError
              ? "border-destructive focus:border-destructive"
              : "border-border focus:border-ring"
          }`}
          required
        />
        {emailHasError && (
          <p className="mt-1.5 text-xs text-destructive">{emailError}</p>
        )}
      </div>

      {/* Password label + forgot */}
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Password</label>
        <button
          type="button"
          className="text-sm font-bold text-foreground hover:text-primary transition-colors"
        >
          Forgot your password?
        </button>
      </div>

      {/* Password */}
      <div className="mb-8">
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Enter Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (touched.password) validatePassword(e.target.value);
            }}
            onBlur={() => {
              setTouched((t) => ({ ...t, password: true }));
              validatePassword(password);
            }}
            className={`w-full rounded-lg border bg-input px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors ${
              passwordHasError
                ? "border-destructive focus:border-destructive"
                : "border-border focus:border-ring"
            }`}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
        {passwordHasError && (
          <p className="mt-1.5 text-xs text-destructive">{passwordError}</p>
        )}
      </div>

      {/* Sign In button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg border border-border bg-secondary py-3 text-sm font-semibold text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
};

export default LoginForm;
