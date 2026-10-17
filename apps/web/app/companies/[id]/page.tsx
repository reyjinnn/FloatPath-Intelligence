import Workspace from "../../../src/workspace";
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Workspace screen="company" resource={id} />;
}
