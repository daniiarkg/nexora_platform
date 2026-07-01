import { WaitingConfirmationPage } from "@/components/auth-pages";

export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const params = await searchParams;
  return <WaitingConfirmationPage email={params.email ?? ""} />;
}
