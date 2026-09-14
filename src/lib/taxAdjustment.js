// taxAdjustment.js
// -----------------------------------------------------------------------------
// Reusable, framework-agnostic module for illustrating the AFTER-TAX
// consequences of a proposed property division. The Divorce Asset Division Tax
// Adjustment Tool consumes this module; no UI code lives here.
//
// The purpose is to translate face ("book") values into estimated after-tax
// values, so that an equal split of face value can be compared against an equal
// split of after-tax value. This is an educational estimate only.
// -----------------------------------------------------------------------------

import { toNumber } from './format.js'

// Supported asset categories and how each is treated for embedded tax.
// `basis`  — whether cost basis is relevant to the embedded-tax calculation.
// `treatment` — which assumed rate applies to the embedded (unrealized) tax.
export const ASSET_TYPES = [
  {
    id: 'cash',
    label: 'Cash / Bank accounts',
    treatment: 'none',
    usesBasis: false,
    help: 'Already after-tax. No embedded tax is applied.',
  },
  {
    id: 'taxable_investments',
    label: 'Taxable investments (brokerage)',
    treatment: 'capital_gains',
    usesBasis: true,
    help: 'Embedded long-term capital gains tax is estimated on the unrealized gain (value minus cost basis).',
  },
  {
    id: 'primary_residence',
    label: 'Primary residence',
    treatment: 'residence',
    usesBasis: true,
    help: 'Capital gains tax is estimated only on the gain above the assumed home-sale exclusion.',
  },
  {
    id: 'investment_real_estate',
    label: 'Investment real estate',
    treatment: 'capital_gains',
    usesBasis: true,
    help: 'Capital gains tax is estimated on the gain. Depreciation recapture is not separately modeled.',
  },
  {
    id: 'business_interest',
    label: 'Business interest',
    treatment: 'capital_gains',
    usesBasis: true,
    help: 'Capital gains tax is estimated on the gain over basis. Actual sale treatment varies widely.',
  },
  {
    id: 'retirement_pretax',
    label: 'Pre-tax retirement (Traditional IRA / 401k)',
    treatment: 'ordinary',
    usesBasis: false,
    help: 'Future withdrawals are taxed as ordinary income; the full balance carries embedded tax at the assumed ordinary rate.',
  },
  {
    id: 'retirement_roth',
    label: 'Roth retirement account',
    treatment: 'none',
    usesBasis: false,
    help: 'Qualified withdrawals are tax-free. No embedded tax is applied.',
  },
  {
    id: 'hsa',
    label: 'HSA balance',
    treatment: 'none',
    usesBasis: false,
    help: 'Treated as after-tax here; qualified medical withdrawals are tax-free, and this tool does not model non-qualified withdrawal penalties.',
  },
  {
    id: 'education_529',
    label: '529 college savings',
    treatment: 'none',
    usesBasis: false,
    help: 'Treated as after-tax here; qualified education withdrawals are tax-free, and this tool does not model non-qualified withdrawal penalties.',
  },
  {
    id: 'other',
    label: 'Other asset',
    treatment: 'none',
    usesBasis: false,
    help: 'Treated as after-tax unless you categorize it otherwise.',
  },
]

export function getAssetType(id) {
  return ASSET_TYPES.find((t) => t.id === id) || ASSET_TYPES[ASSET_TYPES.length - 1]
}

export const DEFAULT_RATES = {
  capitalGainsRate: 0.238, // 20% fed LTCG + 3.8% NIIT, illustrative top-end
  ordinaryRate: 0.32, // assumed marginal ordinary rate on pre-tax accounts
  residenceExclusion: 500000, // assumed §121 exclusion (married filing jointly)
}

