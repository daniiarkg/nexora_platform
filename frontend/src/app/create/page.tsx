"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AutomationBuilder } from "@/components/automation-builder";

export default function CreateAutomationPage() {
  return <AuthGuard>{(user) => <AutomationBuilder user={user} />}</AuthGuard>;
}
