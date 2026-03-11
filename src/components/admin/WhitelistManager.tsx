import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Plus, Trash2, Globe, X, AlertTriangle } from "lucide-react";

interface WhitelistedIp {
  id: string;
  ip_address: string;
  description: string | null;
  created_at: string;
}

interface BlockedIp {
  id: string;
  ip_address: string;
  visit_count: number;
  blocked_at: string;
  reason: string | null;
}

const WhitelistManager = ({ onClose }: { onClose: () => void }) => {
  const [whitelisted, setWhitelisted] = useState<WhitelistedIp[]>([]);
  const [blocked, setBlocked] = useState<BlockedIp[]>([]);
  const [newIp, setNewIp] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"whitelist" | "blocked">("whitelist");

  const fetchData = useCallback(async () => {
    const [{ data: wl }, { data: bl }] = await Promise.all([
      supabase.from("whitelisted_ips").select("*").order("created_at", { ascending: false }),
      supabase.from("blocked_ips").select("*").order("blocked_at", { ascending: false }),
    ]);
    if (wl) setWhitelisted(wl as WhitelistedIp[]);
    if (bl) setBlocked(bl as BlockedIp[]);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addIp = async () => {
    if (!newIp.trim()) return;
    setAdding(true);
    await supabase.from("whitelisted_ips").insert({
      ip_address: newIp.trim(),
      description: newDesc.trim() || null,
    });
    // Also remove from blocked if it was there
    await supabase.from("blocked_ips").delete().eq("ip_address", newIp.trim());
    setNewIp("");
    setNewDesc("");
    setAdding(false);
    fetchData();
  };

  const removeWhitelisted = async (id: string) => {
    await supabase.from("whitelisted_ips").delete().eq("id", id);
    fetchData();
  };

  const unblock = async (ip: string, id: string) => {
    await supabase.from("blocked_ips").delete().eq("id", id);
    fetchData();
  };

  const clearAllBlocked = async () => {
    await supabase.from("blocked_ips").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    fetchData();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Proteção Anti-DDoS</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab("whitelist")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              tab === "whitelist"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Globe size={12} />
              Whitelist ({whitelisted.length})
            </div>
          </button>
          <button
            onClick={() => setTab("blocked")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              tab === "blocked"
                ? "border-b-2 border-destructive text-destructive"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <AlertTriangle size={12} />
              Bloqueados ({blocked.length})
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto p-5">
          {tab === "whitelist" ? (
            <div className="space-y-3">
              {/* Add form */}
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    placeholder="IP (ex: 192.168.1.1)"
                    className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={addIp}
                    disabled={!newIp.trim() || adding}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <Plus size={12} />
                    Adicionar
                  </button>
                </div>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Whitelisted IPs */}
              {whitelisted.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <Globe className="mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Nenhum IP na whitelist</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Adicione seu IP para garantir acesso
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {whitelisted.map((ip) => (
                    <div
                      key={ip.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5"
                    >
                      <div>
                        <p className="text-xs font-mono font-semibold text-foreground">{ip.ip_address}</p>
                        {ip.description && (
                          <p className="text-[10px] text-muted-foreground">{ip.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeWhitelisted(ip.id)}
                        className="rounded-lg p-1.5 text-destructive/60 hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {blocked.length > 0 && (
                <button
                  onClick={clearAllBlocked}
                  className="w-full rounded-lg border border-destructive/30 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Limpar Todos os Bloqueios
                </button>
              )}

              {blocked.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <Shield className="mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Nenhum IP bloqueado</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    IPs serão bloqueados automaticamente após 10 visitas
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {blocked.map((ip) => (
                    <div
                      key={ip.id}
                      className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-xs font-mono font-semibold text-foreground">{ip.ip_address}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {ip.visit_count} visitas • {ip.reason}
                        </p>
                      </div>
                      <button
                        onClick={() => unblock(ip.ip_address, ip.id)}
                        className="rounded-lg border border-border px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-secondary transition-colors"
                      >
                        Desbloquear
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhitelistManager;
