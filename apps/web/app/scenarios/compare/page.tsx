import Workspace from "../../../src/workspace";
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  return <Workspace screen="compare" companyCode={typeof company === "string" ? company : undefined} />;
}
