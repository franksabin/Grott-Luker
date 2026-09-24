// 1031 exchange model: several relinquished and replacement assets, real
// property (qualifies) and equipment (does not — taxable sale with §1245
// recapture), percentage closing costs, and cash taken out or brought in.
import { capitalGainsTax, niitTax, marginalOrdinaryRate, STANDARD_DEDUCTION } from './tax.js'
import { toNumber } from './format.js'

export const MAX_ASSETS = 3
export const ID_DAYS = 45
export const CLOSE_DAYS = 180
export const SEC1250_CAP = 0.25 // unrecaptured §1250 gain: ordinary rate capped at 25%

export const DEFAULT_SELL_COST_PCT = 6 // commissions, transfer tax, legal, QI fee on the sale side
export const DEFAULT_BUY_COST_PCT = 2 // title, recording, lender, legal on the purchase side

export const ASSET_TYPES = [
  { value: 'real', label: 'Real property' },
  { value: 'equipment', label: 'Equipment / other' },
]

let seq = 0
export const newId = () => `x${Date.now().toString(36)}${(seq++).toString(36)}`

export const blankAsset = (over = {}) => ({
  id: newId(),
  name: '',
  type: 'real',
  price: '',
  cost: '',
  depreciation: '',
  debt: '',
  ...over,
})

const n = (v) => Math.max(0, toNumber(v))

// One relinquished asset, priced and costed.
function sold(a, sellPct) {
  const price = n(a.price)
  const costs = price * sellPct
  const cost = n(a.cost)
  const depreciation = Math.min(n(a.depreciation), cost)
  const adjustedBasis = cost - depreciation
  const amountRealized = price - costs
  const gain = amountRealized - adjustedBasis // may be negative
  return { ...a, price, costs, cost, depreciation, adjustedBasis, amountRealized, gain, debt: n(a.debt), isReal: a.type !== 'equipment' }
}

// One replacement asset, priced and costed.
function bought(a, buyPct) {
  const price = n(a.price)
  const costs = price * buyPct
  return { ...a, price, costs, total: price + costs, debt: n(a.debt), isReal: a.type !== 'equipment' }
}

// Tax on recognized real-property gain: §1250 portion first (ordinary, capped
// at 25%), the rest at 0/15/20% stacked above other taxable income, NIIT on the
// gain above the MAGI threshold, flat state rate.
function taxOnRealGain(gain, depreciation, otherTaxable, otherIncome, filing, stateRate, marginal) {
  const g = Math.max(0, gain)
  const unrecap = Math.min(g, Math.max(0, depreciation))
  const capital = g - unrecap
  const rate1250 = Math.min(SEC1250_CAP, marginal)
  const tax1250 = unrecap * rate1250
  const taxLtcg = capitalGainsTax(capital, otherTaxable + unrecap, filing)
  const niit = niitTax(g, otherIncome + g, filing)
  const state = g * stateRate
  return { gain: g, unrecap, capital, rate1250, tax1250, taxLtcg, niit, state, total: tax1250 + taxLtcg + niit + state }
}

