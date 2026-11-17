import { artists } from "./data.ts";

export function App() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>lovely-memory</h1>
      {artists.map((a) => (
        <section key={a.id}>
          <h2>
            {a.name} {a.subtitle && <small>{a.subtitle}</small>}
          </h2>
          <ul style={{ display: "flex", gap: 12, listStyle: "none", padding: 0, flexWrap: "wrap" }}>
            {a.members.map((m) => (
              <li key={m.id} style={{ borderLeft: `6px solid ${m.color}`, paddingLeft: 8 }}>
                {m.name}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
