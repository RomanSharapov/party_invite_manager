import { notFound } from "next/navigation";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Mail() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.EMAIL_MODE !== "preview"
  )
    notFound();
  const logs = await db.notificationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <main className="narrow">
      <p className="eyebrow">Local development only</p>
      <h1>Email preview inbox</h1>
      <p>No email is delivered in preview mode. Refresh to see new messages.</p>
      {logs.map((l) => (
        <section className="panel" key={l.id}>
          <h3>{l.subject}</h3>
          <p>
            To: {l.recipientEmail} · {l.status}
          </p>
          <div className="pre-wrap">
            {l.text.split(/(https?:\/\/\S+)/g).map((s, i) =>
              s.startsWith("http") ? (
                <a
                  key={i}
                  href={s}
                  style={{
                    textDecoration: "underline",
                    overflowWrap: "anywhere",
                  }}
                >
                  {s}
                </a>
              ) : (
                s
              ),
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
