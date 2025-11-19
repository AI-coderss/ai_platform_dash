/* eslint-disable react-hooks/exhaustive-deps */
// src/components/Dashboard.jsx
// src/components/Dashboard.jsx
// src/components/Dashboard.jsx
// src/components/Dashboard.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import "../styles/Dashboard.css";

/* =====================================================================================
   Real Web Vitals hook using the official `web-vitals` library.
===================================================================================== */
const useWebVitals = () => {
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    let cancelled = false;

    if (typeof window === "undefined") return;

    import("web-vitals")
      .then(({ getCLS, getFID, getLCP, getFCP, getTTFB }) => {
        const handler = (metric) => {
          if (cancelled) return;
          setMetrics((prev) => [...prev, metric]);
        };

        getCLS(handler);
        getFID(handler);
        getLCP(handler);
        getFCP(handler);
        getTTFB(handler);
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

/* =====================================================================================
   Usage ranges (mock data for now)
===================================================================================== */
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
  const [usageData, setUsageData] = useState([]);
  const [usageRange, setUsageRange] = useState("7d");

  // Real web vitals
  const metrics = useWebVitals();

  // For Framer Motion draggable bounds
  const overlayRef = useRef(null);

  // For chart expansion modal
  const [expandedChart, setExpandedChart] = useState(null);

  /* -----------------------------------------------------------------------------
     Listen to global event from Voice Assistant: window.dispatchEvent("dashboard:toggle")
  ----------------------------------------------------------------------------- */
  useEffect(() => {
    const toggleHandler = () => setVisible((prev) => !prev);
    window.addEventListener("dashboard:toggle", toggleHandler);
    return () => window.removeEventListener("dashboard:toggle", toggleHandler);
  }, []);

  /* -----------------------------------------------------------------------------
     Mock usage data generator (will be replaced by real API later)
  ----------------------------------------------------------------------------- */
  useEffect(() => {
    const today = new Date();
    const days = 730; // ~2 years
    const series = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const age = days - 1 - i;

      const base = 120;
      const trendFactor = 0.8 + (age / (days - 1)) * 0.7; // 0.8 → 1.5
      const seasonal = 0.9 + 0.3 * Math.sin((2 * Math.PI * age) / 30);
      const noise = 0.8 + Math.random() * 0.4;

      const visits = Math.round(base * trendFactor * seasonal * noise);

      series.push({
        date: d,
        day: d.toLocaleDateString(),
        visits,
      });
    }

    setUsageData(series);
  }, []);

  /* -----------------------------------------------------------------------------
     Aggregate Web Vitals metrics (real values from web-vitals)
  ----------------------------------------------------------------------------- */
  const aggregatedVitals = useMemo(() => {
    if (!metrics.length) return [];

    const byName = new Map();
    metrics.forEach((m) => {
      const name = m.name;
      const value = Number(m.value || 0);
      if (!byName.has(name)) {
        byName.set(name, { name, total: 0, count: 0 });
      }
      const entry = byName.get(name);
      entry.total += value;
      entry.count += 1;
    });

    return Array.from(byName.values()).map((entry) => ({
      name: entry.name,
      value: entry.count ? entry.total / entry.count : 0,
    }));
  }, [metrics]);

  const getVital = (name) =>
    aggregatedVitals.find((m) => m.name === name)?.value ?? null;

  /* -----------------------------------------------------------------------------
     Usage window & KPIs (still mock, based on usageData)
  ----------------------------------------------------------------------------- */
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

  /* -----------------------------------------------------------------------------
     KPI cards with targets and warning system (for Web Vitals)
  ----------------------------------------------------------------------------- */
  const makeVitalKpi = (cfg, actual) => {
    let valueText = "--";
    if (actual != null) {
      valueText =
        cfg.unit === "ms" ? `${actual.toFixed(0)} ms` : actual.toFixed(3);
    }

    const targetText =
      cfg.unit === "ms"
        ? `Target < ${cfg.target} ms`
        : `Target < ${cfg.target}`;

    let statusLabel = "No data yet";
    let statusLevel = "unknown";

    if (actual != null) {
      if (cfg.direction === "lower") {
        if (actual <= cfg.target) {
          statusLabel = "On target (good)";
          statusLevel = "good";
        } else {
          statusLabel = "Above target (needs attention)";
          statusLevel = "bad";
        }
      } else {
        if (actual >= cfg.target) {
          statusLabel = "On target (good)";
          statusLevel = "good";
        } else {
          statusLabel = "Below target (needs attention)";
          statusLevel = "bad";
        }
      }
    }

    return {
      label: cfg.label,
      value: valueText,
      sub: cfg.sub,
      targetText,
      statusLabel,
      statusLevel,
    };
  };

  const lcp = getVital("LCP");
  const fid = getVital("FID");
  const cls = getVital("CLS");
  const fcp = getVital("FCP");
  const ttfb = getVital("TTFB");

  const webVitalsKpis = useMemo(
    () => [
      makeVitalKpi(
        {
          label: "Largest Contentful Paint",
          target: 2500,
          unit: "ms",
          direction: "lower",
          sub: "Desirable < 2500 ms",
        },
        lcp
      ),
      makeVitalKpi(
        {
          label: "First Input Delay",
          target: 100,
          unit: "ms",
          direction: "lower",
          sub: "Desirable < 100 ms",
        },
        fid
      ),
      makeVitalKpi(
        {
          label: "Cumulative Layout Shift",
          target: 0.1,
          unit: "ratio",
          direction: "lower",
          sub: "Desirable < 0.10",
        },
        cls
      ),
      makeVitalKpi(
        {
          label: "First Contentful Paint",
          target: 1800,
          unit: "ms",
          direction: "lower",
          sub: "Perceived load speed",
        },
        fcp
      ),
      makeVitalKpi(
        {
          label: "Time to First Byte",
          target: 800,
          unit: "ms",
          direction: "lower",
          sub: "Server responsiveness",
        },
        ttfb
      ),
    ],
    [lcp, fid, cls, fcp, ttfb]
  );

  const usageKpiItems = useMemo(
    () => [
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
    ],
    [usageKpis, usageWindow, usageRangeLabel]
  );

  const activeKpis = tab === "webvitals" ? webVitalsKpis : usageKpiItems;

  /* -----------------------------------------------------------------------------
     Chart configs – Web Vitals (real) + Usage (mock)
  ----------------------------------------------------------------------------- */
  const vitalNames = ["LCP", "FID", "FCP", "TTFB"];
  const vitalValues = vitalNames.map((name) => getVital(name) || 0);

  const vitalsPie = {
    chart: {
      type: "pie",
      backgroundColor: "transparent",
      animation: true,
    },
    title: { text: "Web Vitals Composition" },
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
    title: { text: "Stability & Interactivity Snapshot" },
    xAxis: {
      categories: vitalNames,
    },
    yAxis: {
      title: { text: "Value" },
      gridLineColor: "rgba(148,163,184,0.28)",
    },
    series: [{ name: "Metric", data: vitalValues }],
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
    title: { text: "Core Web Vitals (Real-Time)" },
    xAxis: {
      categories: vitalNames,
    },
    yAxis: {
      title: { text: "Value" },
      gridLineColor: "rgba(148,163,184,0.28)",
    },
    series: [{ name: "Metric", data: vitalValues }],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        borderRadius: 3,
        dataLabels: {
          enabled: true,
          style: { textOutline: "none", fontSize: "10px" },
        },
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    tooltip: { valueDecimals: 2 },
  };

  // Usage charts (still mock)
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
    title: { text: `Usage Timeline (${usageRangeLabel})` },
    xAxis: {
      categories: usageCategories,
      tickInterval: Math.max(1, Math.floor(usageCategories.length / 8)),
    },
    yAxis: {
      title: { text: "Daily Visits" },
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
        marker: { radius: 3 },
        lineWidth: 2,
      },
      series: {
        animation: { duration: 800 },
      },
    },
    series: [
      { type: "area", name: "Daily Visits", data: usageDailyValues },
      { type: "line", name: "Cumulative Visits", data: usageCumulativeValues },
    ],
  };

  const usageColumn = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      animation: true,
    },
    title: { text: "Visits Distribution" },
    xAxis: {
      categories: usageCategories,
      tickInterval: Math.max(1, Math.floor(usageCategories.length / 12)),
      labels: { rotation: -30 },
    },
    yAxis: {
      title: { text: "Visits" },
      gridLineColor: "rgba(148,163,184,0.28)",
    },
    series: [{ name: "Visits", data: usageDailyValues }],
    plotOptions: {
      series: {
        animation: { duration: 800 },
        borderRadius: 3,
        dataLabels: {
          enabled: usageCategories.length <= 14,
          style: { textOutline: "none", fontSize: "9px" },
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
    title: { text: "App Usage Split (Mock)" },
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
    tooltip: { pointFormat: "<b>{point.percentage:.1f}%</b>" },
    legend: { enabled: true },
    credits: { enabled: false },
  };

  /* -----------------------------------------------------------------------------
     Handlers for chart expansion (click any chart → full view popout)
     We keep chart options the same, but when we render in the modal:
     - we disable animation
     - we lock chart to the modal body size (CSS) so it doesn't "grow crazy".
  ----------------------------------------------------------------------------- */
  const handleExpandChart = (title, options) => {
    setExpandedChart({
      title: title || options?.title?.text || "Chart",
      options,
    });
  };

  const closeExpandedChart = () => setExpandedChart(null);

  // Build expanded options with animation off (stability) – dimensions unchanged.
  const getExpandedOptions = (opts) => {
    if (!opts) return {};
    return {
      ...opts,
      chart: {
        ...(opts.chart || {}),
        animation: false,
        backgroundColor: "transparent",
      },
    };
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
            {/* Header & tabs */}
            <div className="dashboard-header">
              <div>
                <h3>AI Platform Performance Dashboard</h3>
                <p className="dashboard-subtitle">
                  Real Web Vitals & platform usage insights for Cortex AI
                  applications
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

            {/* KPI marquee with targets + status */}
            <div className="dashboard-kpi-marquee">
              <div className="dashboard-kpi-track">
                {[...activeKpis, ...activeKpis].map((k, idx) => (
                  <div className="kpi-card" key={idx}>
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value">{k.value}</div>
                    <div className="kpi-sub">{k.sub}</div>

                    {k.targetText && (
                      <div className="kpi-target">{k.targetText}</div>
                    )}
                    {k.statusLabel && (
                      <div
                        className={`kpi-status ${
                          k.statusLevel ? k.statusLevel : ""
                        }`}
                      >
                        {k.statusLabel}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Range switcher – Usage tab */}
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

            {/* Charts grid (click to expand) */}
            <div className="dashboard-charts-grid">
              {tab === "webvitals" && (
                <>
                  <div
                    className="dashboard-chart-card"
                    onClick={() =>
                      handleExpandChart("Web Vitals Composition", vitalsPie)
                    }
                  >
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsPie}
                      immutable={true}
                    />
                  </div>
                  <div
                    className="dashboard-chart-card"
                    onClick={() =>
                      handleExpandChart(
                        "Stability & Interactivity Snapshot",
                        vitalsLine
                      )
                    }
                  >
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsLine}
                      immutable={true}
                    />
                  </div>
                  <div
                    className="dashboard-chart-card"
                    onClick={() =>
                      handleExpandChart(
                        "Core Web Vitals (Real-Time)",
                        vitalsColumn
                      )
                    }
                  >
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={vitalsColumn}
                      immutable={true}
                    />
                  </div>
                </>
              )}

              {tab === "usage" && (
                <>
                  <div
                    className="dashboard-chart-card"
                    onClick={() =>
                      handleExpandChart(
                        `Usage Timeline (${usageRangeLabel})`,
                        usageArea
                      )
                    }
                  >
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usageArea}
                      immutable={true}
                    />
                  </div>
                  <div
                    className="dashboard-chart-card"
                    onClick={() =>
                      handleExpandChart("Visits Distribution", usageColumn)
                    }
                  >
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usageColumn}
                      immutable={true}
                    />
                  </div>
                  <div
                    className="dashboard-chart-card"
                    onClick={() =>
                      handleExpandChart("App Usage Split", usagePie)
                    }
                  >
                    <HighchartsReact
                      highcharts={Highcharts}
                      options={usagePie}
                      immutable={true}
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* Chart expansion modal */}
          <AnimatePresence>
            {expandedChart && (
              <motion.div
                className="dashboard-chart-modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeExpandedChart}
              >
                <motion.div
                  className="dashboard-chart-modal"
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="dashboard-chart-modal-header">
                    <span>{expandedChart.title}</span>
                    <button
                      type="button"
                      className="dashboard-chart-modal-close"
                      onClick={closeExpandedChart}
                    >
                      ✖
                    </button>
                  </div>
                  <div className="dashboard-chart-modal-body">
                    <div className="dashboard-chart-modal-inner">
                      <HighchartsReact
                        highcharts={Highcharts}
                        options={getExpandedOptions(expandedChart.options)}
                        immutable={true}
                        containerProps={{
                          className: "dashboard-chart-modal-highcharts",
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Dashboard;
