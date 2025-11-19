/* eslint-disable react-hooks/exhaustive-deps */
// src/components/Dashboard.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import "../styles/Dashboard.css";

// === Web Vitals hook (can be swapped for API later) ===
const useWebVitals = () => {
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    let cancelled = false;

    import("web-vitals")
      .then(({ getCLS, getFID, getLCP, getFCP, getTTFB }) => {
        const collect = (name, value) => {
          if (cancelled) return;
          setMetrics((prev) => [...prev, { name, value: Number(value || 0) }]);
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

  // === Centered overlay & drag constraints ===
  const overlayRef = useRef(null);

  // Listen to voice assistant event
  useEffect(() => {
    const toggleHandler = () => setVisible((prev) => !prev);
    window.addEventListener("dashboard:toggle", toggleHandler);
    return () => window.removeEventListener("dashboard:toggle", toggleHandler);
  }, []);

  // Mock usage data – replace later with real analytics API
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

  // Aggregate vitals for KPIs & charts
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
      value: entry.count ? entry.total / entry.count : 0,
    }));
  }, [metrics]);

  const getVital = (name) =>
    aggregatedVitals.find((m) => m.name === name)?.value ?? null;

  // Usage aggregates
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
    return { total, avg, peak, peakDay };
  }, [usageData]);

  // --- KPI items for marquee ---
  const webVitalsKpis = useMemo(() => {
    const lcp = getVital("LCP");
    const fid = getVital("FID");
    const cls = getVital("CLS");
    const fcp = getVital("FCP");
    const ttfb = getVital("TTFB");

    return [
      {
        label: "Largest Contentful Paint",
        value: lcp != null ? `${lcp.toFixed(0)} ms` : "--",
        sub: "Target < 2500 ms",
      },
      {
        label: "First Input Delay",
        value: fid != null ? `${fid.toFixed(0)} ms` : "--",
        sub: "Target < 100 ms",
      },
      {
        label: "Cumulative Layout Shift",
        value: cls != null ? cls.toFixed(3) : "--",
        sub: "Target < 0.10",
      },
      {
        label: "First Contentful Paint",
        value: fcp != null ? `${fcp.toFixed(0)} ms` : "--",
        sub: "Perceived load speed",
      },
      {
        label: "Time to First Byte",
        value: ttfb != null ? `${ttfb.toFixed(0)} ms` : "--",
        sub: "Server responsiveness",
      },
    ];
  }, [aggregatedVitals]);

  const usageKpiItems = useMemo(() => {
    return [
      {
        label: "Total Visits (7 days)",
        value: usageKpis.total.toString(),
        sub: "All apps combined",
      },
      {
        label: "Avg Daily Visits",
        value: usageKpis.avg ? usageKpis.avg.toFixed(1) : "0.0",
        sub: "7-day average",
      },
      {
        label: "Peak Day Visits",
        value: usageKpis.peak.toString(),
        sub: usageKpis.peakDay,
      },
      {
        label: "Usage Trend",
        value:
          usageKpis.avg && usageKpis.peak
            ? usageKpis.peak > usageKpis.avg
              ? "Rising"
              : "Stable"
            : "--",
        sub: "vs 7-day average",
      },
      {
        label: "Min Daily Visits",
        value: usageData.length
          ? Math.min(...usageData.map((d) => d.visits)).toString()
          : "0",
        sub: "Lowest recorded",
      },
    ];
  }, [usageKpis, usageData]);

  const activeKpis = tab === "webvitals" ? webVitalsKpis : usageKpiItems;

  // --- Charts configs (Pie, Line, Column for each tab) ---

  // fallback vitals array if nothing yet
  const vitalNames = ["LCP", "FID", "FCP", "TTFB"];
  const vitalValues = vitalNames.map((name) => getVital(name) || 0);

  const vitalsPie = {
    chart: {
      type: "pie",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Web Vitals Composition",
      style: { color: "var(--dash-text-main)" },
    },
    series: [
      {
        name: "Value",
        innerSize: "50%",
        data: vitalNames.map((n, i) => ({
          name: n,
          y: vitalValues[i],
        })),
      },
    ],
    tooltip: {
      pointFormat: "<b>{point.y:.2f}</b>",
    },
    legend: { enabled: true },
    credits: { enabled: false },
  };

  const vitalsLine = {
    chart: {
      type: "line",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Stability & Interactivity",
      style: { color: "var(--dash-text-main)" },
    },
    xAxis: {
      categories: vitalNames,
      labels: { style: { color: "var(--dash-text-muted)" } },
    },
    yAxis: {
      title: { text: "Value", style: { color: "var(--dash-text-muted)" } },
      labels: { style: { color: "var(--dash-text-muted)" } },
      gridLineColor: "rgba(148,163,184,0.28)",
    },
    series: [
      {
        name: "Metric",
        data: vitalValues,
      },
    ],
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: { valueDecimals: 2 },
    plotOptions: {
      series: {
        animation: { duration: 800 },
        marker: { radius: 4 },
      },
    },
  };

  const vitalsColumn = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Core Web Vitals (Snapshot)",
      style: { color: "var(--dash-text-main)" },
    },
    xAxis: {
      categories: vitalNames,
      labels: { style: { color: "var(--dash-text-muted)" } },
    },
    yAxis: {
      title: { text: "Value", style: { color: "var(--dash-text-muted)" } },
      labels: { style: { color: "var(--dash-text-muted)" } },
      gridLineColor: "rgba(148,163,184,0.28)",
    },
    series: [
      {
        name: "Metric",
        data: vitalValues,
      },
    ],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        borderRadius: 3,
        dataLabels: {
          enabled: true,
          style: {
            color: "var(--dash-text-main)",
            textOutline: "none",
            fontSize: "10px",
          },
        },
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: { valueDecimals: 2 },
  };

  const usageLine = {
    chart: {
      type: "line",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Daily Visits (Last 7 Days)",
      style: { color: "var(--dash-text-main)" },
    },
    xAxis: {
      categories: usageData.map((d) => d.day),
      labels: { style: { color: "var(--dash-text-muted)" } },
    },
    yAxis: {
      title: { text: "Visits", style: { color: "var(--dash-text-muted)" } },
      labels: { style: { color: "var(--dash-text-muted)" } },
      gridLineColor: "rgba(148,163,184,0.28)",
    },
    series: [
      {
        name: "Visits",
        data: usageData.map((d) => d.visits),
      },
    ],
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: { shared: true },
    plotOptions: {
      series: {
        animation: { duration: 800 },
        marker: { radius: 4 },
      },
    },
  };

  const usageColumn = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "Visits Distribution",
      style: { color: "var(--dash-text-main)" },
    },
    xAxis: {
      categories: usageData.map((d) => d.day),
      labels: {
        style: { color: "var(--dash-text-muted)", fontSize: "10px" },
        rotation: -30,
      },
    },
    yAxis: {
      title: { text: "Visits", style: { color: "var(--dash-text-muted)" } },
      labels: { style: { color: "var(--dash-text-muted)" } },
      gridLineColor: "rgba(148,163,184,0.28)",
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
          style: {
            color: "var(--dash-text-main)",
            textOutline: "none",
            fontSize: "10px",
          },
        },
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: { shared: true },
  };

  const usagePie = {
    chart: {
      type: "pie",
      backgroundColor: "transparent",
      animation: true,
    },
    title: {
      text: "App Usage Split (Mock)",
      style: { color: "var(--dash-text-main)" },
    },
    series: [
      {
        name: "Visits",
        innerSize: "50%",
        data: [
          { name: "Doctor AI", y: Math.round(usageKpis.total * 0.35) },
          { name: "Transcription", y: Math.round(usageKpis.total * 0.25) },
          { name: "Reports", y: Math.round(usageKpis.total * 0.20) },
          { name: "IVF Assistant", y: Math.round(usageKpis.total * 0.12) },
          { name: "Other", y: Math.round(usageKpis.total * 0.08) },
        ],
      },
    ],
    tooltip: {
      pointFormat: "<b>{point.percentage:.1f}%</b>",
    },
    legend: { enabled: true },
    credits: { enabled: false },
  };

  return (
    <AnimatePresence>
      {visible && (
        <div className="dashboard-overlay" ref={overlayRef}>
          <motion.div
            key="cortex-dashboard"
            className="dashboard-shell"
            drag
            dragElastic={0.2}
            dragConstraints={overlayRef}
            initial={{ opacity: 0, scale: 0.96, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 40 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            {/* Header & Tabs */}
            <div className="dashboard-header">
              <div>
                <h3>AI Platform Performance Dashboard</h3>
                <p className="dashboard-subtitle">
                  Web quality & usage insights for Cortex AI applications
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

            {/* KPI Marquee */}
            <div className="dashboard-kpi-marquee">
              <div className="dashboard-kpi-track">
                {[...activeKpis, ...activeKpis].map((k, idx) => (
                  <div className="kpi-card" key={idx}>
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value">{k.value}</div>
                    <div className="kpi-sub">{k.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Charts grid: Pie / Line / Column */}
            <div className="dashboard-charts-grid">
              {tab === "webvitals" && (
                <>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsPie}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsLine}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsColumn}
                    />
                  </div>
                </>
              )}

              {tab === "usage" && (
                <>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usagePie}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usageLine}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usageColumn}
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Dashboard;



