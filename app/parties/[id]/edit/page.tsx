import PartyForm from "@/components/PartyForm";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="narrow">
      <a className="back" href={`/parties/${id}`}>
        ← Back to party
      </a>
      <h1>The party details.</h1>
      <p>Keep your guests in the loop.</p>
      <PartyForm id={id} />
    </main>
  );
}
