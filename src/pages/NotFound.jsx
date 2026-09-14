import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="hey-state-page">
      <p className="hey-state-kicker">404</p>
      <h1>This page is not here.</h1>
      <p>It may have moved, or the address may be incorrect.</p>
      <Link className="hey-btn-primary" to="/">Go home</Link>
    </main>
  );
}
