// Dump the expense guide + mileage rates to JSON for the Excel template builder.
import { CATEGORIES, INDUSTRIES, TREATMENTS } from '../src/lib/expenseGuide.js'
import { RATE_PERIODS, PURPOSES, TAX_YEARS } from '../src/lib/mileage.js'
import { GIFT_TYPES, THRESHOLDS } from '../src/lib/donations.js'
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('./guide.json', import.meta.url), JSON.stringify({ CATEGORIES, INDUSTRIES, TREATMENTS, RATE_PERIODS, PURPOSES, TAX_YEARS, GIFT_TYPES, THRESHOLDS }, null, 1))
console.log('industries', INDUSTRIES.length, 'max attention', Math.max(...INDUSTRIES.map(i => i.attention.length)), 'max avoid', Math.max(...INDUSTRIES.map(i => i.avoid.length)), 'categories', CATEGORIES.length)
