import { Link } from "react-router-dom";

const ERROR_PAGES = {
  401: ["401", "You need to sign in.", "This area is reserved for your account. Please sign in to continue.", "If you just signed in, try refreshing the page."],
  403: ["403", "You do not have access.", "Your account is not allowed to open this area. If you believe this is a mistake, check your permissions or invite me to review them.", "HEY keeps private spaces locked unless you grant access."],
  429: ["429", "A little too fast.", "HEY has hit the rate limit for a moment. Take a breath and try again shortly.", "Rapid requests are throttled to keep your data safe and the system stable."],
  500: ["500", "Something went wrong.", "An unexpected error interrupted the request. Your data was not lost — try again in a moment.", "If this keeps happening, open Settings and review the system status."],
};

export function ErrorState({ code, title, message, hint }) {
  return (
    <main className="hey-state-page">
      <p className="hey-state-kicker">{code}</p>
      <h1>{title}</h1>
      <p>{message}</p>
      {hint && <p className="hey-state-hint">{hint}</p>}
      <Link className="hey-btn-primary" to="/chat">Open HEY</Link>
    </main>
  );
}

export function Error401() {
  const [code, title, message, hint] = ERROR_PAGES[401];
  return <ErrorState code={code} title={title} message={message} hint={hint} />;
}

export function Error403() {
  const [code, title, message, hint] = ERROR_PAGES[403];
  return <ErrorState code={code} title={title} message={message} hint={hint} />;
}

export function Error429() {
  const [code, title, message, hint] = ERROR_PAGES[429];
  return <ErrorState code={code} title={title} message={message} hint={hint} />;
}

export function Error500() {
  const [code, title, message, hint] = ERROR_PAGES[500];
  return <ErrorState code={code} title={title} message={message} hint={hint} />;
}

export default function ErrorPage({ code }) {
  const entry = ERROR_PAGES[code] || ERROR_PAGES[500];
  const [errorCode, title, message, hint] = entry;
  return <ErrorState code={errorCode} title={title} message={message} hint={hint} />;
}