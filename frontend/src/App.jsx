import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Import from './pages/Import'
import Review from './pages/Review'
import Search from './pages/Search'
import AIQueue from './pages/AIQueue'
import DirtyFiles from './pages/DirtyFiles'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/review/:queueId" element={<Review />} />
          <Route path="/search" element={<Search />} />
          <Route path="/ai-queue" element={<AIQueue />} />
          <Route path="/dirty" element={<DirtyFiles />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
