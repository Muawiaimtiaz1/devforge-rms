import { analyticsLinks, headers } from "./analytics-navigation";
export function AnalyticsFrame({
  activeAnalyticsTab,
  analyticsPeriod,
  analyticsCustomFrom,
  analyticsCustomTo,
  analyticsBrandId,
  customDateLimits,
  brands,
  drawerOpen,
  toggleAnalyticsSidebar,
  switchAnalyticsTab,
  onPeriodChange,
  onDateChange,
  onPartnerChange,
  notify,
  children
}) {
  function renderSidebarLink(tab) {
    const isActive = activeAnalyticsTab === tab.id;
    if (isActive) {
      return <button key={tab.id} onClick={() => {
        switchAnalyticsTab(tab.id);
      }} className={"w-full flex items-center gap-3 px-4 py-3 rounded-xl border " + tab.activeBg + " " + tab.activeBorder + " text-left transition-all duration-200 shadow-sm relative overflow-hidden group"}>
        <div className={"absolute left-0 top-0 bottom-0 w-1 " + tab.activeBg.replace('bg-', 'bg-').replace('50', '600').replace('500/10', '500') + ""}></div>
        <span className={tab.activeText}>{tab.icon}</span>
        <span className={"text-sm font-black " + tab.activeText + " tracking-tight"}>{tab.label}</span>
      </button>;
    } else {
      return <button key={tab.id} onClick={() => {
        switchAnalyticsTab(tab.id);
      }} className={"w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all duration-200 group"}>
        <span className={"text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"}>{tab.icon}</span>
        <span className={"text-sm font-bold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 tracking-tight transition-colors"}>{tab.label}</span>
      </button>;
    }
  }
  const partnerFilter = brands.length ? <div className={"flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800"}>
      <span className={"text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap"}>Profit Partner:</span>
      <select id={"analytics-brand-select"} value={analyticsBrandId} onChange={event => {
      onPartnerChange(event.target.value);
    }} className={"bg-transparent text-xs font-bold text-teal-600 dark:text-teal-400 outline-none cursor-pointer max-w-[170px]"}>
        <option value={""}>All Partners</option>
        {brands.map((brand, rowIndex) => <option value={brand.id} key={rowIndex}>{brand.name} ({brand.partner_type === "product_based" ? "Product" : "Share"})</option>)}
      </select>
    </div> : null;
  return <>
    
    <div id={"analytics-sidebar-overlay"} className={"fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] " + (drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none") + " transition-opacity duration-300"} onClick={() => {
      toggleAnalyticsSidebar();
    }}></div>
    <div id={"analytics-sidebar-drawer"} inert={!drawerOpen} className={"fixed top-0 left-0 h-full w-full sm:w-80 bg-white dark:bg-slate-900 shadow-2xl z-[110] " + (drawerOpen ? "" : "-translate-x-full") + " transition-transform duration-300 flex flex-col border-r border-slate-100 dark:border-slate-800"}>
      <div className={"p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center"}>
        <div>
          <span className={"text-[9px] uppercase font-black tracking-widest text-slate-400"}>Navigation</span>
          <h4 className={"text-base font-black text-slate-800 dark:text-white tracking-tight"}>Metrics Suite</h4>
        </div>
        <button onClick={() => {
          toggleAnalyticsSidebar();
        }} className={"p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors"}>
          <svg className={"w-5 h-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2.5"} d={"M6 18L18 6M6 6l12 12"} /></svg>
        </button>
      </div>
      <nav id={"analytics-sidebar-nav"} className={"flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800"}>
        {analyticsLinks.map(tab => renderSidebarLink(tab))}
      </nav>
      
      
      <div className={"p-6 border-t border-slate-100 dark:border-slate-800"}>
        <div onClick={() => {
          notify('Advanced AI Insights coming soon!');
        }} className={"flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-900/20 border border-indigo-100/50 dark:border-indigo-800/30 rounded-2xl cursor-pointer hover:shadow-lg transition-all group"}>
          <svg className={"w-6 h-6 text-indigo-500 mb-2 group-hover:scale-110 transition-transform"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.5"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} d={"M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"} /></svg>
          <span className={"text-xs font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest text-center"}>Unlock AI Insights</span>
          <span className={"text-[10px] text-indigo-500 dark:text-indigo-400 text-center mt-1"}>Upgrade to Premium</span>
        </div>
      </div>
    </div>

    <div className={"flex flex-col min-h-[calc(100vh-6rem)] gap-6 animate-[fadeIn_0.3s_ease-out]"}>
      
      
      <div className={"flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
        
        
        <div className={"flex flex-col lg:flex-row justify-between lg:items-center gap-4"}>
          
          <div className={"flex items-center gap-4"}>
            <button onClick={() => {
              toggleAnalyticsSidebar();
            }} className={"p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 shadow-sm border border-slate-200 dark:border-slate-700"}>
              <svg className={"w-5 h-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M4 6h16M4 12h16M4 18h7"} /></svg>
            </button>
            <div>
              <span className={"text-[9px] uppercase font-black tracking-widest text-slate-400 hidden sm:block"}>Analytics Engine</span>
              <h4 className={"text-base font-black text-slate-800 dark:text-white mt-0.5 tracking-tight flex items-center gap-1.5"}>
                <svg className={"w-5 h-5 text-blue-600 hidden sm:inline"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.5"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} d={"M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"} /></svg> Metrics Suite
              </h4>
            </div>
          </div>

          
          <div className={"flex flex-wrap items-center gap-3"}>
            
            <div id={"analytics-custom-dates"} className={"" + (analyticsPeriod === 'custom' ? 'flex' : 'hidden') + " items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800"}>
              <input type={"date"} id={"custom-from"} value={analyticsCustomFrom} onChange={event => {
                onDateChange('from', event.target.value);
              }} className={"bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px] cursor-pointer"} />
              <span className={"text-slate-400 text-xs"}>to</span>
              <input type={"date"} id={"custom-to"} min={customDateLimits?.min} max={customDateLimits?.max} value={analyticsCustomTo} onChange={event => {
                onDateChange('to', event.target.value);
              }} className={"bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px] cursor-pointer"} />
            </div>

            
            <div className={"flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800"}>
              <span className={"text-[10px] font-bold text-slate-400 uppercase tracking-widest"}>Period:</span>
              <select id={"analytics-period-select"} value={analyticsPeriod} onChange={event => {
                onPeriodChange(event.target.value);
              }} className={"bg-transparent text-xs font-bold text-blue-600 dark:text-blue-400 outline-none cursor-pointer"}>
                <option value={"all"}>All Time</option>
                <option value={"today"}>Today</option>
                <option value={"7days"}>Last 7 Days</option>
                <option value={"30days"}>Last 30 Days</option>
                <option value={"12months"}>Last 12 Months</option>
                <option value={"custom"}>Custom Range</option>
              </select>
            </div>

            <div id={"analytics-brand-filter-container"}>{partnerFilter}</div>

            
            <button onClick={() => window.print()} className={"px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 transition-all flex items-center gap-1.5 active:scale-[0.98]"}>
              <svg className={"w-3.5 h-3.5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"} /></svg>
              Export Report
            </button>
          </div>
        </div>
      </div>

      
      <main className={"w-full flex flex-col gap-6 min-w-0"}>
        
        <div className={"px-1"}>
          <h3 className={"text-lg font-black text-slate-800 dark:text-white tracking-tight"} id={"analytics-tab-title"}>{headers[activeAnalyticsTab].title}</h3>
          <p className={"text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5"} id={"analytics-tab-subtitle"}>{headers[activeAnalyticsTab].subtitle}</p>
        </div>

        
        <div id={"analytics-viewport"} className={"w-full flex-1"}>
          {children}
        </div>
      </main>
    </div>
  </>;
}
