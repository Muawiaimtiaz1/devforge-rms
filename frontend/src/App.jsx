import StaffDirectory from './modules/staff/StaffDirectory'
import Lobby from './modules/lobby/Lobby'

function App() {
  return window.location.pathname.startsWith('/app/staff') ? <StaffDirectory /> : <Lobby />
}

export default App
