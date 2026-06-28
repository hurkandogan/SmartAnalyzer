import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../utils';

export default function TickerModal({ data, onClose }) {
  const chartContainerRef = useRef(null);
  const [hoveredDate, setHoveredDate] = useState(null);

  // Parse data
  const symbol = data.symbol;
  const candles = data.candles || [];
  const fundamentals = data.fundamentals || [];

  // Map fundamentals by date for O(1) lookup
  const fundamentalsMap = useMemo(() => {
    const map = {};
    fundamentals.forEach((f) => {
      map[f.time] = f;
    });
    return map;
  }, [fundamentals]);

  const latestDate = candles.length > 0 ? candles[candles.length - 1].time : null;
  const displayDate = hoveredDate || latestDate;

  // Find current and previous fundamental for comparison
  const currentFund = fundamentalsMap[displayDate];
  
  // To find previous, we need the array of dates
  const fundDates = Object.keys(fundamentalsMap).sort();
  const currentIndex = fundDates.indexOf(displayDate);
  const prevFund = currentIndex > 0 ? fundamentalsMap[fundDates[currentIndex - 1]] : null;

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#A3A3A3',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
      },
    });

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candleSeries.setData(candles);

    // SMA 20 (Blue)
    const sma20Data = candles.filter(c => c.sma_20 !== null).map(c => ({ time: c.time, value: c.sma_20 }));
    if (sma20Data.length > 0) {
      const sma20Series = chart.addSeries(LineSeries, { color: '#3B82F6', lineWidth: 2, title: 'SMA20' });
      sma20Series.setData(sma20Data);
    }

    // SMA 50 (Purple)
    const sma50Data = candles.filter(c => c.sma_50 !== null).map(c => ({ time: c.time, value: c.sma_50 }));
    if (sma50Data.length > 0) {
      const sma50Series = chart.addSeries(LineSeries, { color: '#A855F7', lineWidth: 2, title: 'SMA50' });
      sma50Series.setData(sma50Data);
    }

    // SMA 200 (Orange)
    const sma200Data = candles.filter(c => c.sma_200 !== null).map(c => ({ time: c.time, value: c.sma_200 }));
    if (sma200Data.length > 0) {
      const sma200Series = chart.addSeries(LineSeries, { color: '#F97316', lineWidth: 2, title: 'SMA200' });
      sma200Series.setData(sma200Data);
    }

    chart.timeScale().fitContent();

    // Crosshair move handler
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        // param.time is sometimes a unix timestamp depending on format, 
        // but since we provided "YYYY-MM-DD", it usually returns "YYYY-MM-DD" or a specific object.
        // If string, use it. If object (BusinessDay), format it.
        let dateStr = param.time;
        if (typeof param.time === 'object') {
          const { year, month, day } = param.time;
          dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        setHoveredDate(dateStr);
      } else {
        setHoveredDate(null);
      }
    });

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles]);

  // Helper for metrics where LOWER is BETTER (e.g. PEG, Cash Burn Rate)
  const isLowerBetter = (label) => ['PEG', 'Cash Burn Rate'].includes(label);

  const MetricCard = ({ label, value, prevValue, format = (v) => v }) => {
    if (value === null || value === undefined) return null;
    
    let trend = 'flat'; // flat, up, down
    if (prevValue !== null && prevValue !== undefined) {
      if (value > prevValue) trend = 'up';
      if (value < prevValue) trend = 'down';
    }

    const lowerBetter = isLowerBetter(label);
    let colorClass = 'text-white/40';
    let Icon = Minus;

    if (trend === 'up') {
      colorClass = lowerBetter ? 'text-rose-500' : 'text-emerald-500';
      Icon = TrendingUp;
    } else if (trend === 'down') {
      colorClass = lowerBetter ? 'text-emerald-500' : 'text-rose-500';
      Icon = TrendingDown;
    }

    return (
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center gap-1 backdrop-blur-md">
        <span className="text-xs font-bold text-white/50 tracking-wider uppercase">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-white">{format(value)}</span>
          {trend !== 'flat' && <Icon className={cn("w-5 h-5", colorClass)} strokeWidth={3} />}
          {trend === 'flat' && <Minus className="w-5 h-5 text-white/20" strokeWidth={3} />}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-7xl max-h-full bg-base-300 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 bg-black/20">
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-black tracking-tight text-white">{symbol}</h2>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-white/70">
              {displayDate}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Chart Area */}
        <div className="w-full h-[50vh] min-h-[400px] bg-[#131722] p-4 relative">
          <div ref={chartContainerRef} className="w-full h-full" />
          
          {/* Legend Overlay */}
          <div className="absolute top-6 left-6 flex flex-col gap-1 pointer-events-none z-10 bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
            <div className="flex items-center gap-2"><div className="w-3 h-1 bg-[#3B82F6] rounded-full"/> <span className="text-xs font-bold text-white/70">SMA 20</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-1 bg-[#A855F7] rounded-full"/> <span className="text-xs font-bold text-white/70">SMA 50</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-1 bg-[#F97316] rounded-full"/> <span className="text-xs font-bold text-white/70">SMA 200</span></div>
          </div>
        </div>

        {/* Fundamentals Area */}
        <div className="flex-1 bg-base-300/50 p-6 overflow-y-auto">
          {currentFund ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
              <MetricCard label="P/E" value={currentFund.pe} prevValue={prevFund?.pe} format={v => v.toFixed(2)} />
              <MetricCard label="Fwd P/E" value={currentFund.forward_pe} prevValue={prevFund?.forward_pe} format={v => v.toFixed(2)} />
              <MetricCard label="PEG" value={currentFund.peg} prevValue={prevFund?.peg} format={v => v.toFixed(2)} />
              <MetricCard label="ROE" value={currentFund.roe} prevValue={prevFund?.roe} format={v => `${(v * 100).toFixed(1)}%`} />
              <MetricCard label="ROIC" value={currentFund.roic} prevValue={prevFund?.roic} format={v => `${(v * 100).toFixed(1)}%`} />
              <MetricCard label="RSI" value={currentFund.rsi} prevValue={prevFund?.rsi} format={v => v.toFixed(1)} />
              <MetricCard label="RVOL" value={currentFund.rvol} prevValue={prevFund?.rvol} format={v => v.toFixed(2)} />
              <MetricCard label="IV" value={currentFund.iv} prevValue={prevFund?.iv} format={v => `${(v * 100).toFixed(1)}%`} />
              <MetricCard label="Cash Burn Rate" value={currentFund.cash_burn_rate} prevValue={prevFund?.cash_burn_rate} format={v => `$${(v/1000000).toFixed(1)}M`} />
              <MetricCard label="Cash Runway (Yr)" value={currentFund.cash_runway} prevValue={prevFund?.cash_runway} format={v => v.toFixed(1)} />
              <MetricCard label="Rev Growth YoY" value={currentFund.revenue_growth_yoy} prevValue={prevFund?.revenue_growth_yoy} format={v => `${(v * 100).toFixed(1)}%`} />
              <MetricCard label="Short Float" value={currentFund.short_interest_pct} prevValue={prevFund?.short_interest_pct} format={v => `${(v * 100).toFixed(1)}%`} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-white/30 font-medium">No fundamental data available for {displayDate}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
