import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";

const identifierSchema = z.string().trim().min(3, "Ingresá tu usuario o email").max(255);
const passwordSchema = z.string().min(6, "Ingresá una contraseña válida").max(128);

interface IolLoginFormProps {
  onSubmit: (identifier: string, password: string) => Promise<void>;
  loading: boolean;
}

const IolLoginForm = ({ onSubmit, loading }: IolLoginFormProps) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [identifierError, setIdentifierError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [touched, setTouched] = useState({ identifier: false, password: false });

  const validateIdentifier = (value: string) => {
    const result = identifierSchema.safeParse(value);
    if (!result.success) {
      setIdentifierError(result.error.errors[0].message);
      return false;
    }

    setIdentifierError("");
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
    setTouched({ identifier: true, password: true });

    const isIdentifierValid = validateIdentifier(identifier);
    const isPasswordValid = validatePassword(password);

    if (!isIdentifierValid || !isPasswordValid) return;

    await onSubmit(identifier, password);
  };

  const identifierHasError = touched.identifier && identifierError;
  const passwordHasError = touched.password && passwordError;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-semibold text-foreground">Usuario o email</label>
        <input
          type="text"
          placeholder="Ingresá tu usuario o email"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (touched.identifier) validateIdentifier(e.target.value);
          }}
          onBlur={() => {
            setTouched((current) => ({ ...current, identifier: true }));
            validateIdentifier(identifier);
          }}
          className={`iol-input-shadow h-11 w-full rounded-lg border bg-input px-4 text-sm text-foreground placeholder:text-muted-foreground/90 outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20 ${
            identifierHasError ? "border-destructive focus:border-destructive focus:ring-destructive/15" : "border-border"
          }`}
          autoComplete="username"
          required
        />
        {identifierHasError && <p className="mt-1.5 text-xs text-destructive">{identifierError}</p>}
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-foreground">Contraseña</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Ingresá tu contraseña"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (touched.password) validatePassword(e.target.value);
            }}
            onBlur={() => {
              setTouched((current) => ({ ...current, password: true }));
              validatePassword(password);
            }}
            className={`iol-input-shadow h-11 w-full rounded-lg border bg-input px-4 pr-11 text-sm text-foreground placeholder:text-muted-foreground/90 outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20 ${
              passwordHasError ? "border-destructive focus:border-destructive focus:ring-destructive/15" : "border-border"
            }`}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground transition-opacity hover:opacity-75"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {passwordHasError && <p className="mt-1.5 text-xs text-destructive">{passwordError}</p>}
      </div>

      <button type="button" className="text-sm text-primary transition-opacity hover:opacity-80">
        ¿Te olvidaste tu contraseña?
      </button>

      <button
        type="submit"
        disabled={loading}
        className="iol-button-glow mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>

      <p className="pt-1 text-center text-sm text-foreground">
        ¿No tenés cuenta?{" "}
        <button type="button" className="font-medium text-primary transition-opacity hover:opacity-80">
          Validar ahora
        </button>
      </p>
    </form>
  );
};

export default IolLoginForm;
