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

// In development (status: 'testing' in lib/tools.js)
import RetirementTaxMap from './pages/RetirementTaxMap.jsx'
import BusinessSale from './pages/BusinessSale.jsx'
import ConcentratedWealth from './pages/ConcentratedWealth.jsx'

// Client-facing intake + the CPA-side viewer for what clients submit
import ClientKnowYourNumbers from './pages/ClientKnowYourNumbers.jsx'
import ClientResults from './pages/ClientResults.jsx'

export default function App() {
  return (
    <Routes>
      {/* Internal CPA toolkit */}
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
        {/* In development */}
        <Route path="tools/retirement-tax-map" element={<RetirementTaxMap />} />
        <Route path="tools/business-sale" element={<BusinessSale />} />
        <Route path="tools/concentrated-wealth" element={<ConcentratedWealth />} />
        {/* Submissions from clients */}
        <Route path="client-results" element={<ClientResults />} />
      </Route>

      {/* Public, client-facing — no links back into the toolkit */}
      <Route path="/client" element={<Layout client />}>
        <Route path="know-your-numbers" element={<ClientKnowYourNumbers />} />
      </Route>
    </Routes>
  )
}
