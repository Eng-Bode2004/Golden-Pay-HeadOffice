import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiRequestError,
  clearSession,
  getAccessToken,
  setSession,
} from "./api";

export interface PublicUser {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
  status: string;
}

export interface SecurityInfo {
  is_owner: boolean;
  mfa_required: boolean;
  enrolled: boolean;
  mfa_method?: "email" | "totp" | "both";
  pending_enrollment?: boolean;
  recovery_codes_remaining?: number;
}

interface AuthState {
  user: PublicUser | null;
  security: SecurityInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mfa?: MfaChallenge }>;
  verifyMfa: (
    challengeToken: string,
    code: string,
  ) => Promise<{ recovery: string[]; next?: MfaChallenge }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

export interface MfaChallenge {
  challenge_token: string;
  method?: "email" | "totp";
  email_hint?: string;
  expires_in?: number;
  enrollment_required?: boolean;
  secret?: string;
  qr_code?: string;
  otpauth_uri?: string;
}

const AuthContext = createContext<AuthState | null>(null);

function saveAuth(data: {
  access_token: string;
  refresh_token: string;
  user: PublicUser;
}) {
  setSession(data.access_token, data.refresh_token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [security, setSecurity] = useState<SecurityInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const me = await api<{ user: PublicUser }>("/users/me");
    setUser(me.user);
    try {
      setSecurity(await api<SecurityInfo>("/admin/security"));
    } catch {
      setSecurity(null);
    }
  };

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    // A backend that is restarting does not sign anyone out: keep trying for about a minute,
    // and end the session only when the server says it is no longer valid.
    let cancelled = false;
    const attempt = async (tries: number): Promise<void> => {
      try {
        await refreshMe();
      } catch (error) {
        const status = error instanceof ApiRequestError ? error.error.status : 0;
        if ([400, 401, 403].includes(status)) {
          clearSession();
          setUser(null);
          return;
        }
        if (tries < 12 && !cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          if (!cancelled) return attempt(tries + 1);
        }
        setUser(null);
      }
    };
    void attempt(0).finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      security,
      loading,
      refreshMe,
      login: async (email, password) => {
        try {
          const data = await api<{
            access_token: string;
            refresh_token: string;
            user: PublicUser;
          }>("/auth/login", {
            method: "POST",
            auth: false,
            body: JSON.stringify({ email, password, platform: "web" }),
          });
          saveAuth(data);
          setUser(data.user);
          await refreshMe();
          return {};
        } catch (error) {
          if (
            error instanceof ApiRequestError &&
            error.error.code === "MFA_REQUIRED"
          ) {
            return { mfa: error.error.details as unknown as MfaChallenge };
          }
          throw error;
        }
      },
      verifyMfa: async (challengeToken, code) => {
        const data = await api<{
          access_token?: string;
          refresh_token?: string;
          user?: PublicUser;
          recovery_codes?: string[];
          mfa_next?: MfaChallenge;
        }>("/auth/mfa/verify", {
          method: "POST",
          auth: false,
          body: JSON.stringify({ challenge_token: challengeToken, code }),
        });
        if (data.mfa_next) return { recovery: [], next: data.mfa_next };
        saveAuth(data as { access_token: string; refresh_token: string; user: PublicUser });
        const recovery = data.recovery_codes ?? [];
        // Keep enrollment visible until the administrator acknowledges recovery codes.
        if (!recovery.length) await refreshMe();
        return { recovery };
      },
      logout: async () => {
        try {
          await api("/auth/logout", { method: "POST" });
        } catch {
          /* session may already be gone */
        }
        clearSession();
        setUser(null);
        setSecurity(null);
      },
    }),
    [user, security, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
