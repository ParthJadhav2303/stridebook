import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { getSession, onSessionChange, post, setSession } from "../../api/client";
import type { Tokens, User } from "../../api/types";

type Auth = {
  user: User | null;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getSession()?.user ?? null);
  const qc = useQueryClient();

  useEffect(
    () =>
      onSessionChange((s) => {
        setUser(s?.user ?? null);
        if (!s) qc.clear();
      }),
    [qc],
  );

  const value: Auth = {
    user,
    isAdmin: user?.role === "admin",
    login: async (username, password) => {
      setSession(await post<Tokens>("/auth/login", { username, password }));
    },
    logout: () => setSession(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