// inputs: { relinquished: [], replacement: [], sellPct, buyPct, otherCosts,
//           cashOut, filing, otherIncome, stateRate, expenseEquipment }
export function computeExchange(i) {
  const filing = i.filing === 'single' ? 'single' : 'married'
  const sellPct = Math.max(0, i.sellPct || 0) / 100
  const buyPct = Math.max(0, i.buyPct || 0) / 100
  const otherCosts = n(i.otherCosts)
  const cashOutRequested = n(i.cashOut)
  const otherIncome = n(i.otherIncome)
  const stateRate = Math.max(0, i.stateRate || 0)
  const expenseEquipment = i.expenseEquipment !== false

  const rel = (i.relinquished || []).map((a) => sold(a, sellPct)).filter((a) => a.price > 0 || a.cost > 0)
  const rep = (i.replacement || []).map((a) => bought(a, buyPct)).filter((a) => a.price > 0)
  const relReal = rel.filter((a) => a.isReal)
  const relEquip = rel.filter((a) => !a.isReal)
  const repReal = rep.filter((a) => a.isReal)
  const repEquip = rep.filter((a) => !a.isReal)

  // ---- Real property: the exchange group ----
  const sum = (arr, k) => arr.reduce((s, a) => s + a[k], 0)
  const salePrice = sum(relReal, 'price')
  const sellingCosts = sum(relReal, 'costs') + otherCosts
  const amountRealized = Math.max(0, salePrice - sellingCosts)
  const adjustedBasis = sum(relReal, 'adjustedBasis')
  const depreciation = sum(relReal, 'depreciation')
  const realizedGain = Math.max(0, amountRealized - adjustedBasis) // losses on one property net against gains on another (simplification)
  const oldDebt = sum(relReal, 'debt')
  const netEquity = Math.max(0, amountRealized - oldDebt) // what the intermediary holds

  const replacementPrice = sum(repReal, 'price')
  const replacementCosts = sum(repReal, 'costs')
  const replacementTotal = replacementPrice + replacementCosts
  const newDebt = sum(repReal, 'debt')
  const equityIn = Math.max(0, replacementTotal - newDebt) // cash needed to close the replacements

  const cashOut = Math.min(cashOutRequested, netEquity)
  const available = netEquity - cashOut
  const surplus = Math.max(0, available - equityIn) // proceeds not reinvested → also boot
  const cashBoot = cashOut + surplus
  const cashAdded = Math.max(0, equityIn - available) // fresh cash the taxpayer brings
  const debtRelief = Math.max(0, oldDebt - newDebt)
  const mortgageBoot = Math.max(0, debtRelief - cashAdded)
  const totalBoot = cashBoot + mortgageBoot
  const recognizedGain = Math.min(realizedGain, totalBoot)
  const deferredGain = realizedGain - recognizedGain
  const replacementBasis = Math.max(0, replacementTotal - deferredGain)
  const isFull = realizedGain > 0 && recognizedGain === 0

  // Allocate carryover basis across the replacement properties by price.
  const repRealAllocated = repReal.map((a) => ({
    ...a,
    basis: replacementTotal > 0 ? replacementBasis * (a.total / replacementTotal) : 0,
    deferredShare: replacementTotal > 0 ? deferredGain * (a.total / replacementTotal) : 0,
  }))

  const otherTaxable = Math.max(0, otherIncome - STANDARD_DEDUCTION[filing])
  const marginal = marginalOrdinaryRate(otherTaxable, filing)
  const exchangeTax = taxOnRealGain(recognizedGain, depreciation, otherTaxable, otherIncome, filing, stateRate, marginal)
  const saleTax = taxOnRealGain(realizedGain, depreciation, otherTaxable, otherIncome, filing, stateRate, marginal)

  // ---- Equipment and other personal property: outside the exchange ----
  const equipSold = relEquip.map((a) => {
    const gain = a.gain
    const recapture = Math.max(0, Math.min(gain, a.depreciation)) // §1245: ordinary
    const sec1231 = Math.max(0, gain - recapture) // treated as long-term capital gain
    const loss = Math.max(0, -gain)
    return { ...a, recapture, sec1231, loss }
  })
  const equipRecapture = sum(equipSold, 'recapture')
  const equipSec1231 = sum(equipSold, 'sec1231')
  const equipLoss = sum(equipSold, 'loss')
  const equipProceeds = sum(equipSold, 'amountRealized') - sum(equipSold, 'debt')
  const equipBoughtTotal = sum(repEquip, 'total')
  const equipNewDebt = sum(repEquip, 'debt')
  // 100% bonus depreciation on the new equipment offsets ordinary income, recapture first.
  const bonus = expenseEquipment ? equipBoughtTotal : 0
  const ordinaryNet = equipRecapture - equipLoss - bonus // may be negative → deduction against other income
  const equipOrdinaryTax = ordinaryNet * marginal // negative means tax saved
  const equipCapitalTax = capitalGainsTax(equipSec1231, otherTaxable + Math.max(0, ordinaryNet) + exchangeTax.unrecap, filing)
  const equipStateTax = (Math.max(0, ordinaryNet) + equipSec1231) * stateRate - Math.max(0, -ordinaryNet) * stateRate
  const equipTax = equipOrdinaryTax + equipCapitalTax + equipStateTax
  const equipCashNeeded = Math.max(0, equipBoughtTotal - equipNewDebt)

  // ---- Totals ----
  const taxNow = exchangeTax.total + equipTax
  const taxSale = saleTax.total + equipTax
  const cashPosition = cashBoot - cashAdded + equipProceeds - equipCashNeeded - taxNow // taxpayer's net cash after everything closes
  const cashAfterSale = netEquity + equipProceeds - equipCashNeeded - taxSale

  const fixParts = []
  if (cashBoot > 0) fixParts.push(`reinvest the ${Math.round(cashBoot).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} taken out`)
  if (mortgageBoot > 0) fixParts.push(`replace ${Math.round(mortgageBoot).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} of debt or add that much cash`)

  return {
    filing, sellPct, buyPct, otherCosts, otherIncome, stateRate, marginal, expenseEquipment,
    rel, rep, relReal, relEquip, repReal: repRealAllocated, repEquip,
    salePrice, sellingCosts, amountRealized, adjustedBasis, depreciation, realizedGain, oldDebt, netEquity,
    replacementPrice, replacementCosts, replacementTotal, newDebt, equityIn,
    cashOutRequested, cashOut, surplus, cashBoot, cashAdded, debtRelief, mortgageBoot, totalBoot,
    recognizedGain, deferredGain, replacementBasis, isFull,
    exchangeTax, saleTax,
    equipSold, equipRecapture, equipSec1231, equipLoss, equipProceeds, equipBoughtTotal, equipNewDebt, bonus, ordinaryNet,
    equipOrdinaryTax, equipCapitalTax, equipStateTax, equipTax, equipCashNeeded,
    taxNow, taxSale, cashPosition, cashAfterSale, fullFix: fixParts.join(' and '),
    ready: relReal.length > 0 && salePrice > 0,
  }
}

export function addDays(iso, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d
}
