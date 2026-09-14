import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MessageCircle,
  Globe2,
  Hammer,
  Brain,
  CalendarDays,
  CheckSquare,
  BookOpen,
  Sparkles,
  Settings,
  Sunrise,
  ShieldAlert,
} from "lucide-react";

const navigation = [
  {
    section: "Core",
    items: [
      {
        name: "Dashboard",
        icon: LayoutDashboard,
        path: "/dashboard",
      },
      {
        name: "HEY",
        icon: MessageCircle,
        path: "/chat",
      },
      {
        name: "The Cosmos",
        icon: Globe2,
        path: "/cosmos",
      },
      {
        name: "The Forge",
        icon: Hammer,
        path: "/forge",
      },
    ],
  },

  {
    section: "Life",
    items: [
      {
        name: "Memory",
        icon: Brain,
        path: "/memory",
      },
      {
        name: "Calendar",
        icon: CalendarDays,
        path: "/calendar",
      },
      {
        name: "Tasks",
        icon: CheckSquare,
        path: "/tasks",
      },
      {
        name: "Learn",
        icon: BookOpen,
        path: "/learn",
      },
    ],
  },

  {
    section: "Modes",
    items: [
      {
        name: "Morning",
        icon: Sunrise,
        path: "/morning",
      },
      {
        name: "Crisis",
        icon: ShieldAlert,
        path: "/crisis",
      },
    ],
  },
];

export default function HEYSidebar() {
  return (
    <aside
      style={{
        position: "fixed",
        left: 24,
        top: 24,
        bottom: 24,

        width: 260,

        padding: 24,

        borderRadius: 32,

        background:
          "var(--glass-bg)",

        backdropFilter:
          "blur(30px)",

        WebkitBackdropFilter:
          "blur(30px)",

        border:
          "1px solid var(--border)",

        boxShadow:
          "0 25px 80px rgba(0,0,0,.35)",

        display: "flex",
        flexDirection: "column",

        zIndex: 100,
      }}
    >

      {/* Brand */}

      <div
        style={{
          marginBottom: 40,
        }}
      >
        <h1
          style={{
            fontSize: 38,
            fontWeight: 600,
            letterSpacing: "-.04em",
          }}
        >
          HEY
        </h1>

        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color:
              "var(--text-secondary)",
            letterSpacing: ".12em",
            textTransform:
              "uppercase",
          }}
        >
          AI Life Operating System
        </p>
      </div>


      {/* Navigation */}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >

        {navigation.map((group) => (
          <div
            key={group.section}
            style={{
              marginBottom: 28,
            }}
          >

            <div
              style={{
                fontSize: 11,
                color:
                  "var(--gold-primary)",
                letterSpacing:
                  ".15em",
                marginBottom: 12,
              }}
            >
              {group.section}
            </div>


            {group.items.map((item) => {

              const Icon = item.icon;

              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  style={{
                    textDecoration:
                      "none",
                  }}
                >

                  {({isActive}) => (

                    <motion.div
                      whileHover={{
                        x: 5,
                      }}

                      whileTap={{
                        scale:.98,
                      }}

                      style={{
                        display:
                          "flex",

                        alignItems:
                          "center",

                        gap: 14,

                        padding:
                          "13px 14px",

                        marginBottom:
                          6,

                        borderRadius:
                          18,

                        background:
                          isActive
                          ? "rgba(46,111,87,.18)"
                          : "transparent",

                        border:
                          isActive
                          ? "1px solid rgba(46,111,87,.3)"
                          : "1px solid transparent",

                        color:
                          isActive
                          ? "white"
                          : "var(--text-secondary)",
                      }}
                    >

                      <Icon size={18}/>

                      <span>
                        {item.name}
                      </span>

                    </motion.div>

                  )}

                </NavLink>
              );
            })}

          </div>
        ))}

      </div>


      {/* Core Status */}

      <div
        style={{
          padding: 18,

          borderRadius: 22,

          background:
            "rgba(46,111,87,.12)",

          border:
            "1px solid rgba(46,111,87,.2)",
        }}
      >

        <div
          style={{
            display:"flex",
            alignItems:"center",
            gap:8,
          }}
        >

          <Sparkles
            size={16}
            color="var(--gold-primary)"
          />

          <span>
            HEY Core
          </span>

        </div>


        <p
          style={{
            marginTop:8,
            fontSize:13,
            color:
              "var(--text-secondary)",
          }}
        >
          Always learning.
          <br/>
          Always ready.
        </p>

      </div>


      {/* Settings */}

      <NavLink
        to="/settings"
        style={{
          marginTop:16,
          textDecoration:"none",
        }}
      >

        <div
          style={{
            display:"flex",
            alignItems:"center",
            gap:12,
            color:
              "var(--text-secondary)",
            padding:12,
          }}
        >

          <Settings size={18}/>

          Settings

        </div>

      </NavLink>


    </aside>
  );
}