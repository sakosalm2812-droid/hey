import { useEffect, useState } from 'react';
export default function ConnectionNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online ? null : <div className="hey-network-notice" role="status">You’re offline. Reconnect to send messages and sync your changes.</div>;
}
