/* eslint-disable react/prop-types */
import  { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

/**
 * D-ID Agent (FAB) Widget Loader
 * - Injects the <script type="module" src="https://agent.d-id.com/v2/index.js" ...> dynamically.
 * - Prevents duplicate injection across route changes.
 * - Exposes .reload() and .remove() methods via ref if you ever need to reconfigure or tear down.
 *
 * NOTE:
 *  - This widget renders a floating action button (FAB) globally; the component itself returns null.
 *  - If you change critical props (clientKey/agentId/etc.), the component will re-inject the script.
 */

const DID_AGENT_SRC = "https://agent.d-id.com/v2/index.js";
// If you need multiple distinct instances, make SCRIPT_ID unique per instance.
const SCRIPT_ID = "did-agent-loader-v2";

const DIDAvatarWidget = forwardRef(
  (
    {
      // Props mirror the data-* attributes supported by the script tag:
      mode = "fabio", // data-mode
      clientKey,      // data-client-key (required)
      agentId,        // data-agent-id (required)
      name = "did-agent", // data-name
      monitor = true,     // data-monitor
      orientation = "horizontal", // data-orientation
      position = "right",         // data-position

      // Behavior
      persistAcrossRoutes = true, // if false, we’ll try to clean up on unmount
      // Optional: provide your own static id to allow multiple different widgets (advanced)
      scriptId = SCRIPT_ID,
    },
    ref
  ) => {
    const scriptRef = useRef(null);

    useImperativeHandle(ref, () => ({
      reload: () => {
        removeScript({ removeWidget: true });
        injectScript();
      },
      remove: () => {
        removeScript({ removeWidget: true });
      },
    }));

    useEffect(() => {
      if (typeof window === "undefined" || typeof document === "undefined") return;
      injectScript();

      return () => {
        if (!persistAcrossRoutes) removeScript({ removeWidget: true });
      };
      // Re-inject if any core config changes:
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, clientKey, agentId, name, monitor, orientation, position, persistAcrossRoutes, scriptId]);

    function injectScript() {
      const existing = document.getElementById(scriptId);
      if (existing) return; // already injected

      if (!clientKey || !agentId) {
        // Fail fast without injecting an invalid setup
        console.warn("[DIDAvatarWidget] Missing required props: clientKey and/or agentId.");
        return;
      }

      const script = document.createElement("script");
      script.type = "module";
      script.async = true;
      script.src = DID_AGENT_SRC;
      script.id = scriptId;

      // Map props -> data-* attributes (dataset converts camelCase to data-kebab-case):
      script.dataset.mode = mode;
      script.dataset.clientKey = clientKey;
      script.dataset.agentId = agentId;
      script.dataset.name = name;
      script.dataset.monitor = String(monitor);
      script.dataset.orientation = orientation;
      script.dataset.position = position;

      document.body.appendChild(script);
      scriptRef.current = script;
    }

    function removeScript({ removeWidget = false } = {}) {
      const el = document.getElementById(scriptId);
      if (el) el.remove();
      scriptRef.current = null;

      if (removeWidget) {
        // Best-effort cleanup of any DOM the script may have added.
        // These selectors are conservative; if D-ID changes internals, nothing breaks.
        const candidates = [
          '[data-name="did-agent"]',
          "#did-agent",
          ".did-voice-agent",
          "[data-did-agent]",
        ];
        candidates.forEach((sel) => {
          document.querySelectorAll(sel).forEach((node) => node.remove());
        });
      }
    }

    return null; // Global FAB—nothing to render inline
  }
);

export default DIDAvatarWidget;
