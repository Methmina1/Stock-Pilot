import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
} from 'lightweight-charts';

const TIMEZONES = [
  { label: 'UTC', value: 'UTC', offset: 0 },
  { label: 'New York (ET)', value: 'America/New_York', offset: -5 },
  { label: 'Chicago (CT)', value: 'America/Chicago', offset: -6 },
  { label: 'Los Angeles (PT)', value: 'America/Los_Angeles', offset: -8 },
  { label: 'London (GMT)', value: 'Europe/London', offset: 0 },
  { label: 'Paris (CET)', value: 'Europe/Paris', offset: 1 },
  { label: 'Dubai (GST)', value: 'Asia/Dubai', offset: 4 },
  { label: 'Mumbai (IST)', value: 'Asia/Kolkata', offset: 5.5 },
  { label: 'Singapore (SGT)', value: 'Asia/Singapore', offset: 8 },
  { label: 'Shanghai (CST)', value: 'Asia/Shanghai', offset: 8 },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo', offset: 9 },
  { label: 'Sydney (AEST)', value: 'Australia/Sydney', offset: 10 },
  { label: 'Auckland (NZST)', value: 'Pacific/Auckland', offset: 12 },
  { label: 'Colombo (LKT)', value: 'Asia/Colombo', offset: 5.5 },
];

const TIMEFRAMES = [
  { label: '1m', interval: '1m', period: '1d' },
  { label: '5m', interval: '5m', period: '5d' },
  { label: '15m', interval: '15m', period: '5d' },
  { label: '1H', interval: '1h', period: '1mo' },
  { label: '4H', interval: '4h', period: '3mo' },
  { label: '1D', interval: '1d', period: '1y' },
  { label: '1W', interval: '1wk', period: '5y' },
  { label: '1M', interval: '1mo', period: 'max' },
];

const INDICATORS = [
  { key: 'sma20', label: 'SMA 20', color: '#3b82f6', type: 'overlay' },
  { key: 'sma50', label: 'SMA 50', color: '#f59e0b', type: 'overlay' },
  { key: 'ema20', label: 'EMA 20', color: '#8b5cf6', type: 'overlay' },
  { key: 'ema50', label: 'EMA 50', color: '#ec4899', type: 'overlay' },
  { key: 'bb', label: 'Bollinger Bands', color: '#6366f1', type: 'overlay' },
  { key: 'vwap', label: 'VWAP', color: '#14b8a6', type: 'overlay' },
  { key: 'rsi', label: 'RSI (14)', color: '#d4a853', type: 'panel' },
  { key: 'macd', label: 'MACD', color: '#22c55e', type: 'panel' },
  { key: 'volume', label: 'Volume', color: '#64748b', type: 'histogram' },
];

function computeSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push({ time: data[i].time, value: +(sum / period).toFixed(4) });
  }
  return result;
}

function computeEMA(data, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = null;
  for (let i = 0; i < data.length; i++) {
    if (ema === null) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j].close;
      ema = sum / period;
    } else {
      ema = data[i].close * k + ema * (1 - k);
    }
    result.push({ time: data[i].time, value: +ema.toFixed(4) });
  }
  return result;
}

function computeBB(data, period = 20, mult = 2) {
  const upper = [], mid = [], lower = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = 0; j < period; j++) variance += Math.pow(data[i - j].close - mean, 2);
    const std = Math.sqrt(variance / period);
    mid.push({ time: data[i].time, value: +mean.toFixed(4) });
    upper.push({ time: data[i].time, value: +(mean + mult * std).toFixed(4) });
    lower.push({ time: data[i].time, value: +(mean - mult * std).toFixed(4) });
  }
  return { upper, mid, lower };
}

function computeVWAP(data) {
  const result = [];
  let cumPV = 0, cumVol = 0;
  let lastDate = null;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const dateKey = typeof d.time === 'number' ? new Date(d.time * 1000).toDateString() : d.time;
    if (dateKey !== lastDate) {
      cumPV = 0;
      cumVol = 0;
      lastDate = dateKey;
    }
    const tp = (d.high + d.low + d.close) / 3;
    const vol = d.volume || 1;
    cumPV += tp * vol;
    cumVol += vol;
    result.push({ time: d.time, value: +(cumPV / cumVol).toFixed(4) });
  }
  return result;
}

function computeRSI(data, period = 14) {
  const result = [];
  const gains = [], losses = [];
  for (let i = 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  if (gains.length < period) return result;
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push({ time: data[period].time, value: +(100 - 100 / (1 + avgGain / (avgLoss || 1e-10))).toFixed(2) });
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result.push({ time: data[i + 1].time, value: +(100 - 100 / (1 + avgGain / (avgLoss || 1e-10))).toFixed(2) });
  }
  return result;
}

