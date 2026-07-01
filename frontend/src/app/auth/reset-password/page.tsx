import { ResetPasswordPage } from "@/components/auth-pages";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <ResetPasswordPage token={params.token ?? ""} />;
}
