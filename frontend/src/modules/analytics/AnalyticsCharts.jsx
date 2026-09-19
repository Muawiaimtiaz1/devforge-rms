import { getShopCurrency } from '../../currency'
import { useState } from "react";
import { useChartSize } from "./useChartSize";
import { styleObject } from "./analytics-ui";
export function BarChart({
  dataPoints
}) {
  const [size, ref] = useChartSize();
  if (!dataPoints || dataPoints.length === 0) {
    return <div ref={ref} className="w-full h-full relative">{<div className={"flex items-center justify-center h-full text-slate-400 text-xs italic"}>No sales transactions found in this period.</div>}</div>;
  }
  const width = size.width || 500;
  const height = size.height || 200;
  const paddingX = 40;
  const paddingY = 30;
  const maxVal = Math.max(...dataPoints.map(d => d.sales), 1);
  const barCount = dataPoints.length;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const getX = index => paddingX + index / barCount * chartWidth;
  const barWidth = Math.max(chartWidth / barCount * 0.7, 3);
  const barsHtml = dataPoints.map((dp, idx) => {
    const x = getX(idx) + (chartWidth / barCount - barWidth) / 2;
    const barHeight = dp.sales / maxVal * chartHeight;
    const y = height - paddingY - barHeight;
    const formattedSales = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: getShopCurrency(),
      maximumFractionDigits: 0
    }).format(dp.sales);
    const tooltip = <div className={"flex flex-col gap-0.5 z-[9999]"}>
        <span className={"text-[10px] uppercase font-black text-slate-400 tracking-wider border-b border-slate-700/60 pb-1 mb-1 block"}>{dp.label}</span>
        <span className={"text-sm text-indigo-400 font-extrabold block"}>{formattedSales}</span>
        <span className={"text-xs text-slate-300 font-black block mt-0.5"}>{dp.orders} Total Orders</span>
      </div>;
    return <g className={"group/bar cursor-pointer select-none"} key={idx}>
        
        <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 2)} rx={Math.min(barWidth / 2, 4)} ry={Math.min(barWidth / 2, 4)} fill={"#3b82f6"} fillOpacity={"0.85"} className={"hover:fill-opacity-100 hover:fill-[#2563eb] transition-all duration-300"} />
        
        
        <rect x={getX(idx)} y={paddingY} width={chartWidth / barCount} height={chartHeight} fill={"transparent"} />
        
        
        <foreignObject x={Math.max(Math.min(x + barWidth / 2 - 80, width - 170), 10)} y={Math.max(y - 85, 5)} width={"160"} height={"75"} className={"opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-all duration-200 overflow-visible z-[9999]"}>
          <div className={"bg-slate-950 text-white rounded-xl p-3 text-left shadow-2xl border border-slate-800 z-[9999]"}>
            {tooltip}
          </div>
        </foreignObject>
      </g>;
  });
  return <div ref={ref} className="w-full h-full relative">{<svg className={"w-full h-full overflow-visible"} viewBox={"0 0 " + width + " " + height + ""}>
      
      <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke={"#e2e8f0"} className={"dark:stroke-slate-800"} strokeWidth={"1"} strokeDasharray={"4"} />
      <line x1={paddingX} y1={height - paddingY - chartHeight / 2} x2={width - paddingX} y2={height - paddingY - chartHeight / 2} stroke={"#e2e8f0"} className={"dark:stroke-slate-800"} strokeWidth={"1"} strokeDasharray={"4"} />
      <line x1={paddingX} y1={height - paddingY - chartHeight} x2={width - paddingX} y2={height - paddingY - chartHeight} stroke={"#e2e8f0"} className={"dark:stroke-slate-800"} strokeWidth={"1"} strokeDasharray={"4"} />

      
      {barsHtml}

      
      {dataPoints.map((dp, i) => {
        if (barCount > 10 && i % Math.ceil(barCount / 6) !== 0) return '';
        const x = getX(i) + chartWidth / barCount / 2;
        const displayLabel = dp.label.replace(':00', '');
        return <text x={x} y={height - paddingY + 18} textAnchor={"middle"} fill={"#94a3b8"} className={"text-[11px] md:text-xs font-black uppercase select-none tracking-tight"} key={i}>{displayLabel}</text>;
      })}
    </svg>}</div>;
}
export function LineChart({
  containerId,
  dataPoints
}) {
  const [size, ref] = useChartSize();
  if (!dataPoints || dataPoints.length === 0) {
    return <div ref={ref} className="w-full h-full relative">{<div className={"flex items-center justify-center h-full text-slate-400 text-xs italic"}>No data available.</div>}</div>;
  }
  const width = size.width || 500;
  const height = size.height || 200;
  const paddingX = 40;
  const paddingY = 20;
  const maxVal = Math.max(...dataPoints.map(d => d.sales), 1);
  const getX = index => paddingX + index / (dataPoints.length - 1) * (width - paddingX * 2);
  const minVal = 0;
  const getY = value => height - paddingY - (value - minVal) / (maxVal - minVal) * (height - paddingY * 2);
  let pathD = "";
  let areaD = `M ${getX(0)} ${height - paddingY}`;
  dataPoints.forEach((dp, i) => {
    const x = getX(i);
    const y = getY(dp.sales);
    if (i === 0) {
      pathD = `M ${x} ${y}`;
      areaD += ` L ${x} ${y}`;
    } else {
      const prevX = getX(i - 1);
      const prevY = getY(dataPoints[i - 1].sales);
      const cpX1 = prevX + (x - prevX) / 2;
      const cpY1 = prevY;
      const cpX2 = prevX + (x - prevX) / 2;
      const cpY2 = y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
      areaD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
    }
  });
  areaD += ` L ${getX(dataPoints.length - 1)} ${height - paddingY} Z`;
  return <div ref={ref} className="w-full h-full relative">{<svg className={"w-full h-full overflow-visible"} viewBox={"0 0 " + width + " " + height + ""}>
      <defs>
        
        <linearGradient id={"area-grad-" + containerId + ""} x1={"0"} y1={"0"} x2={"0"} y2={"1"}>
          <stop offset={"0%"} stopColor={"#3b82f6"} stopOpacity={"0.25"} />
          <stop offset={"100%"} stopColor={"#3b82f6"} stopOpacity={"0.0"} />
        </linearGradient>
      </defs>
      
      
      <line x1={paddingX} y1={getY(0)} x2={width - paddingX} y2={getY(0)} stroke={"#e2e8f0"} className={"dark:stroke-slate-800"} strokeWidth={"1"} strokeDasharray={"4"} />
      <line x1={paddingX} y1={getY(maxVal / 2)} x2={width - paddingX} y2={getY(maxVal / 2)} stroke={"#e2e8f0"} className={"dark:stroke-slate-800"} strokeWidth={"1"} strokeDasharray={"4"} />
      <line x1={paddingX} y1={getY(maxVal)} x2={width - paddingX} y2={getY(maxVal)} stroke={"#e2e8f0"} className={"dark:stroke-slate-800"} strokeWidth={"1"} strokeDasharray={"4"} />

      
      <path d={areaD} fill={"url(#area-grad-" + containerId + ")"} className={"animate-[fadeIn_0.5s_ease-out]"} />

      
      <path d={pathD} fill={"none"} stroke={"#3b82f6"} strokeWidth={"3"} strokeLinecap={"round"} className={"animate-[draw_1s_ease-out]"} />

      
      {dataPoints.map((dp, i) => {
        const x = getX(i);
        const y = getY(dp.sales);
        const formattedSales = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: getShopCurrency(),
          maximumFractionDigits: 0
        }).format(dp.sales);
        return <g className={"group/dot cursor-pointer select-none"} key={i}>
            
            <circle cx={x} cy={y} r={"20"} fill={"transparent"} stroke={"none"} />
            
            
            <circle cx={x} cy={y} r={"8"} fill={"#3b82f6"} fillOpacity={"0"} stroke={"none"} className={"group-hover/dot:fill-opacity-30 transition-all duration-300"} />
            <circle cx={x} cy={y} r={"4"} fill={"#ffffff"} stroke={"#3b82f6"} strokeWidth={"2.5"} className={"opacity-0 group-hover/dot:opacity-100 transition-all duration-300 origin-center group-hover/dot:scale-125"} style={styleObject("transform-box: fill-box;")} />
            
            
            <foreignObject x={x - 70} y={y - 65} width={"140"} height={"55"} className={"opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-all duration-200 overflow-visible z-50"}>
              <div className={"bg-slate-950 text-white rounded-xl p-2 text-center text-[10px] font-bold shadow-xl border border-slate-800"}>
                <span className={"block text-[8px] text-slate-400 uppercase tracking-widest leading-none mb-1"}>{dp.label}</span>
                <span className={"text-blue-400"}>{formattedSales}</span>
              </div>
            </foreignObject>
          </g>;
      })}
    </svg>}</div>;
}
export function DonutChart({
  containerId,
  slices,
  totalValue
}) {
  const [hovered, setHovered] = useState(null);
  if (!slices || slices.length === 0 || totalValue === 0) {
    return <div  className="w-full h-full relative">{<div className={"flex flex-col items-center justify-center h-full text-slate-400 text-xs italic gap-2"}>
        <div className={"w-16 h-16 rounded-full border-4 border-slate-200 dark:border-slate-800 border-dashed animate-spin"}></div>
        <span>No sales breakdown.</span>
      </div>}</div>;
  }
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f43f5e", "#64748b", "#1e293b"];

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let htmlTooltips = [];
  const donutSlicesHtml = slices.map((s, idx) => {
    const accumulatedPercent = slices.slice(0, idx).reduce((total, item) => total + item.sales / totalValue, 0);
    const pct = s.sales / totalValue;
    const strokeDash = pct * circumference;
    const strokeOffset = circumference - pct * circumference;
    const strokeRotation = accumulatedPercent * 360 - 90;
    const midAngle = accumulatedPercent * 360 + pct * 360 / 2 - 90;
    const rad = midAngle * (Math.PI / 180);
    const lineX1 = 80 + (radius + 8) * Math.cos(rad);
    const lineY1 = 80 + (radius + 8) * Math.sin(rad);
    const lineX2 = 80 + (radius + 75) * Math.cos(rad);
    const lineY2 = 80 + (radius + 75) * Math.sin(rad);
    const color = colors[idx % colors.length];
    const formattedSales = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: getShopCurrency(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(s.sales);
    const displayPct = (pct * 100).toFixed(1);
    const isRightSide = lineX2 > 80;
    const tooltipTransform = isRightSide ? 'translate(4px, -50%)' : 'translate(calc(-100% - 4px), -50%)';
    htmlTooltips.push(<div key={idx} id={"tooltip-" + containerId + "-" + idx + ""} className={"absolute z-[99999] pointer-events-none transition-all duration-300 ease-out " + (hovered === idx ? "opacity-100" : "opacity-0")} style={styleObject("left: " + lineX2 + "px; top: " + lineY2 + "px; transform: " + tooltipTransform + (hovered === idx ? " scale(1);" : " scale(0.95);"))}>
        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-xl p-3.5 min-w-[160px]"} style={styleObject("border-left: 4px solid " + color + "")}>
          <div className={"text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 truncate"}>{s.label}</div>
          <div className={"text-base font-black text-slate-800 dark:text-white leading-tight"}>{formattedSales}</div>
          <div className={"flex items-center gap-2 mt-1.5"}>
             <span className={"text-[11px] font-bold text-slate-500"}>{displayPct}% Share</span>
             {s.orders !== undefined ? <span className={"text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded-md"}>{s.orders} Orders</span> : ''}
          </div>
        </div>
      </div>);
    return <g className={"group cursor-pointer"} key={idx} onMouseEnter={() => setHovered(idx)} onMouseLeave={() => setHovered(null)}>
        <circle cx={"80"} cy={"80"} r={radius} fill={"transparent"} stroke={color} strokeWidth={"22"} strokeDasharray={"" + strokeDash + " " + strokeOffset + ""} transform={"rotate(" + strokeRotation + " 80 80)"} strokeLinecap={"butt"} className={"transition-all duration-300"}>
        </circle>
        
        
        <line x1={lineX1} y1={lineY1} x2={lineX2} y2={lineY2} stroke={color} strokeWidth={"2.5"} strokeLinecap={"round"} strokeDasharray={"80"} strokeDashoffset={"80"} className={"transition-all duration-500 delay-[50ms] opacity-0 group-hover:opacity-100 group-hover:[stroke-dashoffset:0]"} />
      </g>;
  });
  const formattedTotal = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: getShopCurrency(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(totalValue);
  const legendHtml = slices.map((s, idx) => {
    const color = colors[idx % colors.length];
    return <div className={"flex items-center gap-2 text-xs py-1 border-b border-slate-50 dark:border-slate-800/40 last:border-0"} key={idx}>
        <span className={"w-2 h-2 rounded-full shrink-0"} style={styleObject("background-color: " + color + "")}></span>
        <span className={"font-bold text-slate-600 dark:text-slate-400 capitalize truncate"}>{s.label}</span>
      </div>;
  });
  return <div  className="w-full h-full relative">{<div className={"flex flex-col md:flex-row items-center justify-center gap-6 w-full h-full"}>
      
      <div className={"relative w-40 h-40 shrink-0"}>
        <svg className={"w-full h-full overflow-visible"} viewBox={"0 0 160 160"}>
          {donutSlicesHtml}
        </svg>
        
        
        <div className={"absolute inset-[40px] bg-white dark:bg-slate-950 rounded-full flex flex-col items-center justify-center shadow-inner border border-slate-100 dark:border-slate-900 select-none"}>
          <span className={"text-[8px] uppercase font-black text-slate-400 tracking-wider"}>Total</span>
          <span className={"text-xs font-black text-indigo-600 dark:text-indigo-400 mt-0.5"}>{formattedTotal}</span>
        </div>

        
        {htmlTooltips}
      </div>
      
      
      <div className={"flex-1 w-full max-h-40 overflow-y-auto pr-1"}>
        {legendHtml}
      </div>
    </div>}</div>;
}
