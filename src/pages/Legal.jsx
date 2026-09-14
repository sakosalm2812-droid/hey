import { Link } from "react-router-dom";

const privacySections = [
  ["What HEY stores", "HEY stores account details, conversations, records you create, and memories you choose to save. The product may also store diagnostics needed to investigate failures. Voice and uploaded content are processed only when you use the related capability."],
  ["How information is used", "HEY uses this information to provide conversations, memory retrieval, workspace features, and account settings. When an AI or web-search provider is configured, the relevant request context may be sent to that provider to produce the requested result."],
  ["Your controls", "You can manage saved memories, settings, and permissions from within HEY. Do not enter credentials or highly sensitive information into a provider-backed conversation unless you understand that provider's terms and data handling."],
  ["Retention and deletion", "Conversation and memory data remain until you delete them or the account is removed through an operator-supported deletion process. Account-deletion contact details must be supplied by the service operator before a public launch."],
  ["Security", "HEY applies account isolation, permission checks, and confirmation gates, but no system can guarantee absolute security. Keep your account credentials private and review actions before confirming them."],
];

const termsSections = [
  ["Using HEY", "Use HEY lawfully and only with accounts, devices, data, and services you are authorized to access. You remain responsible for reviewing important output and confirmed actions."],
  ["Availability and providers", "Some features depend on configured third-party services, hardware, or a network connection. HEY will identify unavailable capabilities rather than claim they ran. Provider output can be inaccurate, incomplete, or unavailable."],
  ["Your content", "You retain responsibility for the content you submit. Do not submit material you do not have the right to use, or information that could put you or another person at risk if shared with a configured provider."],
  ["Changes and support", "The service operator must publish a support and legal-contact address, governing entity, and applicable jurisdiction before public release. Until those details are supplied, HEY is not ready for a public commercial launch."],
];

export default function LegalPage({ document }) {
  const isPrivacy = document === "privacy";
  const title = isPrivacy ? "Privacy" : "Terms of use";
  const sections = isPrivacy ? privacySections : termsSections;

  return (
    <main className="hey-legal-page">
      <header>
        <p className="hey-state-kicker">HEY legal</p>
        <h1>{title}</h1>
        <p>This page describes the product as currently implemented. It does not make claims about an operator, address, jurisdiction, or certification that have not been provided.</p>
      </header>
      <div className="hey-legal-content">
        {sections.map(([heading, body]) => <section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}
      </div>
      <nav aria-label="Legal pages"><Link to={isPrivacy ? "/terms" : "/privacy"}>{isPrivacy ? "Terms of use" : "Privacy"}</Link><Link to="/">Home</Link></nav>
    </main>
  );
}
