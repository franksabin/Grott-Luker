// Simplified state income-tax reference used for estimates only.
// Rates are approximate top-of-schedule / representative marginal rates for
// 2025 and are intentionally simplified — real state tax depends on brackets,
// residency, sourcing, and the character of income. Every tool that consumes
// this discloses the simplification in its Assumptions section.
//
// `wage` — representative rate applied to ordinary income.
// `capGains` — rate applied to long-term capital gains (most states tax
//   capital gains as ordinary income; exceptions are encoded individually).

export const STATES = [
  { code: 'AL', name: 'Alabama', wage: 5.0, capGains: 5.0 },
  { code: 'AK', name: 'Alaska', wage: 0, capGains: 0 },
  { code: 'AZ', name: 'Arizona', wage: 2.5, capGains: 2.5 },
  { code: 'AR', name: 'Arkansas', wage: 3.9, capGains: 3.9 },
  { code: 'CA', name: 'California', wage: 13.3, capGains: 13.3 },
  { code: 'CO', name: 'Colorado', wage: 4.4, capGains: 4.4 },
  { code: 'CT', name: 'Connecticut', wage: 6.99, capGains: 6.99 },
  { code: 'DE', name: 'Delaware', wage: 6.6, capGains: 6.6 },
  { code: 'DC', name: 'District of Columbia', wage: 10.75, capGains: 10.75 },
  { code: 'FL', name: 'Florida', wage: 0, capGains: 0 },
  { code: 'GA', name: 'Georgia', wage: 5.39, capGains: 5.39 },
  { code: 'HI', name: 'Hawaii', wage: 11.0, capGains: 7.25 },
  { code: 'ID', name: 'Idaho', wage: 5.695, capGains: 5.695 },
  { code: 'IL', name: 'Illinois', wage: 4.95, capGains: 4.95 },
  { code: 'IN', name: 'Indiana', wage: 3.0, capGains: 3.0 },
  { code: 'IA', name: 'Iowa', wage: 3.8, capGains: 3.8 },
  { code: 'KS', name: 'Kansas', wage: 5.58, capGains: 5.58 },
  { code: 'KY', name: 'Kentucky', wage: 4.0, capGains: 4.0 },
  { code: 'LA', name: 'Louisiana', wage: 3.0, capGains: 3.0 },
  { code: 'ME', name: 'Maine', wage: 7.15, capGains: 7.15 },
  { code: 'MD', name: 'Maryland', wage: 5.75, capGains: 5.75 },
  { code: 'MA', name: 'Massachusetts', wage: 5.0, capGains: 5.0 },
  { code: 'MI', name: 'Michigan', wage: 4.25, capGains: 4.25 },
  { code: 'MN', name: 'Minnesota', wage: 9.85, capGains: 9.85 },
  { code: 'MS', name: 'Mississippi', wage: 4.4, capGains: 4.4 },
  { code: 'MO', name: 'Missouri', wage: 4.7, capGains: 4.7 },
  { code: 'MT', name: 'Montana', wage: 5.9, capGains: 4.1 },
  { code: 'NE', name: 'Nebraska', wage: 5.2, capGains: 5.2 },
  { code: 'NV', name: 'Nevada', wage: 0, capGains: 0 },
  { code: 'NH', name: 'New Hampshire', wage: 0, capGains: 0 },
  { code: 'NJ', name: 'New Jersey', wage: 10.75, capGains: 10.75 },
  { code: 'NM', name: 'New Mexico', wage: 5.9, capGains: 5.9 },
  { code: 'NY', name: 'New York', wage: 10.9, capGains: 10.9 },
  { code: 'NC', name: 'North Carolina', wage: 4.25, capGains: 4.25 },
  { code: 'ND', name: 'North Dakota', wage: 2.5, capGains: 2.5 },
  { code: 'OH', name: 'Ohio', wage: 3.5, capGains: 3.5 },
  { code: 'OK', name: 'Oklahoma', wage: 4.75, capGains: 4.75 },
  { code: 'OR', name: 'Oregon', wage: 9.9, capGains: 9.9 },
  { code: 'PA', name: 'Pennsylvania', wage: 3.07, capGains: 3.07 },
  { code: 'RI', name: 'Rhode Island', wage: 5.99, capGains: 5.99 },
  { code: 'SC', name: 'South Carolina', wage: 6.2, capGains: 6.2 },
  { code: 'SD', name: 'South Dakota', wage: 0, capGains: 0 },
  { code: 'TN', name: 'Tennessee', wage: 0, capGains: 0 },
  { code: 'TX', name: 'Texas', wage: 0, capGains: 0 },
  { code: 'UT', name: 'Utah', wage: 4.55, capGains: 4.55 },
  { code: 'VT', name: 'Vermont', wage: 8.75, capGains: 8.75 },
  { code: 'VA', name: 'Virginia', wage: 5.75, capGains: 5.75 },
  { code: 'WA', name: 'Washington', wage: 0, capGains: 7.0 }, // 7% LTCG excise over threshold
  { code: 'WV', name: 'West Virginia', wage: 4.82, capGains: 4.82 },
  { code: 'WI', name: 'Wisconsin', wage: 7.65, capGains: 7.65 },
  { code: 'WY', name: 'Wyoming', wage: 0, capGains: 0 },
]

export function getState(code) {
  return STATES.find((s) => s.code === code) || STATES.find((s) => s.code === 'NH')
}
