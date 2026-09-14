import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/orbitron/400.css";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/600.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/rajdhani/400.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";

import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { LocaleProvider } from "./i18n/LocaleContext.jsx";
import { bootLogger } from "./core/heyLogger.js";

import "./styles/variables.css";
import "./styles/theme.css";
import "./styles/globals.css";
import "./styles/buttons.css";
import "./styles/utilities.css";
import "./styles/chat.css";
import "./styles/liquid.css";
import "./styles/modes.css";
import "./styles/states.css";
import "./styles/compliance.css";


ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);

bootLogger();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("HEY service worker registration failed:", error);
    });
  });
}
