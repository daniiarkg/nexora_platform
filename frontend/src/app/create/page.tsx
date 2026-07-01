"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AutomationBuilder } from "@/components/automation-builder";

export default function CreateAutomationPage() {
  return <AuthGuard>{() => <AutomationBuilder />}</AuthGuard>;
}