function computeMACD(data, fast = 12, slow = 26, signal = 9) {
  const emaFast = computeEMA(data, fast);
  const emaSlow = computeEMA(data, slow);
  const macdLine = [];
  const slowMap = new Map(emaSlow.map(d => [d.time, d.value]));
  for (const d of emaFast) {
    const sv = slowMap.get(d.time);
    if (sv !== undefined) macdLine.push({ time: d.time, close: d.value - sv });
  }
  const signalLine = [];
  const k = 2 / (signal + 1);
  let ema = null;
  for (let i = 0; i < macdLine.length; i++) {
    if (ema === null) {
      if (i < signal - 1) continue;
      let sum = 0;
      for (let j = 0; j < signal; j++) sum += macdLine[i - j].close;
      ema = sum / signal;
    } else {
      ema = macdLine[i].close * k + ema * (1 - k);
    }
    signalLine.push({ time: macdLine[i].time, value: +ema.toFixed(4) });
  }
  const sigMap = new Map(signalLine.map(d => [d.time, d.value]));
  const histogram = [];
  const macdValues = [];
  for (const d of macdLine) {
    const sv = sigMap.get(d.time);
    macdValues.push({ time: d.time, value: +d.close.toFixed(4) });
    if (sv !== undefined) {
      const diff = d.close - sv;
      histogram.push({ time: d.time, value: +diff.toFixed(4), color: diff >= 0 ? 'rgba(34,197,94,.6)' : 'rgba(239,68,68,.6)' });
    }
  }
  return { macdLine: macdValues, signalLine, histogram };
}

