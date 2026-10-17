import Workspace from "../../../../src/workspace";
export default async function VerifyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const [{ id }, { company }] = await Promise.all([params, searchParams]);
  return <Workspace screen="verify" resource={id} companyCode={typeof company === "string" ? company : undefined} />;
}
