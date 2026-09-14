import { Link } from "react-router-dom";

const supportSections = [
  ["Before you start", "Most questions are answered by what the interface shows you. HEY never claims an action ran unless its execution layer confirmed it, and unavailable capabilities are labelled as unavailable rather than faked. If something looks wrong, check the Device Center and Debug pages first — they report the real runtime state."],
  ["Getting help", "Use the Debug page (/debug) to export a structured snapshot of your session, runtime, and recent activity. Include that snapshot when you report an issue; it speeds up diagnosis and never includes provider credentials or secrets."],
  ["Provider-backed features", "Conversations, vision, and search only ask for provider access when you use the relevant capability. If a provider is missing or unreachable, HEY tells you instead of pretending it worked. Configure providers in Settings."],
  ["Data and deletion", "You can export memories as JSON from the Memory page and delete individual records there and on the relevant workspace pages. Account deletion is handled through the operator-supported deletion process described in the Privacy page."],
  ["Crisis support", "If you are in immediate danger or facing a crisis, free professional support is available 24/7 in the US at 988 (Suicide & Crisis Lifeline) and at 1-800-273-8255. The Crisis mode inside HEY can list more resources without you having to explain anything."],
  ["Operator contact", "A support and legal-contact address, governing entity, and applicable jurisdiction must be published by the operator before a public commercial launch. Until then, this build is for evaluation, and the public legal pages say exactly that."],
];

export default function SupportPage() {
  return (
    <main className="hey-legal-page">
      <header>
        <p className="hey-state-kicker">HEY support</p>
        <h1>Help & support</h1>
        <p>Honest paths for getting unstuck, reporting issues, and understanding what HEY can and cannot do right now.</p>
      </header>

      <div className="hey-legal-content">
        {supportSections.map(([heading, body]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}

        <section>
          <h2>Report an issue</h2>
          <p>
            Open the <Link to="/debug">Debug page</Link> and use Download snapshot. Then describe what you expected,
            what happened, and paste the snapshot into your report.
          </p>
        </section>

        <section>
          <h2>Return home</h2>
          <p>
            Explore the product from its <Link to="/">landing page</Link>, or review the{" "}
            <Link to="/privacy">privacy policy</Link> and <Link to="/terms">terms of use</Link>.
          </p>
        </section>
      </div>

      <nav aria-label="Support navigation">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms of use</Link>
        <Link to="/">Home</Link>
      </nav>
    </main>
  );
}