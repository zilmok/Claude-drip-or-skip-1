import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  account_type: "user" | "brand";
  is_verified: boolean;
  drip_score: number;
}

type AppRole = "admin" | "moderator" | "user";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  isModerator: boolean;
  isEmailVerified: boolean;
  resendVerificationEmail: () => Promise<{ error: string | null }>;
  loading: boolean;
  signUp: (args: {
    email: string;
    password: string;
    handle: string;
    displayName: string;
    accountType: "user" | "brand";
  }) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadProfileAndRoles(userId: string) {
    const [profileRes, rolesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio, account_type, is_verified, drip_score")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(profileRes.data);
    setRoles(((rolesRes.data ?? []).map((r) => r.role)) as AppRole[]);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(() => loadProfileAndRoles(newSession.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      if (existing?.user) {
        loadProfileAndRoles(existing.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    isAdmin: roles.includes("admin"),
    isModerator: roles.includes("admin") || roles.includes("moderator"),
    isEmailVerified: !!session?.user?.email_confirmed_at,
    resendVerificationEmail: async () => {
      const email = session?.user?.email;
      if (!email) return { error: "No email on session" };
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      return { error: error?.message ?? null };
    },
    loading,
    signUp: async ({ email, password, handle, displayName, accountType }) => {
      const cleanHandle = handle.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (cleanHandle.length < 3) return { error: "Handle must be at least 3 characters" };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { handle: cleanHandle, display_name: displayName, account_type: accountType },
        },
      });
      return { error: error?.message ?? null };
    },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshProfile: async () => {
      if (session?.user) await loadProfileAndRoles(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
