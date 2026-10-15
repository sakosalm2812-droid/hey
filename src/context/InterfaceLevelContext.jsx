import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getSettings, updateSettings } from "../lib/settingsManager.js";
import {
  DEFAULT_INTERFACE_LEVEL,
  isInterfaceLevel,
  resolveInterfaceLevel,
  saveInterfaceLevel as persistInterfaceLevel,
} from "../lib/interfaceLevel.js";

const InterfaceLevelContext = createContext(null);

export function InterfaceLevelProvider({ children }) {
  const { user } = useAuth();
  const accountId = user?.id;
  const [level, setLevel] = useState(DEFAULT_INTERFACE_LEVEL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    const request = ++requestRef.current;
    setLevel(DEFAULT_INTERFACE_LEVEL);
    setPersisted(false);
    setError("");
    setSaving(false);
    setLoading(Boolean(accountId));

    if (!accountId) {
      setLoading(false);
      return () => {
        requestRef.current += 1;
      };
    }

    getSettings(accountId)
      .then((settings) => {
        if (requestRef.current === request) {
          setLevel(resolveInterfaceLevel(settings));
          setPersisted(isInterfaceLevel(settings?.interfaceLevel));
        }
      })
      .catch(() => {
        if (requestRef.current === request) {
          setLevel(DEFAULT_INTERFACE_LEVEL);
          setError("Your interface preference could not be loaded. Simple mode is active.");
        }
      })
      .finally(() => {
        if (requestRef.current === request) setLoading(false);
      });

    return () => {
      if (requestRef.current === request) requestRef.current += 1;
    };
  }, [accountId]);

  const changeLevel = useCallback(async (nextLevel) => {
    if (!accountId || saving) return false;
    if (nextLevel === level) return true;

    const request = requestRef.current;
    const previousLevel = level;
    setLevel(nextLevel);
    setSaving(true);
    setError("");

    try {
      await persistInterfaceLevel({
        userId: accountId,
        level: nextLevel,
        getSettings,
        updateSettings,
      });
      if (requestRef.current === request) setPersisted(true);
      return true;
    } catch {
      if (requestRef.current === request) {
        setLevel(previousLevel);
        setError("Your interface preference could not be saved. Try again.");
      }
      return false;
    } finally {
      if (requestRef.current === request) setSaving(false);
    }
  }, [accountId, level, saving]);

  return (
    <InterfaceLevelContext.Provider value={{ level, loading, saving, persisted, error, changeLevel }}>
      {children}
    </InterfaceLevelContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useInterfaceLevel() {
  const value = useContext(InterfaceLevelContext);
  if (!value) throw new Error("useInterfaceLevel must be used within InterfaceLevelProvider");
  return value;
}
