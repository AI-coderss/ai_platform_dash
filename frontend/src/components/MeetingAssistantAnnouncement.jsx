/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/jsx-no-duplicate-props */
/* eslint-disable no-unused-vars */
// src/components/MeetingAssistantAnnouncement.jsx
/* eslint-disable react/jsx-no-duplicate-props */
/* eslint-disable no-unused-vars */
// src/components/MeetingAssistantAnnouncement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/MeetingAssistantAnnouncement.css";
import ChatInputWidget from "./ChatInputWidget";

/* ---------------- Launch typed messages ---------------- */
const LAUNCH_LINES = [
  "Launching AI Meeting Assistant…",
  "Internal release — the tool is live.",
  "Real-time transcription and structured minutes.",
  "Action items, owners, deadlines — automatically.",
  "Faster meetings. Clearer outcomes. Better follow-up.",
];

/* ---------------- Predefined Q groups ---------------- */
const FAQ_GROUPS = [
  {
    id: "basics",
    title: "Basics",
    items: ["What is the AI Meeting Assistant and who should use it?"],
  },
  {
    id: "schedule",
    title: "Scheduling & invitations",
    items: ["How do I schedule a meeting and invite attendees?"],
  },
  {
    id: "transcription",
    title: "Recording & transcription",
    items: ["Can it record and transcribe meetings automatically?"],
  },
  {
    id: "minutes",
    title: "Minutes & action items",
    items: [
      "How do I generate minutes, summaries, and action items?",
      "How can I share minutes and follow up on tasks?",
    ],
  },
  {
    id: "history",
    title: "History",
    items: ["Where can I see upcoming meetings and meeting history?"],
  },
];

/* ---------------- Voice Agent bridge (NO external audio) ---------------- */
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

  if (window.VoiceAssistantBridge?.ask) {
    try {
      await window.VoiceAssistantBridge.ask(q);
      return;
    } catch {}
  }

  try {
    window.dispatchEvent(
      new CustomEvent("voice:ask", {
        detail: { text: q, meta: { source: "dsah_announcements" } },
      })
    );
  } catch {}
};

