import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "./AuthContext.jsx";

import styles from "./pages/Auth.module.css";

export default function ResetPasswordPage() {
  const { user, loading, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.subtitle}>Checking recovery link...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.page}>
        <motion.div
          className={styles.card}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.brand}>
            <span className="hey-script">HEY</span>
            <small>Personal Intelligence System</small>
          </div>

          <p className={styles.subtitle}>Invalid or expired recovery link.</p>
          <p className={styles.hint}>
            Request a fresh link from the login page and open it in the same
            browser you started the reset from.
          </p>

          <motion.button
            className={styles.button}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/login")}
          >
            Back to login
          </motion.button>
        </motion.div>
      </div>
    );
  }

  async function handleReset(event) {
    event.preventDefault();
    if (password.length < 6) {
      setError("Use at least 6 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError("");

    const { error: updateError } = await updatePassword(password);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    await signOut();
    setDone(true);
    setSubmitting(false);
  }

  if (done) {
    return (
      <div className={styles.page}>
        <motion.div
          className={styles.card}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.brand}>
            <span className="hey-script">HEY</span>
            <small>Personal Intelligence System</small>
          </div>

          <p className={styles.subtitle}>Password updated.</p>
          <p className={styles.hint}>
            You can sign in again with your new password.
          </p>

          <motion.button
            className={styles.button}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/login")}
          >
            Continue to login
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.card}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.brand}>
          <span className="hey-script">HEY</span>
          <small>Personal Intelligence System</small>
        </div>

        <p className={styles.subtitle}>Choose a new password</p>

        {error && (
          <p className={styles.error} role="alert" aria-live="polite">
            {error}
          </p>
        )}

        <form onSubmit={handleReset}>
          <input
            className={styles.input}
            type="password"
            placeholder="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            aria-label="New password"
          />

          <input
            className={styles.input}
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            aria-label="Confirm new password"
          />

          <motion.button
            className={styles.button}
            type="submit"
            disabled={submitting}
            whileTap={{ scale: 0.97 }}
          >
            {submitting ? "Updating..." : "Update password"}
          </motion.button>
        </form>

        <p className={styles.subtitle}>
          <Link className={styles.link} to="/login">
            Back to login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}