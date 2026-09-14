import { Link } from "react-router-dom";

const productLinks = [
  { name: "Product", path: "/features" },
  { name: "Customization", path: "/customization" },
  { name: "Pricing", path: "/pricing" },
];

const legalLinks = [
  { name: "Privacy", path: "/privacy" },
  { name: "Terms", path: "/terms" },
  { name: "Support", path: "/support" },
];

export default function PublicFooter() {
  return (
    <footer className="hey-public-footer">
      <div className="hey-public-footer-inner">
        <div className="hey-footer-brand">
          <Link to="/"><span className="hey-script">HEY</span></Link>
          <p>A personal intelligence system — memory, voice, and creation in one calm layer around your life.</p>
        </div>

        <div className="hey-footer-col">
          <h3>Product</h3>
          {productLinks.map((link) => (
            <Link key={link.path} to={link.path}>{link.name}</Link>
          ))}
        </div>

        <div className="hey-footer-col">
          <h3>Legal</h3>
          {legalLinks.map((link) => (
            <Link key={link.path} to={link.path}>{link.name}</Link>
          ))}
        </div>

        <div className="hey-footer-col">
          <h3>Get started</h3>
          <Link to="/signup">Enter HEY</Link>
          <Link to="/login">Log in</Link>
        </div>
      </div>

      <div className="hey-public-footer-bottom">
        <div>
          <span className="hey-live-indicator" aria-hidden="true" />
          Private by default
        </div>
        <div>© {new Date().getFullYear()} HEY</div>
      </div>
    </footer>
  );
}