/* ---------------- External highlight (no audio trigger) ---------------- */
const highlightMeetingAssistant = (on) => {
  try {
    window.dispatchEvent(
      new CustomEvent("card:highlight", {
        detail: { id: "meeting_assistant", active: !!on },
      })
    );
  } catch {}

  const selectors = [
    '[data-card-id="meeting_assistant"]',
    '[data-app-card="meeting_assistant"]',
    '[data-product="meeting_assistant"]',
    "#meeting_assistant",
    ".meeting-assistant-card",
    '[data-agent-id="products.launch:meeting"]',
    '[data-agent-id="products.help:meeting"]',
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

  if (on) el.classList.add("dsah-ext-highlight");
  else el.classList.remove("dsah-ext-highlight");
};

/* ---------------- Helpers ---------------- */
const TABS = [
  { key: "overview", icon: "📌", label: "Overview" },
  { key: "questions", icon: "❓", label: "Questions" },
  { key: "feedback", icon: "💬", label: "Feedback" },
];

function buildVoicePrompt(q) {
  return [
    "You are the AI Meeting Assistant support agent for Dr. Samir Abbas Hospital.",
    "Answer clearly and concisely for hospital employees.",
    "Do NOT trigger any UI actions or media.",
    "",
    `Question: ${q}`,
  ].join("\n");
}

function raf2(cb) {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`);

export default function MeetingAssistantAnnouncement() {
  const rootRef = useRef(null);

  // “CodePen-like” tab system refs
  const tabsWrapRef = useRef(null);
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const btnRefs = useRef({});
  const panelRefs = useRef({});

  // ✅ DEFAULT MINIMIZED
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(true);

  const [activeTab, setActiveTab] = useState("overview");
  const activeIdx = useMemo(
    () => TABS.findIndex((t) => t.key === activeTab),
    [activeTab]
  );

  // typed launch line
  const [typed, setTyped] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  // FAQ accordions + selection highlight
  const [openGroups, setOpenGroups] = useState(() => new Set(["basics"]));
  const groups = useMemo(() => FAQ_GROUPS, []);
  const [selectedQ, setSelectedQ] = useState("");

  // ChatInputWidget: free text only (only rendered on questions/feedback)
  const inputRef = useRef(null);
  const [inputText, setInputText] = useState("");

  const [isSwitching, setIsSwitching] = useState(false);

  /* ===========================
     ✅ Live Stream (Answer Transcript)
  ============================ */
  const streamRef = useRef(null);
  const streamArmedRef = useRef(false); // only capture deltas after we asked
  const streamingAssistantIdRef = useRef(null);

  const [streamMessages, setStreamMessages] = useState(() => []);
  const [streamState, setStreamState] = useState("idle"); // idle | streaming | done

  const limitStream = (arr) => (arr.length > 20 ? arr.slice(arr.length - 20) : arr);

  const ensureScrollBottom = () => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const startNewStreamTurn = (questionText) => {
    const q = String(questionText || "").trim();
    if (!q) return;

    const userId = uid();
    const assistantId = uid();
    streamingAssistantIdRef.current = assistantId;
    streamArmedRef.current = true;
    setStreamState("streaming");

    setStreamMessages((prev) =>
      limitStream([
        ...prev,
        { id: userId, role: "user", text: q, ts: Date.now() },
        { id: assistantId, role: "assistant", text: "", ts: Date.now() },
      ])
    );

    setTimeout(ensureScrollBottom, 0);
  };

  const appendAssistantDelta = (delta) => {
    const d = String(delta || "");
    if (!d) return;

    setStreamMessages((prev) => {
      const aId = streamingAssistantIdRef.current;

      // If we somehow missed creating the assistant placeholder, create it.
      let next = [...prev];
      const idx = aId ? next.findIndex((m) => m.id === aId) : -1;

      if (idx === -1) {
        const fallbackId = aId || uid();
        streamingAssistantIdRef.current = fallbackId;
        next = limitStream([
          ...next,
          { id: fallbackId, role: "assistant", text: d, ts: Date.now() },
        ]);
      } else {
        next[idx] = { ...next[idx], text: (next[idx].text || "") + d };
      }

      return next;
    });

    setTimeout(ensureScrollBottom, 0);
  };

  const finishAssistantStream = () => {
    streamArmedRef.current = false;
    setStreamState("done");
    setTimeout(ensureScrollBottom, 0);
  };

  // Listen to VoiceAssistant streamed events
  useEffect(() => {
    const onDelta = (e) => {
      if (!open || minimized) return;
      if (!streamArmedRef.current) return; // only when we asked from this UI
      const delta = e?.detail?.delta ?? "";
      appendAssistantDelta(delta);
    };

    const onDone = (e) => {
      if (!open || minimized) return;
      if (!streamArmedRef.current) return;
      finishAssistantStream();
    };

    window.addEventListener("assistant:response.delta", onDelta);
    window.addEventListener("assistant:response.done", onDone);

    return () => {
      window.removeEventListener("assistant:response.delta", onDelta);
      window.removeEventListener("assistant:response.done", onDone);
    };
  }, [open, minimized]);

  /* ---------------- Highlight external card while visible ---------------- */
  useEffect(() => {
    if (!open) return;
    highlightMeetingAssistant(!minimized);
    return () => highlightMeetingAssistant(false);
  }, [open, minimized]);

  /* ---------------- Typed “launch” line ---------------- */
  useEffect(() => {
    if (!open || minimized) return;

    const current = LAUNCH_LINES[msgIdx];
    const typingSpeed = deleting ? 18 : 34;
    const pauseAtEnd = 950;

    const t = setTimeout(() => {
      if (!deleting) {
        const next = charIdx + 1;
        setTyped(current.slice(0, next));
        setCharIdx(next);
        if (next >= current.length) setTimeout(() => setDeleting(true), pauseAtEnd);
      } else {
        const next = charIdx - 1;
        setTyped(current.slice(0, Math.max(0, next)));
        setCharIdx(next);
        if (next <= 0) {
          setDeleting(false);
          setMsgIdx((i) => (i + 1) % LAUNCH_LINES.length);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(t);
  }, [open, minimized, msgIdx, charIdx, deleting]);

  /* ---------------- Indicator math ---------------- */
  const updateIndicator = (idx, { pulse = true } = {}) => {
    const nav = navRef.current;
    const ind = indicatorRef.current;
    const btn = btnRefs.current[TABS[idx]?.key];

    if (!nav || !ind || !btn) return;

    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    const left = btnRect.left - navRect.left;
    const width = btnRect.width;

    ind.style.transform = `translateX(${left}px)`;
    ind.style.width = `${width}px`;

    if (pulse) {
      ind.classList.remove("dsah-ind-pulse");
      void ind.offsetWidth;
      ind.classList.add("dsah-ind-pulse");
      setTimeout(() => ind.classList.remove("dsah-ind-pulse"), 220);
    }
  };

  useEffect(() => {
    raf2(() => updateIndicator(activeIdx, { pulse: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    raf2(() => updateIndicator(activeIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => updateIndicator(activeIdx, { pulse: false }), 180);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  /* ---------------- Tab switching animation ---------------- */
  const animatePanelItems = (tabKey) => {
    const panel = panelRefs.current[tabKey];
    if (!panel) return;

    const items = panel.querySelectorAll(
      ".dsah-feature, .dsah-step, .dsah-faq-btn, .dsah-feedback-row, .dsah-stream"
    );

    items.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(22px)";
      setTimeout(() => {
        el.style.transition = "all 0.55s cubic-bezier(0.4, 0, 0.2, 1)";
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, i * 85 + 120);
    });
  };

  const switchTab = (nextKey) => {
    if (nextKey === activeTab) return;
    if (isSwitching) return;

    const wrapper = tabsWrapRef.current;
    if (wrapper) wrapper.classList.add("dsah-switching");
    setIsSwitching(true);

    const prevKey = activeTab;
    const prevPanel = panelRefs.current[prevKey];
    const nextPanel = panelRefs.current[nextKey];

    if (prevPanel) {
      prevPanel.style.transform = "translateX(-46px)";
      prevPanel.style.opacity = "0";
    }

    setTimeout(() => {
      setActiveTab(nextKey);

      if (nextPanel) {
        nextPanel.style.transform = "translateX(46px)";
        nextPanel.style.opacity = "0";
        raf2(() => {
          nextPanel.style.transform = "translateX(0)";
          nextPanel.style.opacity = "1";
        });
      }

      setTimeout(() => animatePanelItems(nextKey), 70);

      setTimeout(() => {
        if (wrapper) wrapper.classList.remove("dsah-switching");
        setIsSwitching(false);
      }, 420);
    }, 200);
  };

  /* ---------------- Ripple effect ---------------- */
  const createRipple = (e) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement("span");
    ripple.className = "dsah-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  };

  /* ---------------- Keyboard nav ---------------- */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!open || minimized) return;

      const root = rootRef.current;
      const activeEl = document.activeElement;
      if (!root || (activeEl && !root.contains(activeEl))) return;

      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      const next = (activeIdx + dir + TABS.length) % TABS.length;
      switchTab(TABS[next].key);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, minimized, activeIdx, activeTab, isSwitching]);

  /* ---------------- Predefined question: highlight + ask instantly ---------------- */
  const askPredefinedInstant = async (q) => {
    const text = String(q || "").trim();
    if (!text) return;

    setSelectedQ(text);

    // ✅ start the live transcript turn in the UI
    startNewStreamTurn(text);

    safeOpenVoice();
    await safeAskVoice(buildVoicePrompt(text));
  };

  /* ---------------- Free text send (ChatInputWidget) ---------------- */
  const handleSendMessage = async (payload) => {
    const text = typeof payload === "string" ? payload : payload?.text ?? inputText;
    const q = String(text || "").trim();
    if (!q) return;

    setInputText("");

    // ✅ start the live transcript turn in the UI
    startNewStreamTurn(q);

    safeOpenVoice();
    await safeAskVoice(buildVoicePrompt(q));
  };

  const toggleGroup = (id) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const close = () => {
    setOpen(false);
    setMinimized(false);
    highlightMeetingAssistant(false);
  };

  const minimize = () => setMinimized(true);

  const restore = () => {
    setOpen(true);
    setMinimized(false);

    // refresh indicator + animate items once visible
    setTimeout(() => {
      updateIndicator(activeIdx, { pulse: false });
      animatePanelItems(activeTab);
    }, 60);
  };

  /* ---------------- Staggered build-in animation (ELEMENT BY ELEMENT) ---------------- */
  const buildContainer = {
    hidden: { opacity: 0, y: -22, scale: 0.988, filter: "blur(10px)" },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        duration: 0.85,
        ease: [0.16, 1, 0.3, 1],
        delayChildren: 0.1,
        staggerChildren: 0.11,
      },
    },
    exit: { opacity: 0, y: -10, scale: 0.985, transition: { duration: 0.2 } },
  };

  const buildItem = {
    hidden: { opacity: 0, y: 18, scale: 0.998 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
  };

  if (!open) return null;

  const showChatDock = activeTab === "questions" || activeTab === "feedback";
  const chatLabel = activeTab === "feedback" ? "Send feedback (text):" : "Ask freely (text):";

  return (
    <>
      <AnimatePresence>
        {minimized && (
          <motion.button
            className="dsah-mini"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            onClick={restore}
            title="Open announcements"
          >
            <span className="dsah-mini-dot" />
            <span className="dsah-mini-title">Announcements</span>
            <span className="dsah-mini-cta">Open</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!minimized && (
          <motion.div
            ref={rootRef}
            className="dsah-ann-card dsah-breath"
            variants={buildContainer}
            initial="hidden"
            animate="show"
            exit="exit"
            role="dialog"
            aria-label="Dr. Samir Abbas Hospital announcements"
            tabIndex={-1}
          >
            {/* Local background orbs */}
            <div className="dsah-orbs" aria-hidden="true">
              <div className="dsah-orb dsah-orb-1" />
              <div className="dsah-orb dsah-orb-2" />
              <div className="dsah-orb dsah-orb-3" />
              <div className="dsah-orb dsah-orb-4" />
            </div>

            {/* Header */}
            <motion.div className="dsah-head" variants={buildItem}>
              <div className="dsah-head-left">
                <div className="dsah-title">Dr. Samir Abbas Hospital Announcements</div>
                <div className="dsah-subtitle">Internal release</div>
              </div>

              <div className="dsah-head-actions">
                <button className="dsah-icon" onClick={minimize} type="button" aria-label="Minimize">
                  —
                </button>
                <button className="dsah-icon dsah-danger" onClick={close} type="button" aria-label="Close">
                  ✕
                </button>
              </div>
            </motion.div>

            {/* Launch line */}
            <motion.div className="dsah-launch" variants={buildItem}>
              <div className="dsah-launch-label">Launch</div>
              <div className="dsah-launch-line">
                <span className="dsah-launch-text">{typed}</span>
                <span className="dsah-caret" />
              </div>
            </motion.div>

            {/* ✅ Live Stream Panel (always visible) */}
            <motion.div className="dsah-stream" variants={buildItem}>
              <div className="dsah-stream-top">
                <div className="dsah-stream-title">Live Stream</div>
                <div className={`dsah-stream-pill is-${streamState}`}>
                  {streamState === "streaming" ? "Streaming" : streamState === "done" ? "Done" : "Idle"}
                </div>
              </div>

              <div ref={streamRef} className="dsah-stream-body" aria-label="Live transcript">
                {streamMessages.length === 0 ? (
                  <div className="dsah-stream-empty">
                    Select a question (or type one) and the AI answer will stream here in real time.
                  </div>
                ) : (
                  streamMessages.map((m) => (
                    <div key={m.id} className={`dsah-stream-msg is-${m.role}`}>
                      <div className="dsah-stream-role">{m.role === "user" ? "You" : "AI"}</div>
                      <div className="dsah-stream-text">{m.text || (m.role === "assistant" ? "…" : "")}</div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>

            {/* Tabs */}
            <motion.div ref={tabsWrapRef} className="dsah-tabs-shell" variants={buildItem}>
              <h2 className="dsah-tabs-heading">AI Meeting Assistant</h2>

              {/* Tab Navigation */}
              <div ref={navRef} className="dsah-tab-nav" role="tablist" aria-label="Announcement tabs">
                {TABS.map((t) => {
                  const isActive = t.key === activeTab;
                  return (
                    <button
                      key={t.key}
                      ref={(el) => (btnRefs.current[t.key] = el)}
                      className={`dsah-tab-btn ${isActive ? "is-active" : ""}`}
                      role="tab"
                      aria-selected={isActive}
                      type="button"
                      onClick={(e) => {
                        createRipple(e);
                        switchTab(t.key);
                      }}
                    >
                      <span className="dsah-tab-ico">{t.icon}</span>
                      <span className="dsah-tab-lbl">{t.label}</span>
                    </button>
                  );
                })}

                <div ref={indicatorRef} className="dsah-tab-ind" aria-hidden="true" />
              </div>

              {/* Tab Content */}
              <div className="dsah-panels" role="region" aria-label="Tab content">
                {/* OVERVIEW */}
                <div
                  ref={(el) => (panelRefs.current.overview = el)}
                  className={`dsah-panel ${activeTab === "overview" ? "is-active" : ""}`}
                  role="tabpanel"
                >
                  <div className="dsah-card">
                    <h3 className="dsah-card-h">Overview</h3>

                    <p className="dsah-card-p">
                      The AI Meeting Assistant is an internal hospital tool designed to improve how meetings are planned,
                      executed, and documented. It reduces time wasted on coordination, prevents missed decisions, and
                      ensures every meeting ends with clear outcomes.
                    </p>

                    <div className="dsah-section">
                      <div className="dsah-section-h">What it does</div>

                      <div className="dsah-feature-grid">
                        <div className="dsah-feature">
                          <div className="dsah-feature-ico">🗓️</div>
                          <div className="dsah-feature-h">Scheduling</div>
                          <div className="dsah-feature-p">Create meetings, invite attendees, and manage agenda.</div>
                        </div>

                        <div className="dsah-feature">
                          <div className="dsah-feature-ico">🎙️</div>
                          <div className="dsah-feature-h">Transcription</div>
                          <div className="dsah-feature-p">Capture discussions in real time with structured transcript.</div>
                        </div>

                        <div className="dsah-feature">
                          <div className="dsah-feature-ico">🧾</div>
                          <div className="dsah-feature-h">Minutes</div>
                          <div className="dsah-feature-p">Generate minutes, summaries, and key decisions instantly.</div>
                        </div>

                        <div className="dsah-feature">
                          <div className="dsah-feature-ico">✅</div>
                          <div className="dsah-feature-h">Action Items</div>
                          <div className="dsah-feature-p">Extract tasks, owners, and deadlines for follow-up.</div>
                        </div>
                      </div>
                    </div>

                    <div className="dsah-section">
                      <div className="dsah-section-h">Where it helps most</div>
                      <div className="dsah-bullets">
                        <div className="dsah-bullet dsah-feature">
                          <span className="dsah-bullet-dot" />
                          Committees, leadership meetings, and cross-department coordination
                        </div>
                        <div className="dsah-bullet dsah-feature">
                          <span className="dsah-bullet-dot" />
                          Operations meetings (handover, quality, patient flow, capacity planning)
                        </div>
                        <div className="dsah-bullet dsah-feature">
                          <span className="dsah-bullet-dot" />
                          Vendor demos and project discussions (requirements, risks, timelines)
                        </div>
                        <div className="dsah-bullet dsah-feature">
                          <span className="dsah-bullet-dot" />
                          Post-meeting follow-up to reduce missed tasks and unclear ownership
                        </div>
                      </div>
                    </div>

                    <div className="dsah-note">
                      Go to the <b>Questions</b> tab to select predefined questions instantly. The response will stream in
                      the <b>Live Stream</b> panel above.
                    </div>
                  </div>
                </div>

                {/* QUESTIONS */}
                <div
                  ref={(el) => (panelRefs.current.questions = el)}
                  className={`dsah-panel ${activeTab === "questions" ? "is-active" : ""}`}
                  role="tabpanel"
                >
                  <div className="dsah-card">
                    <h3 className="dsah-card-h">How to use</h3>
                    <p className="dsah-card-p">
                      Select a predefined question to ask instantly. The selected question will highlight and the assistant
                      will answer immediately. You can also type your own question below.
                    </p>

                    <div className="dsah-faq">
                      {groups.map((g) => {
                        const isOpen = openGroups.has(g.id);
                        return (
                          <div key={g.id} className="dsah-faq-group">
                            <button
                              type="button"
                              className={`dsah-faq-head ${isOpen ? "is-open" : ""}`}
                              onClick={() => toggleGroup(g.id)}
                            >
                              <span className="dsah-faq-title">{g.title}</span>
                              <span className={`dsah-faq-plus ${isOpen ? "is-open" : ""}`} aria-hidden="true" />
                            </button>

                            <div className={`dsah-faq-body ${isOpen ? "is-open" : ""}`}>
                              <div className="dsah-faq-list">
                                {g.items.map((q) => {
                                  const active = selectedQ === q;
                                  return (
                                    <button
                                      key={q}
                                      type="button"
                                      className={`dsah-faq-btn ${active ? "is-selected" : ""}`}
                                      onClick={() => askPredefinedInstant(q)}
                                    >
                                      <span className="dsah-faq-q">{q}</span>
                                      {active && <span className="dsah-faq-tag">Selected</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* FEEDBACK */}
                <div
                  ref={(el) => (panelRefs.current.feedback = el)}
                  className={`dsah-panel ${activeTab === "feedback" ? "is-active" : ""}`}
                  role="tabpanel"
                >
                  <div className="dsah-card">
                    <h3 className="dsah-card-h">Feedback</h3>
                    <p className="dsah-card-p">
                      Share bugs, missing workflows, and feature requests. Add context (who is impacted, when it happens,
                      and expected vs actual). You can send feedback using the text input below.
                    </p>

                    <div className="dsah-feedback">
                      <div className="dsah-feedback-row">
                        <div className="dsah-feedback-ico">🧩</div>
                        <div className="dsah-feedback-body">
                          <div className="dsah-feedback-h">Feature request</div>
                          <div className="dsah-feedback-p">
                            Describe the workflow and benefit (time saved, quality, compliance).
                          </div>
                        </div>
                      </div>

                      <div className="dsah-feedback-row">
                        <div className="dsah-feedback-ico">🐞</div>
                        <div className="dsah-feedback-body">
                          <div className="dsah-feedback-h">Bug report</div>
                          <div className="dsah-feedback-p">
                            Steps to reproduce + expected vs actual result + screenshot if possible.
                          </div>
                        </div>
                      </div>

                      <div className="dsah-feedback-row">
                        <div className="dsah-feedback-ico">⭐</div>
                        <div className="dsah-feedback-body">
                          <div className="dsah-feedback-h">Quality improvement</div>
                          <div className="dsah-feedback-p">
                            Suggest better minutes format, wording, or action tracking improvements.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="dsah-note">
                      Tip: Start your message with <b>Feedback:</b> so it’s easy to route internally.
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ✅ Chat input dock ONLY on Questions + Feedback */}
            <AnimatePresence>
              {showChatDock && (
                <motion.div
                  className="dsah-chatdock"
                  variants={buildItem}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}
                >
                  <div className="dsah-chatlabel">{chatLabel}</div>
                  <div className="dsah-chatbox">
                    <ChatInputWidget
                      ref={inputRef}
                      onSendMessage={handleSendMessage}
                      inputText={inputText}
                      setInputText={setInputText}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
