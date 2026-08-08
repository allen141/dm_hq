import ArchiveShell from "@/components/archive-shell";

export default async function Layout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ campaignId: string }> }>) {
  const { campaignId } = await params;
  return <ArchiveShell campaignId={campaignId}>{children}</ArchiveShell>;
}
