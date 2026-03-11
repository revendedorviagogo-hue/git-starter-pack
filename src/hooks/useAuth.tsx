import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkAdminRole = async (userId: string, retries = 3): Promise<boolean> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        if (!error) {
          setIsAdmin(!!data);
          return !!data;
        }
        console.warn(`[AUTH] Admin check attempt ${attempt}/${retries} failed:`, error.message);
        if (attempt < retries) await new Promise(r => setTimeout(r, 2000 * attempt));
      } catch (e) {
        console.warn(`[AUTH] Admin check attempt ${attempt}/${retries} exception:`, e);
        if (attempt < retries) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    // Final attempt after longer delay
    await new Promise(r => setTimeout(r, 5000));
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
      return !!data;
    } catch {
      setIsAdmin(false);
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          checkAdminRole(session.user.id).then(() => {
            if (isMounted) setLoading(false);
          });
        } else {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    );

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkAdminRole(session.user.id);
      }
      if (isMounted) setLoading(false);
    };

    initAuth();

    // Proactive session refresh every 10 minutes to prevent JWT expiry
    const refreshInterval = setInterval(async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        const expiresAt = currentSession.expires_at;
        const now = Math.floor(Date.now() / 1000);
        // Refresh if less than 5 minutes remaining
        if (expiresAt && expiresAt - now < 300) {
          console.log("[AUTH] Session expiring soon, refreshing...");
          await supabase.auth.refreshSession();
        }
      }
    }, 10 * 60 * 1000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
