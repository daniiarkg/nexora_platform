"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentUser } from "@/lib/api";
import type { AuthUser } from "@/types";

type AuthGuardProps = {
  children: (user: AuthUser) => ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((payload) => {
        if (!active) {
          return;
        }
        if (!payload.user.email_verified) {
          router.replace(`/auth/waiting-confirmation?email=${encodeURIComponent(payload.user.email)}`);
          return;
        }
        setUser(payload.user);
        setStatus("ready");
      })
      .catch(() => {
        if (active) {
          router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
        }
      });

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (status === "loading" || !user) {
    return (
      <main className="auth-page">
        <div className="auth-loading">
          <img alt="Nexora" src="/brand/nexora-logo-white.svg" />
          <span>Проверка доступа</span>
        </div>
      </main>
    );
  }

  return <>{children(user)}</>;
}
