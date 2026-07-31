import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'

// CPA Decision Support Toolkit
import RothConversion from './pages/RothConversion.jsx'
import OwnerComp from './pages/OwnerComp.jsx'
import EstimatedTax from './pages/EstimatedTax.jsx'
import MultiYearProjection from './pages/MultiYearProjection.jsx'
import QbiOptimizer from './pages/QbiOptimizer.jsx'

// BlueLine Specialty Planning Tools
import RetireTrack from './pages/RetireTrack.jsx'
import CashBalance from './pages/CashBalance.jsx'
import Rollover401k from './pages/Rollover401k.jsx'
import DivorceDivision from './pages/DivorceDivision.jsx'
import KnowYourNumbers from './pages/KnowYourNumbers.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        {/* CPA */}
        <Route path="tools/roth-conversion" element={<RothConversion />} />
        <Route path="tools/owner-comp" element={<OwnerComp />} />
        <Route path="tools/estimated-tax" element={<EstimatedTax />} />
        <Route path="tools/multi-year-projection" element={<MultiYearProjection />} />
        <Route path="tools/qbi-optimizer" element={<QbiOptimizer />} />
        {/* BlueLine */}
        <Route path="tools/retire-track" element={<RetireTrack />} />
        <Route path="tools/cash-balance" element={<CashBalance />} />
        <Route path="tools/rollover-401k" element={<Rollover401k />} />
        <Route path="tools/divorce-division" element={<DivorceDivision />} />
        <Route path="tools/know-your-numbers" element={<KnowYourNumbers />} />
      </Route>
    </Routes>
  )
}
