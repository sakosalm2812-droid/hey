import Navbar from "../Navbar/Navbar";
import PublicFooter from "./PublicFooter";
import BlockBackground from "../BlockBackground";

export default function PublicLayout({ children }) {
  return (
    <div
      className="hey-public-shell"
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary, #020508)",
        color: "var(--text-primary, #F5FBFF)",
        transition: "background 0.45s ease, color 0.45s ease",
      }}
    >
      <BlockBackground />
      <Navbar />

      <a className="hey-skip-link" href="#main-content">Skip to content</a>
      <main id="main-content" tabIndex={-1} className="hey-public-main">
        {children}
      </main>

      <PublicFooter />
    </div>
  );
}
