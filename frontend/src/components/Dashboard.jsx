// src/components/Dashboard.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import "../styles/Dashboard.css";

// === Web Vitals hook (can be replaced with API later) ===
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
            { name, value: Number(value) },
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
  const [tab, setTab] = useState("webvitals"); // "webvitals" | "usage"
  const [usageData, setUsageData] = useState([]);
  const metrics = useWebVitals();

  // === Drag constraints (same pattern as VoiceAssistant) ===
  const dragConstraintsRef = useRef(null);
  useEffect(() => {
    if (dragConstraintsRef.current == null) {
      dragConstraintsRef.current = document.body;
    }
  }, []);

  // === Listen to global toggle event from VoiceAssistant ===
  useEffect(() => {
    const toggleHandler = () => setVisible((prev) => !prev);
    window.addEventListener("dashboard:toggle", toggleHandler);
    return () => window.removeEventListener("dashboard:toggle", toggleHandler);
  }, []);

  // === Mock usage data – replace with analytics API later ===
  useEffect(() => {
    const now = new Date();
    const dummy = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - i * 86400000);
      return {
        day: d.toLocaleDateString(),
        visits: Math.floor(Math.random() * 350) + 80,
      };
    }).reverse();
    setUsageData(dummy);
  }, []);

  // === Aggregate Web Vitals for KPI + charts ===
  const aggregatedVitals = useMemo(() => {
    if (!metrics.length) return [];
    const map = new Map();
    metrics.forEach(({ name, value }) => {
      if (!map.has(name)) {
        map.set(name, { name, total: 0, count: 0 });
      }
      const entry = map.get(name);
      entry.total += value;
      entry.count += 1;
    });
    return Array.from(map.values()).map((entry) => ({
      name: entry.name,
      value: entry.total / entry.count,
    }));
  }, [metrics]);

  const getVital = (name) =>
    aggregatedVitals.find((m) => m.name === name)?.value ?? null;

  // === Usage KPIs ===
  const usageKpis = useMemo(() => {
    if (!usageData.length) {
      return {
        total: 0,
        avg: 0,
        peak: 0,
        peakDay: "-",
      };
    }
    const total = usageData.reduce((s, d) => s + d.visits, 0);
    const avg = total / usageData.length;
    let peak = 0;
    let peakDay = "-";
    usageData.forEach((d) => {
      if (d.visits > peak) {
        peak = d.visits;
        peakDay = d.day;
      }
    });
    return {
      total,
      avg,
      peak,
      peakDay,
    };
  }, [usageData]);

  // === Highcharts configs (animated) ===

  const vitalsChartColumns = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Core Web Vitals Snapshot",
      style: { color: "#e5e7eb" },
    },
    xAxis: {
      categories: aggregatedVitals.map((m) => m.name),
      labels: { style: { color: "#9ca3af" } },
    },
    yAxis: {
      title: { text: "Value", style: { color: "#9ca3af" } },
      labels: { style: { color: "#9ca3af" } },
      gridLineColor: "rgba(148,163,184,0.25)",
    },
    series: [
      {
        name: "Metric Value",
        data: aggregatedVitals.map((m) =>
          m.name === "CLS" ? Number(m.value.toFixed(3)) : Number(m.value.toFixed(0))
        ),
      },
    ],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        borderRadius: 3,
        dataLabels: {
          enabled: true,
          style: { color: "#e5e7eb", textOutline: "none", fontSize: "10px" },
        },
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: {
      shared: true,
      valueDecimals: 2,
    },
  };

  const vitalsChartLine = {
    chart: {
      type: "line",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Stability vs. Interactivity",
      style: { color: "#e5e7eb" },
    },
    xAxis: {
      categories: ["CLS", "FID", "LCP", "TTFB"],
      labels: { style: { color: "#9ca3af" } },
    },
    yAxis: {
      title: { text: "Relative Value", style: { color: "#9ca3af" } },
      labels: { style: { color: "#9ca3af" } },
      gridLineColor: "rgba(148,163,184,0.25)",
    },
    series: [
      {
        name: "Value",
        data: [
          getVital("CLS") ?? 0,
          getVital("FID") ?? 0,
          getVital("LCP") ?? 0,
          getVital("TTFB") ?? 0,
        ].map((v) => Number(v.toFixed ? v.toFixed(2) : v)),
      },
    ],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        marker: { radius: 4 },
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: {
      shared: true,
      valueDecimals: 2,
    },
  };

  const usageChartLine = {
    chart: {
      type: "line",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Daily Visits (Last 7 Days)",
      style: { color: "#e5e7eb" },
    },
    xAxis: {
      categories: usageData.map((d) => d.day),
      labels: { style: { color: "#9ca3af" } },
    },
    yAxis: {
      title: { text: "Visits", style: { color: "#9ca3af" } },
      labels: { style: { color: "#9ca3af" } },
      gridLineColor: "rgba(148,163,184,0.25)",
    },
    series: [
      {
        name: "Visits",
        data: usageData.map((d) => d.visits),
      },
    ],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        marker: { radius: 4 },
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: {
      shared: true,
    },
  };

  const usageChartColumn = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Visits Distribution",
      style: { color: "#e5e7eb" },
    },
    xAxis: {
      categories: usageData.map((d) => d.day),
      labels: { style: { color: "#9ca3af" }, rotation: -30 },
    },
    yAxis: {
      title: { text: "Visits", style: { color: "#9ca3af" } },
      labels: { style: { color: "#9ca3af" } },
      gridLineColor: "rgba(148,163,184,0.25)",
    },
    series: [
      {
        name: "Visits",
        data: usageData.map((d) => d.visits),
      },
    ],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        borderRadius: 3,
        dataLabels: {
          enabled: true,
          style: { color: "#e5e7eb", textOutline: "none", fontSize: "10px" },
        },
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: {
      shared: true,
    },
  };

  // === KPI blocks for each tab ===
  const renderWebVitalsKpis = () => {
    const lcp = getVital("LCP");
    const fid = getVital("FID");
    const cls = getVital("CLS");
    const ttfb = getVital("TTFB");

    return (
      <div className="dashboard-kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Largest Contentful Paint</div>
          <div className="kpi-value">
            {lcp != null ? `${lcp.toFixed(0)} ms` : "--"}
          </div>
          <div className="kpi-sub">Target &lt; 2500 ms</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">First Input Delay</div>
          <div className="kpi-value">
            {fid != null ? `${fid.toFixed(0)} ms` : "--"}
          </div>
          <div className="kpi-sub">Target &lt; 100 ms</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cumulative Layout Shift</div>
          <div className="kpi-value">
            {cls != null ? cls.toFixed(3) : "--"}
          </div>
          <div className="kpi-sub">Target &lt; 0.10</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Time to First Byte</div>
          <div className="kpi-value">
            {ttfb != null ? `${ttfb.toFixed(0)} ms` : "--"}
          </div>
          <div className="kpi-sub">Server responsiveness</div>
        </div>
      </div>
    );
  };

  const renderUsageKpis = () => {
    return (
      <div className="dashboard-kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Visits (7 days)</div>
          <div className="kpi-value">{usageKpis.total}</div>
          <div className="kpi-sub">All apps combined</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg Daily Visits</div>
          <div className="kpi-value">
            {usageKpis.avg ? usageKpis.avg.toFixed(1) : "0"}
          </div>
          <div className="kpi-sub">Last 7 days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Peak Day Visits</div>
          <div className="kpi-value">{usageKpis.peak}</div>
          <div className="kpi-sub">{usageKpis.peakDay}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Usage Trend</div>
          <div className="kpi-value">
            {usageKpis.avg && usageKpis.peak
              ? usageKpis.peak > usageKpis.avg
                ? "Rising"
                : "Stable"
              : "--"}
          </div>
          <div className="kpi-sub">vs. 7-day average</div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="cortex-dashboard"
          className="dashboard-shell dashboard-frosted"
          drag
          dragElastic={0.2}
          dragConstraints={dragConstraintsRef}
          initial={{ opacity: 0, scale: 0.92, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 40 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1100,
          }}
        >
          <div className="dashboard-header">
            <div>
              <h3>AI Platform Performance Dashboard</h3>
              <p className="dashboard-subtitle">
                Real-time quality & usage overview for Cortex AI platform
              </p>
            </div>
            <button
              type="button"
              className="dashboard-close-btn"
              onClick={() => setVisible(false)}
            >
              ✖
            </button>
          </div>

          <div className="dashboard-tabs">
            <button
              type="button"
              className={tab === "webvitals" ? "active" : ""}
              onClick={() => setTab("webvitals")}
            >
              Web Vitals
            </button>
            <button
              type="button"
              className={tab === "usage" ? "active" : ""}
              onClick={() => setTab("usage")}
            >
              Platform Usage
            </button>
          </div>

          <div className="dashboard-main-grid">
            {/* KPI Row */}
            {tab === "webvitals" ? renderWebVitalsKpis() : renderUsageKpis()}

            {/* Charts Grid */}
            <div className="dashboard-charts-grid">
              {tab === "webvitals" && (
                <>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsChartColumns}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsChartLine}
                    />
                  </div>
                </>
              )}

              {tab === "usage" && (
                <>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usageChartLine}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usageChartColumn}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Dashboard;


