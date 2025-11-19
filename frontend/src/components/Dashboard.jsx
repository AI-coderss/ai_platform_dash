import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import "../styles/Dashboard.css";

// 🔹 Web Vitals hook (can be swapped to an API later)
const useWebVitals = () => {
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    let cancelled = false;

    import("web-vitals")
      .then(({ getCLS, getFID, getLCP, getFCP, getTTFB }) => {
        const collect = (name, value) => {
          if (cancelled) return;
          setMetrics((prev) => [
            ...prev,
            { name, value: Number(value).toFixed(2) },
          ]);
        };

        getCLS((m) => collect("CLS", m.value));
        getFID((m) => collect("FID", m.value));
        getLCP((m) => collect("LCP", m.value));
        getFCP((m) => collect("FCP", m.value));
        getTTFB((m) => collect("TTFB", m.value));
      })
      .catch((err) => {
        console.warn("web-vitals import failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return metrics;
};

const Dashboard = () => {
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState("webvitals");
  const [usageData, setUsageData] = useState([]);
  const metrics = useWebVitals();

  // 🔹 Framer Motion drag constraints (same pattern as VoiceAssistant)
  const dragConstraintsRef = useRef(null);
  useEffect(() => {
    if (dragConstraintsRef.current == null) {
      dragConstraintsRef.current = document.body;
    }
  }, []);

  // 🔹 Listen to global event fired from VoiceAssistant tool call
  useEffect(() => {
    const toggleHandler = () => {
      setVisible((prev) => !prev);
    };
    window.addEventListener("dashboard:toggle", toggleHandler);
    return () => window.removeEventListener("dashboard:toggle", toggleHandler);
  }, []);

  // 🔹 Mock usage data – to be replaced with real analytics API later
  useEffect(() => {
    // TODO: Replace this with a real /api/usage or analytics backend call.
    const now = new Date();
    const dummy = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - i * 86400000);
      return {
        day: d.toLocaleDateString(),
        visits: Math.floor(Math.random() * 200) + 50,
      };
    }).reverse();
    setUsageData(dummy);
  }, []);

  // === Highcharts configs ===
  const vitalsChart = {
    chart: {
      type: "bar",
      backgroundColor: "transparent",
    },
    title: {
      text: "Web Vitals (Core Performance Metrics)",
      style: { color: "#ffffff" },
    },
    xAxis: {
      categories: metrics.map((m) => m.name),
      labels: { style: { color: "#ffffff" } },
    },
    yAxis: {
      title: { text: "Value" },
      labels: { style: { color: "#ffffff" } },
    },
    series: [
      {
        name: "Metric Value",
        data: metrics.map((m) => parseFloat(m.value)),
        color: "#00b7ff",
      },
    ],
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: {
      shared: true,
      valueDecimals: 2,
    },
  };

  const usageChart = {
    chart: {
      type: "line",
      backgroundColor: "transparent",
    },
    title: {
      text: "Platform Usage Statistics (Last 7 Days)",
      style: { color: "#ffffff" },
    },
    xAxis: {
      categories: usageData.map((d) => d.day),
      labels: { style: { color: "#ffffff" } },
    },
    yAxis: {
      title: { text: "Visits" },
      labels: { style: { color: "#ffffff" } },
    },
    series: [
      {
        name: "Daily Visits",
        data: usageData.map((d) => d.visits),
        color: "#ff6b00",
      },
    ],
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: {
      shared: true,
    },
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="dashboard-container glassmorphic"
          key="cortex-dashboard"
          drag
          dragConstraints={dragConstraintsRef}
          dragElastic={0.2}
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 40 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          style={{
            position: "fixed",
            top: 120,
            right: 80,
            zIndex: 1100,
          }}
        >
          <div className="dashboard-header">
            <h3>AI Platform Dashboard</h3>
            <button
              className="dashboard-close-btn"
              type="button"
              onClick={() => setVisible(false)}
            >
              ✖
            </button>
          </div>

          <div className="dashboard-tabs">
            <button
              className={tab === "webvitals" ? "active" : ""}
              type="button"
              onClick={() => setTab("webvitals")}
            >
              Web Vitals
            </button>
            <button
              className={tab === "usage" ? "active" : ""}
              type="button"
              onClick={() => setTab("usage")}
            >
              Platform Usage
            </button>
          </div>

          <div className="dashboard-content">
            {tab === "webvitals" && (
              <HighchartsReact highcharts={Highcharts} options={vitalsChart} />
            )}
            {tab === "usage" && (
              <HighchartsReact highcharts={Highcharts} options={usageChart} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Dashboard;

