import PartyForm from "@/components/PartyForm";
export default function Page() {
  return (
    <main className="narrow">
      <a className="back" href="/">
        ← All parties
      </a>
      <p className="eyebrow">Make room for a little magic</p>
      <h1>Let’s plan a party.</h1>
      <p>Start with the details. The happy replies come next.</p>
      <PartyForm />
    </main>
  );
}
