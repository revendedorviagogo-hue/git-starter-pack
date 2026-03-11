import { useState } from "react";
import { Shield, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

const adminEmailSchema = z.string().trim().email("Invalid email").max(255);
const adminPasswordSchema = z.string().min(6, "Min 6 characters").max(128);

interface AdminLoginProps {
  onLogin: () => void;
}

const AdminLogin = ({ onLogin }: AdminLoginProps) => {
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
      {/* Logos topo */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {/* FalconX */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-foreground">FalconX</span>
          </div>
          {/* Lloyds */}
          <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <span className="text-xs font-bold text-emerald-400">Lloyds</span>
          </div>
          {/* Paysera */}
          <div className="flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2">
            <span className="text-xs font-bold text-teal-400">Paysera</span>
          </div>
          {/* Cocos */}
          <div className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
            <span className="text-xs font-bold text-cyan-400">Cocos</span>
          </div>
          {/* UEEx */}
          <div className="flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2">
            <span className="text-xs font-bold text-orange-400">UEEx</span>
          </div>
          {/* IOL */}
          <div className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2">
            <span className="text-xs font-bold text-violet-400">IOL</span>
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground tracking-widest uppercase font-semibold">Painel Administrativo</span>
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

export default AdminLogin;
