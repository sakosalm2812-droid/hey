import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import AppearanceControl from "../Theme/AppearanceControl.jsx";
import styles from "./Navbar.module.css";

const links = [
  { name: "Product", path: "/features" },
  { name: "Live", path: "/live" },
  { name: "Create", path: "/create" },
  { name: "Pricing", path: "/pricing" },
  { name: "Download", path: "/download" },
  { name: "Sign in", path: "/login" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = event => { if (event.key === 'Escape') { setMenuOpen(false); navRef.current?.querySelector('button[aria-expanded]')?.focus(); } };
    const closeOutside = event => { if (!navRef.current?.contains(event.target)) setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOutside);
    return () => { window.removeEventListener('keydown', closeOnEscape); window.removeEventListener('pointerdown', closeOutside); };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header ref={navRef} className={styles.wrapper}>
      <div className={styles.navbar}>
        <NavLink to="/" className={styles.logo} onClick={closeMenu} aria-label="HEY home">
          <span className={styles.wordmark}>HEY</span>
        </NavLink>

        <nav className={styles.links} aria-label="Public navigation">
          {links.map((link) => (
            <NavLink key={link.path} to={link.path} className={({ isActive }) => isActive ? styles.active : styles.link}>
              {link.name}
            </NavLink>
          ))}
        </nav>

        <div className={styles.action}>
          <AppearanceControl />
          <motion.button type="button" className={styles.cta} onClick={() => navigate("/signup")} whileHover={{ y: -2 }} whileTap={{ scale: .97 }}>
            Enter HEY <ArrowUpRight size={15} />
          </motion.button>
        </div>

        <button type="button" className={styles.menuButton} onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen}>
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div className={styles.mobileMenu} initial={{ opacity: 0, y: -10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: .98 }}>
            <AppearanceControl />
            <nav aria-label="Mobile public navigation">
              {links.map((link) => <NavLink key={link.path} to={link.path} onClick={closeMenu} className={({ isActive }) => isActive ? styles.mobileActive : styles.mobileLink}>{link.name}</NavLink>)}
            </nav>
            <button type="button" className={styles.mobileCta} onClick={() => { closeMenu(); navigate("/signup"); }}>Enter HEY <ArrowUpRight size={15} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
