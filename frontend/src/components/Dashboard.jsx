/* eslint-disable react-hooks/exhaustive-deps */
// src/components/Dashboard.jsx
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

// Time ranges for Usage tab
const USAGE_RANGES = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 3 months", days: 90 },
  { key: "1y", label: "Last 12 months", days: 365 },
  { key: "2y", label: "Last 2 years", days: 730 },
];

const Dashboard = () => {
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState("webvitals"); // "webvitals" | "usage"

  const [usageData, setUsageData] = useState([]); // full 2-year mock series
  const [usageRange, setUsageRange] = useState("7d"); // one of USAGE_RANGES keys

  const metrics = useWebVitals();

  // === Centered overlay & drag constraints ===
  const overlayRef = useRef(null);

  // Listen to voice assistant event
  useEffect(() => {
    const toggleHandler = () => setVisible((prev) => !prev);
    window.addEventListener("dashboard:toggle", toggleHandler);
    return () => window.removeEventListener("dashboard:toggle", toggleHandler);
  }, []);

  // Mock usage data – 2 years of daily points (replace with real analytics later)
  useEffect(() => {
    const today = new Date();
    const days = 730; // ~2 years
    const series = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const age = days - 1 - i; // 0 = oldest, grows toward today

      const base = 120;
      const trendFactor = 0.8 + (age / (days - 1)) * 0.7; // 0.8 → 1.5
      const seasonal = 0.9 + 0.3 * Math.sin((2 * Math.PI * age) / 30); // monthly ripple
      const noise = 0.8 + Math.random() * 0.4; // 0.8–1.2

      const visits = Math.round(base * trendFactor * seasonal * noise);

      series.push({
        date: d,
        day: d.toLocaleDateString(),
        visits,
      });
    }

    setUsageData(series);
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

  // === Usage window based on selected range ===
  const usageWindow = useMemo(() => {
    if (!usageData.length) return [];
    const rangeCfg = USAGE_RANGES.find((r) => r.key === usageRange);
    const days = rangeCfg?.days || 30;
    const now = new Date();
    const cutoff = new Date(now.getTime() - (days - 1) * 86400000);
    return usageData.filter((d) => d.date >= cutoff);
  }, [usageData, usageRange]);

  const usageRangeLabel = useMemo(() => {
    const r = USAGE_RANGES.find((x) => x.key === usageRange);
    return r ? r.label : "Last 30 days";
  }, [usageRange]);

  // Usage aggregates for selected window
  const usageKpis = useMemo(() => {
    if (!usageWindow.length) {
      return {
        total: 0,
        avg: 0,
        peak: 0,
        peakDay: "-",
      };
    }
    const total = usageWindow.reduce((s, d) => s + d.visits, 0);
    const avg = total / usageWindow.length;
    let peak = 0;
    let peakDay = "-";
    usageWindow.forEach((d) => {
      if (d.visits > peak) {
        peak = d.visits;
        peakDay = d.day;
      }
    });
    return { total, avg, peak, peakDay };
  }, [usageWindow]);

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
        label: `Total Visits (${usageRangeLabel})`,
        value: usageKpis.total.toString(),
        sub: "All apps combined",
      },
      {
        label: "Avg Daily Visits",
        value: usageKpis.avg ? usageKpis.avg.toFixed(1) : "0.0",
        sub: usageRangeLabel,
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
        sub: "vs range average",
      },
      {
        label: "Min Daily Visits",
        value: usageWindow.length
          ? Math.min(...usageWindow.map((d) => d.visits)).toString()
          : "0",
        sub: "Lowest in range",
      },
    ];
  }, [usageKpis, usageWindow, usageRangeLabel]);

  const activeKpis = tab === "webvitals" ? webVitalsKpis : usageKpiItems;

  // --- Web Vitals charts configs (Pie, Line, Column) ---

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

  // === Usage charts (Usage tab) ===

  const usageCategories = usageWindow.map((d) => d.day);
  const usageDailyValues = usageWindow.map((d) => d.visits);
  let runningTotal = 0;
  const usageCumulativeValues = usageDailyValues.map((v) => {
    runningTotal += v;
    return runningTotal;
  });

  const usageArea = {
    chart: {
      type: "area",
      backgroundColor: "transparent",
      animation: true,
      spacingTop: 20,
      spacingRight: 10,
      spacingBottom: 5,
      spacingLeft: 5,
    },
    title: {
      text: `Usage Timeline (${usageRangeLabel})`,
      style: { color: "var(--dash-text-main)" },
    },
    xAxis: {
      categories: usageCategories,
      tickInterval: Math.max(1, Math.floor(usageCategories.length / 8)),
      labels: {
        style: { color: "var(--dash-text-muted)", fontSize: "10px" },
      },
    },
    yAxis: {
      title: {
        text: "Daily Visits",
        style: { color: "var(--dash-text-muted)" },
      },
      labels: { style: { color: "var(--dash-text-muted)" } },
      gridLineColor: "rgba(148,163,184,0.28)",
    },
    tooltip: {
      shared: true,
      valueDecimals: 0,
      headerFormat: "<span style='font-size:10px'>{point.key}</span><br/>",
      pointFormat:
        "<span style='color:{series.color}'>{series.name}</span>: <b>{point.y}</b><br/>",
    },
    legend: { enabled: true },
    credits: { enabled: false },
    plotOptions: {
      area: {
        fillOpacity: 0.35,
        marker: {
          radius: 3,
        },
        lineWidth: 2,
      },
      series: {
        animation: { duration: 800 },
      },
    },
    series: [
      {
        type: "area",
        name: "Daily Visits",
        data: usageDailyValues,
      },
      {
        type: "line",
        name: "Cumulative Visits",
        data: usageCumulativeValues,
      },
    ],
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
      categories: usageCategories,
      tickInterval: Math.max(1, Math.floor(usageCategories.length / 12)),
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
        data: usageDailyValues,
      },
    ],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        borderRadius: 3,
        dataLabels: {
          enabled: usageCategories.length <= 14, // avoid clutter for long ranges
          style: {
            color: "var(--dash-text-main)",
            textOutline: "none",
            fontSize: "9px",
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
          { name: "Reports", y: Math.round(usageKpis.total * 0.2) },
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

            {/* Usage time-range switcher (only on Usage tab) */}
            {tab === "usage" && (
              <div className="dashboard-range-switcher">
                {USAGE_RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={usageRange === r.key ? "active" : ""}
                    onClick={() => setUsageRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* Charts grid: Pie / Line / Column (or Area / Column on Usage) */}
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
                      options={usageArea}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usageColumn}
                    />
                  </div>
                  <div className="dashboard-chart-card">
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usagePie}
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




