import { useState, useEffect } from "react";
import { useAnalyticsShell } from "./useAnalyticsShell";
import { QuickMenu } from "./QuickMenu";
export function AnalyticsTopbar({
  user
}) {
  const {
    data,
    dark,
    setDark,
    profileOpen,
    setProfileOpen,
    unreadCount,
    profileRef,
    openModule,
    logout,
    installApp,
    enableNotifications
  } = useAnalyticsShell();
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => {
    const close = event => {
      if (event.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return <>{<header id={"top-nav"} className={"fixed top-0 left-0 w-full h-16 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 z-50 flex items-center justify-between px-6 transition-colors duration-300 shadow-sm"}>

        
        <div className={"flex items-center gap-4"}>
            <button onClick={() => setQuickOpen(value => !value)} id="quick-menu-btn" className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-800">
                <svg className={"w-5 h-5 transform transition-transform " + (quickOpen ? "" : "rotate-180")} id={"quick-menu-arrow"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}>
                    <path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
                </svg>
            </button>

            
            <div className={"flex items-center gap-3 min-w-fit"} id={"header-branding"}>
                <div className={"w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-900/20"}>
                    <svg className={"w-5 h-5 text-white"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}>
                        <path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"} />
                    </svg>
                </div>
                <div className={"hidden sm:block"}>
                    <div className={"font-bold text-gray-900 dark:text-white text-sm tracking-tight leading-none"} id={"header-shop-name"}>{user.shop_name || "POS System"}</div>
                    <div className={"text-[9px] text-gray-500 dark:text-slate-500 uppercase tracking-widest font-bold mt-0.5"} id={"header-shop-mgmt"}>{user.role === "superadmin" ? "Master Control" : "Restaurant Management"}</div>
                </div>
            </div>
        </div>
        
        <div id={"lobby-controls"} className={"flex-1 flex items-center justify-end px-4 gap-4 sm:gap-6"}>
            
        
        <div className={"flex items-center gap-3"}>
            <div className={"hidden lg:flex flex-col items-end mr-3"}>
                <div className={"text-[11px] font-bold text-gray-900 dark:text-white leading-none truncate max-w-[120px]"} id={"user-name-sidebar"}>{user.name || user.username}</div>
                <div className={"text-[9px] text-gray-500 uppercase font-black tracking-widest mt-0.5"} id={"user-role-sidebar"}>{user.role}</div>
            </div>

            <button onClick={() => {
            openModule({
              id: 'notification-inbox',
              frontend: 'react',
              target: '/app/notification-inbox'
            });
          }} id={"topbar-notification-btn"} className={"relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-800 " + (data?.modules.some(module => module.id === "notifications") ? "" : "hidden") + ""} title={"Notifications"}>
                <svg className={"w-5 h-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}>
                    <path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 01-6 0m6 0H9"} />
                </svg>
                <span id={"topbar-notification-count"} className={"" + (unreadCount ? "" : "hidden") + " absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-white text-[10px] font-black leading-[18px] text-center shadow-md shadow-teal-900/20"}>{unreadCount}</span>
            </button>

            
            <button id={"switch-module-btn"} onClick={() => {
            window.location.assign('/app/lobby');
          }} className={"flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-800"} title={"Switch Module"}>
                <svg className={"w-5 h-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}>
                    <path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"} />
                </svg>
            </button>

            
            <div className={"relative"} ref={profileRef}>
                <button id={"profile-trigger"} onClick={event => {event.stopPropagation(); setProfileOpen(value => !value)}} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1.5 pr-2 text-slate-600 transition-all hover:border-indigo-200 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:bg-slate-700" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={profileOpen}>
                    <span id={"user-avatar"} className={"flex h-8 w-8 items-center justify-center text-sm font-black text-white shadow-sm"}>{String(user.name || user.username).charAt(0).toUpperCase()}</span>
                    <svg className={"h-4 w-4"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"} aria-hidden={"true"}>
                        <path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M19 9l-7 7-7-7"} />
                    </svg>
                </button>

                <div id={"profile-dropdown"} role={"menu"} aria-label={"Profile options"} className={"" + (profileOpen ? "active" : "") + " absolute right-0 top-[calc(100%+0.75rem)] w-64 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900"}>
                    <div className={"border-b border-slate-100 px-4 py-3 dark:border-slate-800 lg:hidden"}>
                        <p id={"profile-menu-name"} className={"truncate text-sm font-bold text-slate-900 dark:text-white"}>{user.name || user.username}</p>
                        <p id={"profile-menu-role"} className={"mt-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400"}>{user.role}</p>
                    </div>
                    <button type={"button"} role={"menuitem"} className={"dropdown-item w-full"} onClick={() => {setDark(value => !value); setProfileOpen(false)}}>
                        <svg className={"h-5 w-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"} /></svg>
                        <span id={"profile-theme-label"}>{dark ? "Switch to light mode" : "Switch to dark mode"}</span>
                    </button>
                    <button type={"button"} role={"menuitem"} className={"dropdown-item w-full"} onClick={() => {
                installApp();
                setProfileOpen(false);
              }}>
                        <svg className={"h-5 w-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"} /></svg>
                        <span>Download app</span>
                    </button>
                    <button id={"pwa-device-btn"} type={"button"} role={"menuitem"} className={"dropdown-item w-full"} onClick={() => {
                setProfileOpen(false);
                enableNotifications();
              }} title={"Install app and notification settings"}>
                        <svg className={"h-5 w-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 01-6 0m6 0H9"} /></svg>
                        <span>Device notifications</span>
                    </button>
                    <div className={"border-t border-slate-100 dark:border-slate-800"}>
                        <button type={"button"} role={"menuitem"} className={"dropdown-item w-full !text-rose-600 dark:!text-rose-400"} onClick={() => {
                  setProfileOpen(false);
                  logout();
                }}>
                            <svg className={"h-5 w-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"} /></svg>
                            <span>Sign out</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
            </div></header>}<QuickMenu open={quickOpen} modules={data?.modules || []} onClose={() => setQuickOpen(false)} openModule={openModule} /></>;
}
