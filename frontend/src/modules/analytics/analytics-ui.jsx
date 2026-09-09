export function analyticsInfoIcon(info, tone = "slate") {
  if (!info) return "";
  const safeInfo = info;
  const toneClass = tone === "dark" ? "text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border-white/10" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700";
  return <span className={"relative inline-flex group/info shrink-0"}>
      <button type={"button"} aria-label={safeInfo} className={"w-5 h-5 rounded-full border " + toneClass + " flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30"}>
        <svg className={"w-3.5 h-3.5"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.4"} viewBox={"0 0 24 24"}>
          <path strokeLinecap={"round"} strokeLinejoin={"round"} d={"M12 17v-6m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
        </svg>
      </button>
      <span role={"tooltip"} className={"pointer-events-none absolute right-0 top-7 z-[90] w-72 rounded-xl bg-slate-950 text-white text-[11px] font-semibold leading-relaxed shadow-2xl border border-slate-800 px-3 py-2 opacity-0 translate-y-1 group-hover/info:opacity-100 group-hover/info:translate-y-0 group-focus-within/info:opacity-100 group-focus-within/info:translate-y-0 transition-all duration-150 normal-case tracking-normal"}>
        {safeInfo}
      </span>
    </span>;
}
export function analyticsLabelWithInfo(label, info, tone = "slate") {
  return <div className={"flex items-start justify-between gap-2"}>
      <span>{label}</span>
      {analyticsInfoIcon(info, tone)}
    </div>;
}
export function analyticsPanelTitle(title, info, tone = "slate") {
  return <div className={"flex items-start gap-2"}>
      <h5 className={"text-xs font-black uppercase text-slate-400 tracking-wider"}>{title}</h5>
      {analyticsInfoIcon(info, tone)}
    </div>;
}
export function styleObject(css) {
  return Object.fromEntries(css.split(";").filter(r => r.trim()).map(r => {
    const i = r.indexOf(":");
    return [r.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), r.slice(i + 1).trim()];
  }));
}
