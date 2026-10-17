import Workspace from "../../../src/workspace";
export default async function ScenarioPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  return <Workspace screen="scenario" companyCode={typeof company === "string" ? company : undefined} />;
}
