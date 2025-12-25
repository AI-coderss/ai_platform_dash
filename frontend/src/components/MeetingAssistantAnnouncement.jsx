/* eslint-disable react/jsx-no-duplicate-props */
/* eslint-disable no-unused-vars */
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import "../styles/MeetingAssistantAnnouncement.css";

const DEFAULT_QUESTIONS = [
  "What is the AI Meeting Assistant and who should use it?",
  "How do I schedule a meeting and invite attendees?",
  "Can it record and transcribe meetings automatically?",
  "How do I generate minutes, summaries, and action items?",
  "How can I share minutes and follow up on tasks?",
  "Where can I see upcoming meetings and meeting history?",
  "How do I give feedback or report an issue to improve it?"
];

const MESSAGES = [
  "🚀 New tool is live: AI Meeting Assistant",
  "Schedule meetings instantly, with real-time notifications.",
  "Record & transcribe meetings, then generate summaries and minutes.",
  "Extract action items, assign owners, and track follow-ups.",
  "Revisit meeting history anytime to stay aligned.",
  "We’d love your feedback to make the next release even better."
];

/* ---------------- Voice Agent bridge ---------------- */
const safeOpenVoice = () => {
  if (window.VoiceAssistantBridge?.open) {
    try {
      window.VoiceAssistantBridge.open();
      return;
    } catch {}
  }
  try {
    window.dispatchEvent(new Event("assistant:open"));
  } catch {}
};

const safeAskVoice = async (text) => {
  const q = String(text || "").trim();
  if (!q) return;

  // Prefer bridge if present
  if (window.VoiceAssistantBridge?.ask) {
    try {
      await window.VoiceAssistantBridge.ask(q);
      return;
    } catch {}
  }

  // Fallback to event (we also pass meta flags—safe even if ignored)
  try {
    window.dispatchEvent(
      new CustomEvent("voice:ask", {
        detail: {
          text: q,
          meta: { source: "meeting_announcement", disallow_tools: true, disallow_media: true }
        }
      })
    );
  } catch {}
};

/* ---------------- External audio player (ONLY on explicit action) ---------------- */
const safePlayMeetingAssistantAudio = () => {
  // This intentionally triggers your existing audio player / card console.
  if (window.CardConsoleBridge?.play) {
    try {
      window.CardConsoleBridge.play("meeting_assistant", { autoplay: true });
      return;
    } catch {}
  }
  try {
    window.dispatchEvent(
      new CustomEvent("card:play", { detail: { id: "meeting_assistant", autoplay: true } })
    );
  } catch {}
};

/* ---------------- Optional highlight WITHOUT triggering audio ----------------
   If you already have a highlight event, we try it first.
   Otherwise we try to add a CSS class to a likely target element.
   This NEVER calls card:play.
-------------------------------------------------------------------------------- */
const highlightMeetingAssistant = (on) => {
  // If your app supports this event, use it (no audio).
  try {
    window.dispatchEvent(
      new CustomEvent("card:highlight", { detail: { id: "meeting_assistant", active: !!on } })
    );
  } catch {}

  const selectors = [
    '[data-card-id="meeting_assistant"]',
    '[data-app-card="meeting_assistant"]',
    '[data-product="meeting_assistant"]',
    "#meeting_assistant",
    ".meeting-assistant-card",
    '[data-agent-id="products.launch:meeting"]',
    '[data-agent-id="products.help:meeting"]'
  ];

  let el = null;
  for (const s of selectors) {
    const found = document.querySelector(s);
    if (found) {
      el = found;
      break;
    }
  }
  if (!el) return;

  if (on) el.classList.add("maa-external-highlight");
  else el.classList.remove("maa-external-highlight");
};

