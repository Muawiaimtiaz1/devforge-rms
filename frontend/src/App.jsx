import { lazy, Suspense } from 'react'

const StaffDirectory = lazy(() => import('./modules/staff/StaffDirectory'))
const Lobby = lazy(() => import('./modules/lobby/Lobby'))

function RouteLoader() {
  return (
    <main className="route-loader" aria-label="Loading application">
      <div className="route-loader-spinner" />
      <span>Loading workspace…</span>
    </main>
  )
}

function App() {
  const page = window.location.pathname.startsWith('/app/staff') ? <StaffDirectory /> : <Lobby />
  return <Suspense fallback={<RouteLoader />}>{page}</Suspense>
}

export default App
