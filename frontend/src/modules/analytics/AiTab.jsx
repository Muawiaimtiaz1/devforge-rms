import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { analyticsInfoIcon } from "./analytics-ui";
export function AiTab({
  analyticsPeriod
}) {
  const [result, setResult] = useState({});
  useEffect(() => {
    let active = true;
    api("/api/ai/insights?period=" + analyticsPeriod).then(data => {
      if (active) setResult({
        data,
        period: analyticsPeriod
      });
    }).catch(error => {
      if (active) setResult({
        error: error.message,
        period: analyticsPeriod
      });
    });
    return () => {
      active = false;
    };
  }, [analyticsPeriod]);
  if (result.period !== analyticsPeriod || !result.data && !result.error) return <div className={"flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl gap-4"}>
        <div className={"w-10 h-10 border-4 border-violet-200 dark:border-violet-800 border-t-violet-600 rounded-full animate-spin"}></div>
        <span className={"text-sm font-bold text-slate-500"}>AI Analyst is scanning your records for insights...</span>
      </div>;
  if (result.error) return <div className="p-6 text-rose-500 text-sm font-bold">Failed to load AI Insights: {result.error}</div>;
  const aiData = result.data;
  return <div className={"space-y-6 animate-[fadeIn_0.3s_ease-out]"}>
          
          <div className={"p-6 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-3xl text-white shadow-lg shadow-indigo-600/20 flex flex-col md:flex-row justify-between items-center gap-6 border border-white/10 relative overflow-hidden"}>
             <div className={"absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"}></div>
             <div>
                <div className={"flex items-center gap-2 mb-1"}>
                   <span className={"w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"}></span>
                   <span className={"text-[10px] font-black uppercase tracking-widest text-indigo-100"}>AI Data Verdict</span>
                </div>
                <h3 className={"text-2xl font-black tracking-tight"}>{aiData.summary.verdict}</h3>
                <p className={"text-xs text-indigo-100/80 mt-1"}>Evidence level: {aiData.summary.evidenceLevel} based on completed orders in this period.</p>
             </div>
             <div className={"flex gap-4"}>
                <div className={"bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-center"}>
                   <span className={"text-[9px] uppercase font-black block text-indigo-200"}>Margin</span>
                   <span className={"text-lg font-black"}>{aiData.rawMetrics.margin}</span>
                </div>
                <div className={"bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-center"}>
                   <span className={"text-[9px] uppercase font-black block text-indigo-200"}>Growth</span>
                   <span className={"text-lg font-black"}>{aiData.rawMetrics.growth}</span>
                </div>
             </div>
          </div>

          <div className={"grid grid-cols-1 lg:grid-cols-2 gap-6"}>
            
            <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
                <h5 className={"text-xs font-black uppercase text-slate-400 tracking-wider mb-6 flex items-center gap-2"}>
                   <svg className={"w-4 h-4 text-violet-500"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.5"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} d={"M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"} /></svg> 
                   Automated Insights
                   {analyticsInfoIcon("AI-generated observations based on the same selected-period analytics data, including revenue, orders, margins, refunds, and inventory signals where available.")}
                </h5>
                <div className={"space-y-4"}>
                   {aiData.insights.map((ins, rowIndex) => <div className={"p-4 rounded-2xl border " + (ins.type === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400' : ins.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-400' : 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-400') + ""} key={rowIndex}>
                         <h6 className={"text-sm font-black"}>{ins.title}</h6>
                         <p className={"text-xs mt-1 font-medium opacity-90"}>{ins.message}</p>
                      </div>)}
                   {aiData.insights.length === 0 ? <p className={"text-slate-400 text-xs italic py-4"}>No critical anomalies detected.</p> : ''}
                </div>
            </div>

            
            <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
                <h5 className={"text-xs font-black uppercase text-slate-400 tracking-wider mb-6 flex items-center gap-2"}>
                   <svg className={"w-4 h-4 text-blue-500"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.5"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} d={"M13 10V3L4 14h7v7l9-11h-7z"} /></svg>
                   AI Recommendations
                   {analyticsInfoIcon("Suggested actions generated from the selected-period metrics and anomaly checks. These are advisory and do not change sales or inventory records.")}
                </h5>
                <div className={"space-y-6"}>
                   {aiData.recommendations.map((rec, rowIndex) => <div className={"flex gap-4 group"} key={rowIndex}>
                         <div className={"w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-800/40 group-hover:scale-110 transition-transform"}>
                            <svg className={"w-5 h-5"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.5"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} d={"M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"} /></svg>
                         </div>
                         <div>
                            <h6 className={"text-sm font-black text-slate-800 dark:text-white capitalize"}>{rec.action}</h6>
                            <p className={"text-[11px] text-slate-400 font-bold mt-0.5"}>{rec.reason}</p>
                            <p className={"text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800"}>{rec.suggestion}</p>
                         </div>
                      </div>)}
                </div>
            </div>
          </div>
        </div>;
}
