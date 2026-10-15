import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { gestureEngine } from "../../core/gestureEngine.js";
import { publish, subscribe } from "../../core/eventBus.js";
import { recordAudit } from "../../core/auditLog.js";

export default function GestureActionBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingRef = useRef(null);

  useEffect(() => subscribe("gesture.action_requested", (request) => {
    if (gestureEngine.getRecognitionMode() !== "active" || request?.action?.action !== "summon") {
      publish("gesture.action_failed", { requestId: request?.requestId, reason: "unsupported_or_test_mode" });
      return;
    }
    if (location.pathname === "/dashboard") {
      publish("gesture.action_completed", { requestId: request.requestId, action: "summon", route: "/dashboard" });
      recordAudit({ action: "gesture.action_completed", status: "completed", metadata: { requestId: request.requestId, route: "/dashboard" } });
      return;
    }
    pendingRef.current = request;
    navigate("/dashboard");
  }), [location.pathname, navigate]);

  useEffect(() => {
    const request = pendingRef.current;
    if (!request || location.pathname !== "/dashboard") return;
    pendingRef.current = null;
    publish("gesture.action_completed", { requestId: request.requestId, action: "summon", route: location.pathname });
    recordAudit({ action: "gesture.action_completed", status: "completed", metadata: { requestId: request.requestId, route: location.pathname } });
  }, [location.pathname]);

  return null;
}