export default function MeetingAssistantAnnouncement() {
  const rootRef = useRef(null);
  const dragConstraintsRef = useRef(null);

  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);

  const [typed, setTyped] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const [activeSection, setActiveSection] = useState("overview");
  const [customQ, setCustomQ] = useState("");

  // 🔔 Notification sound (public/one.mp3)
  const notifRef = useRef(null);
  const playedOnceRef = useRef(false);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const questions = useMemo(() => DEFAULT_QUESTIONS, []);

  useEffect(() => {
    dragConstraintsRef.current = document.body;
  }, []);

  // Highlight on open/minimize toggle (NO audio)
  useEffect(() => {
    if (!open) return;
    highlightMeetingAssistant(!minimized);
    return () => highlightMeetingAssistant(false);
  }, [open, minimized]);

  // Fly-in animation from top
  useEffect(() => {
    if (!open || minimized) return;
    const el = rootRef.current;
    if (!el) return;

    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { y: -90, opacity: 0, scale: 0.985 },
      { y: 0, opacity: 1, scale: 1, duration: 1.25, ease: "power3.out" }
    );
  }, [open, minimized]);

  // Notification sound on first appearance
  useEffect(() => {
    if (!open || minimized) return;
    if (playedOnceRef.current) return;

    if (!notifRef.current) {
      notifRef.current = new Audio("/one.mp3");
      notifRef.current.preload = "auto";
      notifRef.current.volume = 0.75;
    }

    const tryPlay = async () => {
      try {
        await notifRef.current.play();
        playedOnceRef.current = true;
        setSoundBlocked(false);
      } catch {
        setSoundBlocked(true);
      }
    };

    tryPlay();
  }, [open, minimized]);

  // If autoplay blocked, enable sound on first interaction INSIDE card
  const handleUserGesture = async () => {
    if (!soundBlocked || playedOnceRef.current) return;
    try {
      await notifRef.current?.play();
      playedOnceRef.current = true;
      setSoundBlocked(false);
    } catch {}
  };

  // Continuous typing loop
  useEffect(() => {
    if (!open || minimized) return;

    const current = MESSAGES[msgIdx];
    const typingSpeed = deleting ? 22 : 34;
    const pauseAtEnd = 900;

    const t = setTimeout(() => {
      if (!deleting) {
        const next = charIdx + 1;
        setTyped(current.slice(0, next));
        setCharIdx(next);

        if (next >= current.length) {
          setTimeout(() => setDeleting(true), pauseAtEnd);
        }
      } else {
        const next = charIdx - 1;
        setTyped(current.slice(0, Math.max(0, next)));
        setCharIdx(next);

        if (next <= 0) {
          setDeleting(false);
          setMsgIdx((i) => (i + 1) % MESSAGES.length);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(t);
  }, [open, minimized, msgIdx, charIdx, deleting]);

  /* ---------------- Voice-agent-only ask (NO external audio) ---------------- */
  const askViaVoiceAgentOnly = async (q) => {
    const text = String(q || "").trim();
    if (!text) return;

    safeOpenVoice();

    // Strong instruction to reduce tool calls that might trigger card audio:
    const prompt = [
      "IMPORTANT:",
      "- Do NOT trigger any UI actions or media.",
      "- Do NOT call any tools (navigate_to, click_control, tutorial_play, card_play).",
      "- Answer verbally and concisely for hospital employees.",
      "",
      `Question: ${text}`,
      "",
      "Context: This is about Dr. Samir Abbas Hospital AI Meeting Assistant."
    ].join("\n");

    await safeAskVoice(prompt);
  };

  const onSendCustom = async () => {
    const q = customQ.trim();
    if (!q) return;
    setCustomQ("");
    await askViaVoiceAgentOnly(q);
  };

  const close = () => {
    setOpen(false);
    setMinimized(false);
    highlightMeetingAssistant(false);
    try {
      window.dispatchEvent(
        new CustomEvent("announcement:closed", { detail: { id: "meeting_assistant" } })
      );
    } catch {}
  };

  const minimize = () => setMinimized(true);
  const restore = () => {
    setOpen(true);
    setMinimized(false);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.14, delayChildren: 0.28 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: -10, scale: 0.995 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.46, ease: "easeOut" } }
  };

  if (!open) return null;

  return (
    <>
      {/* Minimized pill */}
      <AnimatePresence>
        {minimized && (
          <motion.button
            className="maa-mini"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            onClick={restore}
            title="Open announcement"
          >
            <span className="maa-mini-dot" />
            <span className="maa-mini-title">AI Meeting Assistant</span>
            <span className="maa-mini-cta">Open</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!minimized && (
          <motion.div
            className="maa-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* .maa-stage is click-through; only .maa-card captures clicks */}
            <motion.div
              ref={rootRef}
              className="maa-card"
              style={{ zIndex: 99999 }}
              drag
              dragElastic={0.18}
              dragConstraints={dragConstraintsRef}
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              onPointerDown={handleUserGesture}
              onKeyDown={handleUserGesture}
              role="dialog"
              aria-label="AI Meeting Assistant announcement"
            >
              {/* Header */}
              <motion.div className="maa-head" variants={itemVariants}>
                <div className="maa-badge">New</div>

                <div className="maa-head-text">
                  <div className="maa-title">AI Meeting Assistant</div>
                  <div className="maa-subtitle">Dr. Samir Abbas Hospital • internal release</div>
                </div>

                <div className="maa-head-actions">
                  <button className="maa-icon" onClick={minimize} aria-label="Minimize">
                    —
                  </button>
                  <button className="maa-icon danger" onClick={close} aria-label="Close">
                    ✕
                  </button>
                </div>
              </motion.div>

              {/* Typed hero */}
              <motion.div className="maa-hero" variants={itemVariants}>
                <div className="maa-typed">
                  <span className="maa-typed-text">{typed}</span>
                  <span className="maa-caret" />
                </div>

                <div className="maa-note">
                  Questions are answered by the <b>Voice Agent</b> (no intro audio will play).
                </div>

                {soundBlocked && (
                  <div className="maa-soundhint">
                    🔊 Tap inside this card once to enable the notification sound.
                  </div>
                )}
              </motion.div>

              {/* Tabs */}
              <motion.div className="maa-tabs" variants={itemVariants}>
                <button
                  className={`maa-tab ${activeSection === "overview" ? "active" : ""}`}
                  onClick={() => setActiveSection("overview")}
                >
                  Overview
                </button>
                <button
                  className={`maa-tab ${activeSection === "faq" ? "active" : ""}`}
                  onClick={() => setActiveSection("faq")}
                >
                  Questions
                </button>
                <button
                  className={`maa-tab ${activeSection === "try" ? "active" : ""}`}
                  onClick={() => setActiveSection("try")}
                >
                  Try it
                </button>
              </motion.div>

              {/* Body */}
              <motion.div className="maa-body" variants={itemVariants}>
                {activeSection === "overview" && (
                  <div className="maa-panel">
                    <ul className="maa-list">
                      <li>Schedule meetings & send invitations faster.</li>
                      <li>Real-time reminders and notifications.</li>
                      <li>Record + transcribe meetings automatically.</li>
                      <li>Generate minutes, summaries, and action items.</li>
                      <li>Track follow-ups and revisit meeting history anytime.</li>
                    </ul>

                    <div className="maa-actions">
                      {/* ✅ ONLY THIS plays the meeting assistant audio/player */}
                      <button className="maa-btn primary" onClick={safePlayMeetingAssistantAudio}>
                        Play intro (audio)
                      </button>

                      {/* ✅ Voice Agent only */}
                      <button className="maa-btn" onClick={safeOpenVoice}>
                        Open Voice Agent
                      </button>
                    </div>

                    <div className="maa-feedback">
                      We appreciate your feedback — it helps us deliver a stronger next release.
                    </div>
                  </div>
                )}

                {activeSection === "faq" && (
                  <div className="maa-panel">
                    <details className="maa-details" open>
                      <summary className="maa-summary">Predefined questions</summary>
                      <div className="maa-questions">
                        {questions.map((q) => (
                          <button
                            key={q}
                            className="maa-q"
                            onClick={() => askViaVoiceAgentOnly(q)} // ✅ voice only, NO audio layer
                            title="Ask voice agent"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                {activeSection === "try" && (
                  <div className="maa-panel">
                    <div className="maa-inputrow">
                      <input
                        className="maa-input"
                        value={customQ}
                        onChange={(e) => setCustomQ(e.target.value)}
                        placeholder="Type your question… (press Enter)"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSendCustom();
                        }}
                      />
                      <button className="maa-send" onClick={onSendCustom}>
                        Ask
                      </button>
                    </div>

                    <div className="maa-actions">
                      <button
                        className="maa-btn"
                        onClick={() => askViaVoiceAgentOnly("How do I start using the AI Meeting Assistant today?")}
                      >
                        How to start
                      </button>
                      <button
                        className="maa-btn"
                        onClick={() => askViaVoiceAgentOnly("Where do I submit feedback and feature requests?")}
                      >
                        Give feedback
                      </button>
                    </div>

                    {/* ✅ Optional explicit audio action (still allowed) */}
                    <button className="maa-btn maa-audio" onClick={safePlayMeetingAssistantAudio}>
                      Learn more (audio)
                    </button>

                    <div className="maa-tip">
                      Tip: Ask about scheduling, transcription, minutes, action items, history, and best practices.
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Footer */}
              <motion.div className="maa-foot" variants={itemVariants}>
                <span className="maa-foot-left">AI Platform • DSAH</span>
                <button
                  className="maa-link"
                  onClick={() =>
                    askViaVoiceAgentOnly(
                      "Summarize the AI Meeting Assistant in 3 bullets and tell employees why they should use it."
                    )
                  }
                >
                  Ask for a quick summary
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
