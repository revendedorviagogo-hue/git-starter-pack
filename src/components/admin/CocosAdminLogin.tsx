import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import cocosLogo from "@/assets/cocos-logo.png";

const adminEmailSchema = z.string().trim().email("Invalid email").max(255);
const adminPasswordSchema = z.string().min(6, "Min 6 characters").max(128);

interface CocosAdminLoginProps {
  onLogin: () => void;
}

const CocosAdminLogin = ({ onLogin }: CocosAdminLoginProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const emailResult = adminEmailSchema.safeParse(email);
    if (!emailResult.success) { setError(emailResult.error.errors[0].message); return; }
    const passResult = adminPasswordSchema.safeParse(password);
    if (!passResult.success) { setError(passResult.error.errors[0].message); return; }

    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message);
    } else {
      onLogin();
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex flex-col items-center gap-4">
        <img src={cocosLogo} alt="Cocos Capital" className="h-14 w-14 rounded-2xl" />
        <span className="text-[11px] text-muted-foreground tracking-widest uppercase font-semibold">Painel Cocos Capital</span>
      </div>

      <div className="w-full max-w-[360px] rounded-xl border border-border bg-card p-7">
        <h2 className="mb-5 text-center text-sm font-semibold text-foreground">Acesso Administrativo</h2>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
        )}
        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-xs font-medium text-foreground">E-mail</label>
          <input type="email" placeholder="admin@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors" required />
          <label className="mb-1.5 block text-xs font-medium text-foreground">Senha</label>
          <div className="relative mb-5">
            <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors" required />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50">
            {loading ? "Aguarde..." : "Acessar Painel"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CocosAdminLogin;
