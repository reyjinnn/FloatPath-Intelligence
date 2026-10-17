import Workspace from "../../src/workspace";
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  return <Workspace screen="reports" companyCode={typeof company === "string" ? company : undefined} />;
}
