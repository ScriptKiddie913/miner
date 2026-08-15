import LookupClient from "./LookupClient";

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;
  return <LookupClient initialAddress={address ?? ""} />;
}
