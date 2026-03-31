import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Sessions from './pages/Sessions'
import SessionDetail from './pages/SessionDetail'
import Knowledgebases from './pages/Databases'
import Redis from './pages/Redis'
import VectorBrowser from './pages/VectorBrowser'
import Analytics from './pages/Analytics'
import HierarchicalGraph from './pages/HierarchicalGraph'
import NotFound from './pages/NotFound'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="sessions/:sessionId" element={<SessionDetail />} />
          <Route path="knowledgebases" element={<Knowledgebases />} />
          <Route path="databases" element={<Navigate to="/knowledgebases" replace />} />
          <Route path="redis" element={<Redis />} />
          <Route path="vectors" element={<VectorBrowser />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="hierarchy" element={<HierarchicalGraph />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