// Estimate the embedded (built-in) tax and after-tax value of a single asset.
// asset: { value, basis, type }
// rates: { capitalGainsRate, ordinaryRate, residenceExclusion }
export function afterTaxValueOfAsset(asset, rates = DEFAULT_RATES) {
  const value = toNumber(asset.value)
  const basis = toNumber(asset.basis)
  const type = getAssetType(asset.type)

  let embeddedTax = 0

  switch (type.treatment) {
    case 'capital_gains': {
      const gain = Math.max(0, value - basis)
      embeddedTax = gain * rates.capitalGainsRate
      break
    }
    case 'residence': {
      const gain = Math.max(0, value - basis)
      const taxableGain = Math.max(0, gain - toNumber(rates.residenceExclusion))
      embeddedTax = taxableGain * rates.capitalGainsRate
      break
    }
    case 'ordinary': {
      embeddedTax = Math.max(0, value) * rates.ordinaryRate
      break
    }
    case 'none':
    default:
      embeddedTax = 0
  }

  const afterTax = value - embeddedTax
  const effectiveRate = value > 0 ? embeddedTax / value : 0

  return {
    grossValue: value,
    embeddedTax,
    afterTax,
    effectiveRate,
    treatment: type.treatment,
  }
}

// Split a value between two spouses given spouse-A allocation percentage.
function splitByAllocation(amount, allocationAtoPct) {
  const a = Math.max(0, Math.min(100, toNumber(allocationAtoPct))) / 100
  return { a: amount * a, b: amount * (1 - a) }
}

// Compute the full division across all assets.
// assets: [{ id, label, value, basis, type, allocationA }] where allocationA is
//   the percentage (0-100) of that asset assigned to Spouse A.
// Returns gross and after-tax totals per spouse plus equalization analysis.
export function computeDivision(assets, rates = DEFAULT_RATES, names = { a: 'Spouse A', b: 'Spouse B' }) {
  const lines = assets.map((asset) => {
    const valuation = afterTaxValueOfAsset(asset, rates)
    const gross = splitByAllocation(valuation.grossValue, asset.allocationA)
    const afterTax = splitByAllocation(valuation.afterTax, asset.allocationA)
    return { asset, valuation, gross, afterTax }
  })

  const totals = lines.reduce(
    (acc, l) => {
      acc.grossA += l.gross.a
      acc.grossB += l.gross.b
      acc.afterTaxA += l.afterTax.a
      acc.afterTaxB += l.afterTax.b
      acc.grossTotal += l.valuation.grossValue
      acc.afterTaxTotal += l.valuation.afterTax
      acc.embeddedTaxTotal += l.valuation.embeddedTax
      return acc
    },
    {
      grossA: 0,
      grossB: 0,
      afterTaxA: 0,
      afterTaxB: 0,
      grossTotal: 0,
      afterTaxTotal: 0,
      embeddedTaxTotal: 0,
    }
  )

  // Equalization: the cash payment from the higher-share spouse to the lower
  // that would make the two shares equal. Shown on both a face-value basis and
  // an after-tax basis to illustrate how embedded taxes shift a "50/50" split.
  const grossGap = totals.grossA - totals.grossB
  const afterTaxGap = totals.afterTaxA - totals.afterTaxB

  const grossEqualization = {
    from: grossGap > 0 ? 'a' : 'b',
    to: grossGap > 0 ? 'b' : 'a',
    amount: Math.abs(grossGap) / 2,
  }
  const afterTaxEqualization = {
    from: afterTaxGap > 0 ? 'a' : 'b',
    to: afterTaxGap > 0 ? 'b' : 'a',
    amount: Math.abs(afterTaxGap) / 2,
  }

  return {
    lines,
    totals,
    names,
    grossGap,
    afterTaxGap,
    grossEqualization,
    afterTaxEqualization,
    // How much the equalizing payment changes once taxes are considered.
    equalizationDelta: afterTaxEqualization.amount - grossEqualization.amount,
    grossSharePctA: totals.grossTotal > 0 ? (totals.grossA / totals.grossTotal) * 100 : 0,
    afterTaxSharePctA:
      totals.afterTaxTotal > 0 ? (totals.afterTaxA / totals.afterTaxTotal) * 100 : 0,
  }
}

export default {
  ASSET_TYPES,
  getAssetType,
  DEFAULT_RATES,
  afterTaxValueOfAsset,
  computeDivision,
}
