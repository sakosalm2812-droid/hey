import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { press, springs } from "./lib/heyMotion";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  Globe2,
  Hammer,
  Bot,
  Brain,
  MessageSquare,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  Target,
  Dumbbell,
  Wallet,
  GraduationCap,
  BookOpen,
  BarChart3,
  Sunrise,
  ShieldAlert,
  LockKeyhole,
  ChevronRight,
  Layers3,
} from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { useLocale } from "./i18n/LocaleContext.jsx";

const sections = [
  {
    i18nKey: "nav.core",
    label: "Core Intelligence",
    items: [
      { title: "Dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard, to: "/dashboard" },
      { title: "HEY Chat", i18nKey: "nav.chat", icon: MessageSquare, to: "/chat" },
      { title: "The Cosmos", i18nKey: "nav.cosmos", icon: Globe2, to: "/cosmos" },
      { title: "The Forge", i18nKey: "nav.forge", icon: Hammer, to: "/forge" },
      { title: "Agents", i18nKey: "nav.agents", icon: Bot, to: "/agents" },
      { title: "Memory", i18nKey: "nav.memory", icon: Brain, to: "/memory" },
      { title: "Capabilities", i18nKey: "nav.capabilities", icon: Layers3, to: "/capabilities" },
    ],
  },

  {
    i18nKey: "nav.life",
    label: "Life OS",
    items: [
      { title: "Projects", i18nKey: "nav.projects", icon: FolderKanban, to: "/projects" },
      { title: "Tasks", i18nKey: "nav.tasks", icon: CheckSquare, to: "/tasks" },
      { title: "Calendar", i18nKey: "nav.calendar", icon: CalendarDays, to: "/calendar" },
      { title: "Goals", i18nKey: "nav.goals", icon: Target, to: "/goals" },
      { title: "Habits", i18nKey: "nav.habits", icon: Sparkles, to: "/habits" },
      { title: "Health", i18nKey: "nav.health", icon: Dumbbell, to: "/health" },
      { title: "Finance", i18nKey: "nav.finance", icon: Wallet, to: "/finance" },
      { title: "Learn", i18nKey: "nav.learn", icon: GraduationCap, to: "/learn" },
      { title: "Journal", i18nKey: "nav.journal", icon: BookOpen, to: "/journal" },
      { title: "Analytics", i18nKey: "nav.analytics", icon: BarChart3, to: "/analytics" },
    ],
  },

  {
    i18nKey: "nav.modes",
    label: "Modes",
    items: [
      { title: "All Modes", i18nKey: "nav.modesHub", icon: Layers3, to: "/modes" },
      { title: "Morning", i18nKey: "nav.morning", icon: Sunrise, to: "/morning" },
      { title: "Crisis", i18nKey: "nav.crisis", icon: ShieldAlert, to: "/crisis" },
    ],
  },

  {
    i18nKey: "nav.trust",
    label: "Trust",
    items: [
      { title: "Permissions", i18nKey: "nav.permissions", icon: LockKeyhole, to: "/permissions" },
      { title: "Device Access", i18nKey: "nav.device", icon: ShieldAlert, to: "/device" },
    ],
  },
];

export default function Sidebar() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
<aside
      className="hey-sidebar"
      style={{
        position: "fixed",
        insetInlineStart: 24,
        top: 24,
        bottom: 24,
        width: 260,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        background: "rgba(12,12,18,.82)",
        border:
          "1px solid var(--border-subtle, rgba(255,255,255,.07))",
        borderRadius: "var(--radius-sheet, 28px)",
        backdropFilter: "blur(35px)",
        WebkitBackdropFilter: "blur(35px)",
        boxShadow:
          "0 25px 80px rgba(0,0,0,.45)",
        zIndex: 100,
        overflowY: "auto",
      }}
    >
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontFamily:
              '"Instrument Serif", serif',
            fontSize: 42,
            fontWeight: 400,
            lineHeight: 1,
          }}
        >
          HEY
        </h1>

        <p
          style={{
            marginTop: 10,
            color: "var(--text-secondary)",
            fontSize: 11,
            letterSpacing: ".12em",
            textTransform: "uppercase",
          }}
        >
          {t("nav.tagline")}
        </p>
      </div>


      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          flex: 1,
        }}
      >
        {sections.map((section) => (
          <div key={section.i18nKey}>
            <div
              style={{
                fontSize: 10,
                color: "var(--gold-primary)",
                letterSpacing: ".15em",
                textTransform:
                  "uppercase",
                marginBottom: 10,
                paddingLeft: 12,
              }}
            >
              {t(section.i18nKey)}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.i18nKey}
                    to={item.to}
                    style={{
                      textDecoration: "none",
                    }}
                  >
                    {({ isActive }) => (
                      <motion.div
                        whileHover={{
                          x: 4,
                          transition: springs.snappy,
                        }}
                        whileTap={{
                          scale: 0.97,
                          transition: press,
                        }}
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          padding:
                            "11px 14px",
                          borderRadius: 16,
                          background:
                            isActive
                              ? "rgba(255,255,255,.09)"
                              : "transparent",
                          border:
                            isActive
                              ? "1px solid rgba(255,255,255,.14)"
                              : "1px solid transparent",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: 12,
                          }}
                        >
                          <Icon
                            size={17}
                            color={
                              isActive
                                ? "var(--gold-primary)"
                                : "var(--text-secondary)"
                            }
                          />

                          <span
                            style={{
                              color:
                                isActive
                                  ? "var(--text-primary)"
                                  : "var(--text-secondary)",
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          >
                            {t(item.i18nKey)}
                          </span>
                        </div>

                        {isActive && (
                          <ChevronRight
                            size={14}
                            color="var(--gold-primary)"
                          />
                        )}
                      </motion.div>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>


      <div
        style={{
          marginTop: 20,
          padding: 18,
          borderRadius: 20,
          background:
            "rgba(255,255,255,.04)",
          border:
            "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--gold-primary)",
            letterSpacing: ".1em",
            textTransform: "uppercase",
          }}
        >
          HEY Core
        </div>

        <div
          style={{
            fontSize: 24,
            fontFamily:
              '"Instrument Serif", serif',
            marginTop: 8,
          }}
        >
          {online ? t("common.online") : t("common.offline")}
        </div>

        <p
          style={{
            color:
              "var(--text-secondary)",
            fontSize: 12,
            lineHeight: 1.6,
            marginTop: 8,
          }}
        >
          {online && user
            ? `Session active for ${user.email}`.slice(0, 80)
            : online
              ? "App running in this browser."
              : "You're offline — changes will sync later."}
        </p>
      </div>
    </aside>
  );
}
