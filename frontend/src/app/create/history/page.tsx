"use client";

import { AuthGuard } from "@/components/auth-guard";
import { BuilderHistoryPage } from "@/components/builder-history-page";

export default function CreateHistoryPage() {
  return <AuthGuard>{() => <BuilderHistoryPage />}</AuthGuard>;
}
