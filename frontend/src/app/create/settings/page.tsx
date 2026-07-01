"use client";

import { AuthGuard } from "@/components/auth-guard";
import { BuilderSettingsPage } from "@/components/builder-settings-page";

export default function CreateSettingsPage() {
  return <AuthGuard>{() => <BuilderSettingsPage />}</AuthGuard>;
}