export default function TradingChart({ data, ticker, isMarketOpen, onTimeframeChange, activeTimeframe, livePrice }) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const seriesRef = useRef({});
  const configRef = useRef({ chartType: null, indicators: null, timezone: null });
  const lastCandleRef = useRef(null);
  const [chartType, setChartType] = useState('candle');
  const [activeIndicators, setActiveIndicators] = useState(['volume']);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [timezone, setTimezone] = useState(() => localStorage.getItem('sp_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [showTzMenu, setShowTzMenu] = useState(false);

  const toggleIndicator = (key) => {
    setActiveIndicators(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const changeTimezone = (tz) => {
    setTimezone(tz);
    localStorage.setItem('sp_timezone', tz);
    setShowTzMenu(false);
  };

  const tzLabel = TIMEZONES.find(t => t.value === timezone)?.label || timezone;

  const buildChart = useCallback(() => {
    if (!containerRef.current) return;

    const hasRSI = activeIndicators.includes('rsi');
    const hasMACD = activeIndicators.includes('macd');
    const panelCount = (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0);
    const mainH = panelCount === 0 ? 460 : panelCount === 1 ? 360 : 300;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    seriesRef.current = {};

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: mainH + panelCount * 120,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e1e22' },
        horzLines: { color: '#1e1e22' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3f3f46', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#27272a' },
        horzLine: { color: '#3f3f46', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#27272a' },
      },
      rightPriceScale: {
        borderColor: '#2e2e33',
        scaleMargins: { top: 0.05, bottom: panelCount > 0 ? 0.02 + panelCount * 0.18 : 0.05 },
      },
      timeScale: {
        borderColor: '#2e2e33',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        timeFormatter: (ts) => {
          const d = new Date(ts * 1000);
          try {
            return d.toLocaleString('en-US', { timeZone: timezone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
          } catch {
            return d.toLocaleString();
          }
        },
      },
    });
    chartRef.current = chart;

    // Create series shells (data set separately)
    if (chartType === 'candle') {
      seriesRef.current.main = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444',
        borderDownColor: '#ef4444', borderUpColor: '#22c55e',
        wickDownColor: '#ef4444', wickUpColor: '#22c55e',
        priceScaleId: 'right',
      });
    } else {
      seriesRef.current.main = chart.addSeries(LineSeries, {
        color: '#3b82f6', lineWidth: 2, priceScaleId: 'right', crosshairMarkerRadius: 4,
      });
      seriesRef.current.area = chart.addSeries(AreaSeries, {
        topColor: 'rgba(59,130,246,.15)', bottomColor: 'rgba(59,130,246,.02)',
        lineColor: 'transparent', lineWidth: 0, priceScaleId: 'right',
      });
    }

    if (activeIndicators.includes('volume')) {
      seriesRef.current.volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' }, priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, drawTicks: false });
    }
    if (activeIndicators.includes('sma20')) {
      seriesRef.current.sma20 = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1.5, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    }
    if (activeIndicators.includes('sma50')) {
      seriesRef.current.sma50 = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.5, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    }
    if (activeIndicators.includes('ema20')) {
      seriesRef.current.ema20 = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1.5, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    }
    if (activeIndicators.includes('ema50')) {
      seriesRef.current.ema50 = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 1.5, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    }
    if (activeIndicators.includes('bb')) {
      seriesRef.current.bbUpper = chart.addSeries(LineSeries, { color: 'rgba(99,102,241,.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
      seriesRef.current.bbMid = chart.addSeries(LineSeries, { color: 'rgba(99,102,241,.3)', lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
      seriesRef.current.bbLower = chart.addSeries(LineSeries, { color: 'rgba(99,102,241,.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    }
    if (activeIndicators.includes('vwap')) {
      seriesRef.current.vwap = chart.addSeries(LineSeries, { color: '#14b8a6', lineWidth: 1.5, lineStyle: LineStyle.Dotted, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    }
    if (hasRSI) {
      seriesRef.current.rsi = chart.addSeries(LineSeries, { color: '#d4a853', lineWidth: 1.5, priceScaleId: 'rsi', lastValueVisible: true, priceLineVisible: false });
      chart.priceScale('rsi').applyOptions({ scaleMargins: { top: panelCount === 2 ? 0.72 : 0.78, bottom: hasMACD ? 0.12 : 0.02 }, drawTicks: false });
      seriesRef.current.rsi30 = chart.addSeries(LineSeries, { color: 'rgba(34,197,94,.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'rsi', lastValueVisible: false, priceLineVisible: false });
      seriesRef.current.rsi70 = chart.addSeries(LineSeries, { color: 'rgba(239,68,68,.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'rsi', lastValueVisible: false, priceLineVisible: false });
    }
    if (hasMACD) {
      seriesRef.current.macdLine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1.5, priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('macd').applyOptions({ scaleMargins: { top: hasRSI ? 0.88 : 0.82, bottom: 0.02 }, drawTicks: false });
      seriesRef.current.macdSignal = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
      seriesRef.current.macdHist = chart.addSeries(HistogramSeries, { priceScaleId: 'macd', priceFormat: { type: 'price', precision: 4 } });
    }

    configRef.current = { chartType, indicators: [...activeIndicators].sort().join(','), timezone };
    return chart;
  }, [chartType, activeIndicators, timezone]);

  const applyData = useCallback((fitContent = false) => {
    if (!data || data.length === 0 || !chartRef.current) return;
    const s = seriesRef.current;
    const sorted = [...data].sort((a, b) => a.time - b.time);

    if (s.main) {
      if (configRef.current.chartType === 'candle') {
        s.main.setData(sorted.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));
      } else {
        s.main.setData(sorted.map(d => ({ time: d.time, value: d.close })));
        if (s.area) s.area.setData(sorted.map(d => ({ time: d.time, value: d.close })));
      }
    }
    if (s.volume) s.volume.setData(sorted.map(d => ({ time: d.time, value: d.volume || 0, color: d.close >= d.open ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)' })));
    if (s.sma20) s.sma20.setData(computeSMA(sorted, 20));
    if (s.sma50) s.sma50.setData(computeSMA(sorted, 50));
    if (s.ema20) s.ema20.setData(computeEMA(sorted, 20));
    if (s.ema50) s.ema50.setData(computeEMA(sorted, 50));
    if (s.bbUpper) {
      const bb = computeBB(sorted, 20, 2);
      s.bbUpper.setData(bb.upper);
      s.bbMid.setData(bb.mid);
      s.bbLower.setData(bb.lower);
    }
    if (s.vwap) s.vwap.setData(computeVWAP(sorted));
    if (s.rsi) {
      const rsiData = computeRSI(sorted, 14);
      s.rsi.setData(rsiData);
      s.rsi30.setData(rsiData.map(d => ({ time: d.time, value: 30 })));
      s.rsi70.setData(rsiData.map(d => ({ time: d.time, value: 70 })));
    }
    if (s.macdLine) {
      const macd = computeMACD(sorted);
      s.macdLine.setData(macd.macdLine);
      s.macdSignal.setData(macd.signalLine);
      s.macdHist.setData(macd.histogram);
    }

    if (sorted.length > 0) lastCandleRef.current = sorted[sorted.length - 1];
    if (fitContent) chartRef.current.timeScale().fitContent();
  }, [data]);

  // Create chart when config changes
  useEffect(() => {
    const chart = buildChart();
    if (!chart) return;
    applyData(true);

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [buildChart]);

  // Update data in-place on live refresh (no chart recreation)
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current.main) return;
    applyData(false);
  }, [applyData]);

  // Live tick: update last candle with latest quote price every 2s
  useEffect(() => {
    if (!livePrice || !isMarketOpen || !seriesRef.current.main || !lastCandleRef.current) return;
    const candle = lastCandleRef.current;
    const p = livePrice;
    if (configRef.current.chartType === 'candle') {
      seriesRef.current.main.update({
        time: candle.time,
        open: candle.open,
        high: Math.max(candle.high, p),
        low: Math.min(candle.low, p),
        close: p,
      });
    } else {
      seriesRef.current.main.update({ time: candle.time, value: p });
      if (seriesRef.current.area) seriesRef.current.area.update({ time: candle.time, value: p });
    }
  }, [livePrice, isMarketOpen]);

  return (
    <div className="card pad" style={{ marginTop: 18 }}>
      {/* Chart toolbar */}
      <div className="chart-toolbar">
        <div className="chart-toolbar-left">
          <div className="ctitle">
            <span className="dot" />{ticker}
            {isMarketOpen && <span className="live-badge" style={{ marginLeft: 8 }}><span className="lb-dot" />LIVE</span>}
          </div>

          {/* Chart type toggle */}
          <div className="chart-type-toggle">
            <button className={chartType === 'candle' ? 'on' : ''} onClick={() => setChartType('candle')} title="Candlestick">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="5" y1="0" x2="5" y2="2" stroke="currentColor" strokeWidth="1.5"/><line x1="5" y1="14" x2="5" y2="16" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="5" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="3" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="13" x2="11" y2="15" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <button className={chartType === 'line' ? 'on' : ''} onClick={() => setChartType('line')} title="Line">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polyline points="1,12 4,6 7,9 10,3 13,7 15,4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        <div className="chart-toolbar-right">
          {/* Timeframe tabs */}
          <div className="period-tabs">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.label}
                className={`period-tab${activeTimeframe?.interval === tf.interval ? ' on' : ''}`}
                onClick={() => onTimeframeChange(tf)}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Indicators */}
          <div style={{ position: 'relative' }}>
            <button className="btn" onClick={() => { setShowIndicatorMenu(!showIndicatorMenu); setShowTzMenu(false); }} style={{ fontSize: 11, padding: '5px 10px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}><path d="M3 3v18h18"/><path d="m7 16 4-8 4 5 4-9"/></svg>
              Indicators{activeIndicators.length > 0 ? ` (${activeIndicators.length})` : ''}
            </button>
            {showIndicatorMenu && (
              <div className="ind-menu">
                <div className="ind-head">Indicators</div>
                {INDICATORS.map((ind) => (
                  <label key={ind.key} className="ind-item">
                    <input type="checkbox" checked={activeIndicators.includes(ind.key)} onChange={() => toggleIndicator(ind.key)} />
                    <span className="ind-dot" style={{ background: ind.color }} />
                    <span>{ind.label}</span>
                    <span className="ind-type">{ind.type}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Timezone */}
          <div style={{ position: 'relative' }}>
            <button className="btn" onClick={() => { setShowTzMenu(!showTzMenu); setShowIndicatorMenu(false); }} style={{ fontSize: 11, padding: '5px 10px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              {tzLabel}
            </button>
            {showTzMenu && (
              <div className="tz-menu">
                <div className="ind-head">Timezone</div>
                {TIMEZONES.map((tz) => (
                  <button key={tz.value} className={`tz-item${timezone === tz.value ? ' on' : ''}`} onClick={() => changeTimezone(tz.value)}>
                    <span>{tz.label}</span>
                    <span className="tz-offset">UTC{tz.offset >= 0 ? '+' : ''}{tz.offset}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active indicators chips */}
      {activeIndicators.filter(k => k !== 'volume').length > 0 && (
        <div className="ind-chips">
          {activeIndicators.filter(k => k !== 'volume').map((key) => {
            const ind = INDICATORS.find(i => i.key === key);
            return ind ? (
              <span key={key} className="ind-chip" style={{ borderColor: ind.color }}>
                <span className="ind-dot" style={{ background: ind.color }} />
                {ind.label}
                <button onClick={() => toggleIndicator(key)}>&times;</button>
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} style={{ marginTop: 10 }} />

      {data && data.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717a', fontFamily: 'var(--mono)', fontSize: 13 }}>
          No chart data available for this timeframe
        </div>
      )}
    </div>
  );
}
