"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  return <AuthGuard>{(user) => <Dashboard user={user} />}</AuthGuard>;
}
