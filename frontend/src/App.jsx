import { lazy, Suspense } from 'react'

const StaffDirectory = lazy(() => import('./modules/staff/StaffDirectory'))
const Lobby = lazy(() => import('./modules/lobby/Lobby'))
const ChangePassword = lazy(() => import('./modules/auth/ChangePassword'))
const LoginPage = lazy(() => import('./modules/auth/LoginPage'))
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage'))
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'))
const NotificationsPage = lazy(() => import('./modules/notifications/NotificationsPage'))

function RouteLoader() {
  return (
    <main className="route-loader" aria-label="Loading application">
      <div className="route-loader-spinner" />
      <span>Loading workspace…</span>
    </main>
  )
}

function App() {
  const page = window.location.pathname.startsWith('/app/change-password')
    ? <ChangePassword />
    : window.location.pathname.startsWith('/app/login') ? <LoginPage />
      : window.location.pathname.startsWith('/app/staff') ? <StaffDirectory />
      : window.location.pathname.startsWith('/app/inventory') ? <InventoryPage />
        : window.location.pathname.startsWith('/app/dashboard') ? <DashboardPage />
          : window.location.pathname.startsWith('/app/notification-inbox') ? <NotificationsPage channel={'inbox'} />
            : window.location.pathname.startsWith('/app/notifications') ? <NotificationsPage channel={'platform'} /> : <Lobby />
  return <Suspense fallback={<RouteLoader />}>{page}</Suspense>
}

export default App
