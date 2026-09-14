import { useAuth } from './AuthContext'
import { motion } from "framer-motion";

import { press, springs } from "./lib/heyMotion";

export default function HomePage() {
  const { user, signOut } = useAuth()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #1E4D3A 0%, #061A12 60%)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center' }}
      >
        <h1 style={{
          color: '#FF8C42',
          fontSize: '72px',
          fontWeight: '900',
          letterSpacing: '-3px',
          marginBottom: '8px'
        }}>
          HEY
        </h1>
        <p style={{ color: '#F4F9FF', fontSize: '20px', marginBottom: '8px' }}>
          Aight {user?.email}. Let us go.
        </p>
        <p style={{ color: '#F4F9FF60', marginBottom: '40px' }}>
          Your second brain is ready.
        </p>
        <motion.button
          whileHover={{ scale: 1.04, transition: springs.snappy }}
          whileTap={{ scale: 0.97, transition: press }}
          onClick={signOut}
          style={{
            padding: '12px 32px',
            background: 'transparent',
            border: '1px solid rgba(255,140,66,0.5)',
            borderRadius: '8px',
            color: '#FF8C42',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          Sign out
        </motion.button>
      </motion.div>
    </div>
  )
}