import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminData } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, LogOut, Trash2, Activity, Eye, Wifi, Users, ShieldCheck,
  FileText, Bell, BellOff,
} from "lucide-react";
import AdminLogin from "@/components/admin/AdminLogin";
import AllSessionsTable from "@/components/admin/AllSessionsTable";
import OperateSessionModal from "@/components/admin/OperateSessionModal";
import WhitelistManager from "@/components/admin/WhitelistManager";
import AdminLogs from "@/components/admin/AdminLogs";
import OnlineNowTab from "@/components/admin/OnlineNowTab";
import IolWayniManager from "@/components/admin/IolWayniManager";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { SessionPresenceProvider } from "@/hooks/useSessionPresence";
import type { SessionRecord } from "@/components/admin/AllSessionsTable";

interface OperatorOption {
  id: string;
  code: string;
  name: string;
  user_id?: string;
}

const SOURCE = "ppi";

const PpiAdmin = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [forceRefresh, setForceRefresh] = useState(0);
  const { stats } = useAdminData(user?.id, isAdmin);
  const [operatingSessions, setOperatingSessions] = useState<SessionRecord[]>([]);
  const [clearing, setClearing] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [activeTab, setActiveTab] = useState<"online" | "sessions" | "logs" | "wayni">("online");
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [myOperator, setMyOperator] = useState<OperatorOption | null>(null);

  const { startAlarm, stopAlarm } = useNotificationSound();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [ppiPending, setPpiPending] = useState(0);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const loadOperators = async () => {
      const { data } = await supabase.from("operators").select("id, code, name, user_id").order("created_at");
      const ops = (data as OperatorOption[]) || [];
      setOperators(ops);
      const match = ops.find((o) => o.user_id === user.id && o.code !== "master") || null;
      setMyOperator(match);
    };
    loadOperators();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const fetchPending = async () => {
      const { count } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("source", SOURCE)
        .eq("status", "pending_review");
      setPpiPending(count || 0);
    };
    fetchPending();

    const channel = supabase
      .channel("ppi-sessions-admin-sound")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `source=eq.${SOURCE}` }, () => {
        fetchPending();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin]);

  useEffect(() => {
    if (ppiPending > 0 && soundEnabled) startAlarm();
    else stopAlarm();
  }, [ppiPending, soundEnabled, startAlarm, stopAlarm]);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    await supabase.from("sessions").delete().eq("source", SOURCE);
    setShowConfirmClear(false);
    setClearing(false);
    setOperatingSessions([]);
    window.location.reload();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <AdminLogin onLogin={() => setForceRefresh((p) => p + 1)} />;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <Shield className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold text-foreground">Acesso Negado</h1>
        <p className="text-muted-foreground">Você não tem permissões para este painel.</p>
        <button onClick={() => signOut()} className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Voltar</button>
      </div>
    );
  }

  return (
    <SessionPresenceProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-sky-400" />
              <span className="text-sm font-bold text-foreground">PPI Admin</span>
              {ppiPending > 0 && (
                <span className="rounded-full bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 text-[10px] font-bold text-sky-400 animate-pulse">
                  {ppiPending} pendente{ppiPending > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-4">
              <StatPill icon={<Eye size={12} />} value={stats.totalVisits} label="Visitas" />
              <StatPill icon={<Activity size={12} />} value={stats.totalSessions} label="Sessões" />
              <StatPill icon={<Wifi size={12} />} value={stats.onlineCount} label="Online" color="text-green-400" />
              <StatPill icon={<Users size={12} />} value={stats.uniqueIPs} label="IPs" />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSoundEnabled(!soundEnabled); if (soundEnabled) stopAlarm(); }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  soundEnabled ? "border-lime-500/30 text-lime-400 hover:bg-lime-500/10" : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {soundEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                <span className="hidden sm:inline">{soundEnabled ? "Som ON" : "Som OFF"}</span>
              </button>
              <button onClick={() => setShowWhitelist(true)} className="flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors">
                <ShieldCheck size={13} />
                <span className="hidden sm:inline">Anti-DDoS</span>
              </button>
              <button onClick={() => setShowConfirmClear(true)} className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 size={13} />
                <span className="hidden sm:inline">Limpar PPI</span>
              </button>
              <button onClick={() => signOut()} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
                <LogOut size={13} />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile stats */}
        <div className="sm:hidden border-b border-border bg-card px-4 py-2 flex items-center justify-around">
          <StatPill icon={<Eye size={11} />} value={stats.totalVisits} label="Visitas" />
          <StatPill icon={<Activity size={11} />} value={stats.totalSessions} label="Sessões" />
          <StatPill icon={<Wifi size={11} />} value={stats.onlineCount} label="Online" color="text-green-400" />
          <StatPill icon={<Users size={11} />} value={stats.uniqueIPs} label="IPs" />
        </div>

        {/* Confirm Clear */}
        {showConfirmClear && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Limpar sessões PPI?</h3>
                  <p className="text-xs text-muted-foreground">Isso vai excluir todas as sessões PPI permanentemente.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmClear(false)} disabled={clearing} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-50">Cancelar</button>
                <button onClick={handleClearAll} disabled={clearing} className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50">
                  {clearing ? "Limpando..." : "Sim, limpar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showWhitelist && <WhitelistManager onClose={() => setShowWhitelist(false)} />}

        {/* Main Content */}
        <main className="mx-auto max-w-[1400px] px-4 py-4">
          <div className="mb-4 flex items-center gap-1 border-b border-border">
            <TabBtn active={activeTab === "online"} onClick={() => setActiveTab("online")} icon={<Wifi size={13} />} label="Online Agora" pulse={activeTab !== "online"} color="green" />
            <TabBtn active={activeTab === "sessions"} onClick={() => setActiveTab("sessions")} icon={<Activity size={13} />} label="Sessões" />
            <TabBtn active={activeTab === "logs"} onClick={() => setActiveTab("logs")} icon={<FileText size={13} />} label="Logs de Acesso" />
            <TabBtn active={activeTab === "wayni"} onClick={() => setActiveTab("wayni")} icon={<ShieldCheck size={13} />} label="Wayni" />
          </div>

          {activeTab === "online" ? (
            <OnlineNowTab operatorCode={myOperator?.code} sourceFilter={SOURCE} />
          ) : activeTab === "sessions" ? (
            <AllSessionsTable
              sourceFilter={SOURCE}
              operatorCode={myOperator?.code}
              onOperate={(session) => {
                setOperatingSessions((prev) => {
                  if (prev.some((item) => item.id === session.id)) return prev;
                  return [...prev, session];
                });
              }}
            />
          ) : activeTab === "logs" ? (
            <AdminLogs operatorCode={myOperator?.code} sourceFilter={SOURCE} />
          ) : (
            <IolWayniManager operators={operators} myOperator={myOperator} isAdmin={isAdmin} source="ppi" />
          )}
        </main>

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

const StatPill = ({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color?: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={color || "text-muted-foreground"}>{icon}</span>
    <span className="text-xs font-bold text-foreground tabular-nums">{value}</span>
    <span className="text-[10px] text-muted-foreground">{label}</span>
  </div>
);

const TabBtn = ({ active, onClick, icon, label, pulse, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; pulse?: boolean; color?: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors -mb-px ${
      active
        ? `border-${color || "sky"}-500 text-${color || "sky"}-400`
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`}
  >
    {icon}
    {label}
    {pulse && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />}
  </button>
);

export default PpiAdmin;
