// Expense categories and line-of-work guidance for the Mileage & Expense Log.
//
// Pure JS, shared by the React pages, the Worker, and the dev API.
//
// CATEGORIES carry how the log treats an expense in the estimate:
//   treatment 'ok'      counted in full
//             'limited' counted at `share` (business meals at 50%)
//             'ask'     recorded and totaled separately for the CPA, not counted,
//                       because the answer depends on facts the log cannot see
//                       (business-use %, cost per item, exclusive use)
//             'not'     recorded so the CPA sees it, counted at zero
//
// INDUSTRIES are the CPAs' request: "if you are a carpenter, pay extra
// attention to these." Each has `attention`, the specific items people in that
// work tend to forget to log (client-facing wording, each tied to a category,
// one click adds it to the log), and `avoid`, the things they tend to claim
// that are not deductible. Rules are general 2026 federal treatment; the CPA
// decides. Review each January.

export const CATEGORIES = [
  { id: 'meal', label: 'Business meal', treatment: 'limited', share: 0.5, note: '50% when business is discussed and you or an employee is present. Note who and what.' },
  { id: 'entertainment', label: 'Entertainment', treatment: 'not', share: 0, note: 'Not deductible since 2018, even with clients: tickets, golf, shows.' },
  { id: 'travel', label: 'Travel: lodging, airfare, rail, rental car', treatment: 'ok', share: 1, note: 'Overnight business travel away from your tax home. Meals on the trip go under Business meal.' },
  { id: 'parking', label: 'Parking & tolls', treatment: 'ok', share: 1, note: 'Deductible on top of the standard mileage rate. Parking at your regular workplace is commuting.' },
  { id: 'supplies', label: 'Supplies & materials', treatment: 'ok', share: 1, note: 'Consumed in the work: materials, small items, office supplies, fuel for equipment.' },
  { id: 'equipment', label: 'Equipment, tools & furniture', treatment: 'ask', share: 1, note: 'Items under $2,500 each can usually be expensed under the de minimis safe harbor; larger items are depreciated or expensed under §179. Note the cost per item.' },
  { id: 'software', label: 'Software & subscriptions', treatment: 'ok', share: 1, note: 'Business apps, cloud services, trade publications.' },
  { id: 'phone', label: 'Phone & internet', treatment: 'ask', share: 1, note: 'Only the business-use share is deductible. Enter the full bill and note the percentage, or enter the business portion.' },
  { id: 'homeoffice', label: 'Home office', treatment: 'ask', share: 1, note: 'Requires regular and exclusive business use of the space. Your CPA will compute it (simplified $5 per square foot or actual).' },
  { id: 'utilities', label: 'Utilities for business space', treatment: 'ok', share: 1, note: 'Electric, heat, water, trash for a shop, store, or office you rent or own. Home utilities belong under Home office.' },
  { id: 'education', label: 'Continuing education, licenses & certifications', treatment: 'ok', share: 1, note: 'Maintains or improves skills in your current work. Education to qualify for a new trade is not deductible.' },
  { id: 'dues', label: 'Professional dues & memberships', treatment: 'ok', share: 1, note: 'Trade and professional organizations, unions, licensing boards. Country, athletic, and social club dues are not deductible.' },
  { id: 'advertising', label: 'Advertising & marketing', treatment: 'ok', share: 1, note: 'Ads, website, signage, printing, sponsorships with a business purpose.' },
  { id: 'insurance', label: 'Business insurance', treatment: 'ok', share: 1, note: 'Liability, malpractice, property, tools, business auto. Health premiums are a separate deduction.' },
  { id: 'fees', label: 'Professional, legal & permit fees', treatment: 'ok', share: 1, note: 'Accountant, attorney, consultants, payroll service, permits, disposal fees.' },
  { id: 'rent', label: 'Rent: office, booth, shop, storage, equipment', treatment: 'ok', share: 1, note: 'Rent paid for business space or equipment you do not own.' },
  { id: 'payroll', label: 'Contract labor & wages', treatment: 'ok', share: 1, note: 'Form 1099-NEC is required for contractors paid $2,000 or more in 2026.' },
  { id: 'cogs', label: 'Inventory & cost of goods', treatment: 'ask', share: 1, note: 'Runs through cost of goods sold, not expenses, and depends on year-end inventory. Log it; your CPA will place it.' },
  { id: 'shipping', label: 'Shipping & postage', treatment: 'ok', share: 1, note: '' },
  { id: 'bank', label: 'Bank, card & platform fees', treatment: 'ok', share: 1, note: 'Card processing, business account fees, marketplace and app commissions.' },
  { id: 'uniforms', label: 'Uniforms & protective gear', treatment: 'ok', share: 1, note: 'Only if not suitable for everyday wear: scrubs, steel-toe boots, branded uniforms, safety gear.' },
  { id: 'gifts', label: 'Business gifts', treatment: 'limited', share: 1, note: 'Limited to $25 per recipient per year. Log the recipient.' },
  { id: 'health', label: 'Health insurance premiums (self-employed)', treatment: 'ask', share: 1, note: 'Deducted on the 1040, not the business schedule, if you qualify. Log it so it is not missed.' },
  { id: 'clothing', label: 'Clothing & grooming', treatment: 'not', share: 0, note: 'Suits, dress shoes, haircuts, athletic wear: not deductible even if required for work.' },
  { id: 'commuting', label: 'Commuting', treatment: 'not', share: 0, note: 'Home to your regular workplace and back is personal, whatever you carry or discuss on the way.' },
  { id: 'vehicle', label: 'Vehicle costs: gas, repairs, car insurance', treatment: 'not', share: 0, note: 'Already inside the standard mileage rate you are using for trips. Do not deduct both. Parking and tolls are separate.' },
  { id: 'fines', label: 'Fines, penalties & tickets', treatment: 'not', share: 0, note: 'Never deductible.' },
  { id: 'personal', label: 'Personal or mixed, unsure', treatment: 'ask', share: 1, note: 'Log it and let your CPA sort it. Better recorded than forgotten.' },
]

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

export const TREATMENTS = {
  ok: { label: 'Deductible', short: 'Deductible' },
  limited: { label: 'Partly deductible', short: 'Limited' },
  ask: { label: 'For your CPA', short: 'Ask CPA' },
  not: { label: 'Not deductible', short: 'Not deductible' },
}

// attention: [item, categoryId]   avoid: [categoryId, reason]
export const INDUSTRIES = [
  {
    id: 'trades', label: 'Carpenter, contractor, electrician, plumber or other trade',
    attention: [
      ['Blades, bits, sandpaper, fasteners and other consumables', 'supplies'],
      ['Hand and power tools; note the cost of each', 'equipment'],
      ['Work boots, gloves, safety glasses, hard hat, hi-vis', 'uniforms'],
      ['Dump, disposal and permit fees', 'fees'],
      ['Subcontractors and helpers you paid', 'payroll'],
      ['Liability and tool insurance', 'insurance'],
      ['Trade license renewals and code classes', 'education'],
      ['Union dues and trade association fees', 'dues'],
      ['Trailer, storage unit or shop rent', 'rent'],
      ['Job-site parking and tolls', 'parking'],
      ['Truck lettering, website, business cards', 'advertising'],
      ['Phone plan, business share', 'phone'],
    ],
    avoid: [
      ['vehicle', 'You are on the standard mileage rate here, so truck gas, repairs and insurance are already counted. Do not log them separately.'],
      ['clothing', 'Jeans, flannels and ordinary boots are everyday wear. Steel-toe boots, hard hats and branded shirts do count.'],
      ['fines', 'Parking and traffic tickets on the job are never deductible.'],
    ],
  },
  {
    id: 'realtor', label: 'Real estate agent or broker',
    attention: [
      ['MLS, board and license fees', 'dues'],
      ['Lockboxes, yard signs and riders', 'supplies'],
      ['Listing photography, staging and marketing', 'advertising'],
      ['Open-house refreshments and flyers', 'advertising'],
      ['Client closing gifts, $25 per person', 'gifts'],
      ['CRM, e-signature and showing apps', 'software'],
      ['Continuing-ed courses and exam fees', 'education'],
      ['Errors & omissions insurance', 'insurance'],
      ['Parking and tolls at showings and closings', 'parking'],
      ['Meals with clients and referral partners', 'meal'],
      ['Phone plan, business share', 'phone'],
    ],
    avoid: [
      ['commuting', 'The first drive of the day from home to the office is commuting. Home straight to a showing usually is not.'],
      ['clothing', 'Business attire is not deductible, however expected in the field.'],
      ['entertainment', 'Taking a client to a game or a show is entertainment, not marketing.'],
    ],
  },
  {
    id: 'medical', label: 'Doctor, dentist or other health practice',
    attention: [
      ['State license, DEA and board certification fees', 'dues'],
      ['CME courses and the travel to reach them', 'education'],
      ['Malpractice insurance', 'insurance'],
      ['Scrubs, lab coats and clinical footwear', 'uniforms'],
      ['Clinical and office supplies', 'supplies'],
      ['Clinical equipment; note the cost of each', 'equipment'],
      ['EHR, scheduling and billing software', 'software'],
      ['Staff wages and contract staff', 'payroll'],
      ['Office rent and utilities', 'rent'],
      ['Billing service, attorney, accountant', 'fees'],
    ],
    avoid: [
      ['entertainment', 'Outings for referral sources are entertainment, not marketing.'],
      ['meal', 'Staff and vendor lunches are 50%, not 100%. The practice-wide holiday party is the exception.'],
      ['clothing', 'Ordinary work clothing under the white coat is not deductible.'],
    ],
  },
  {
    id: 'professional', label: 'Attorney, consultant, accountant or other professional',
    attention: [
      ['Bar, CPA society and licensing fees', 'dues'],
      ['CLE, CPE and certification courses', 'education'],
      ['Research, practice and e-signature software', 'software'],
      ['Malpractice or E&O insurance', 'insurance'],
      ['Meals with clients and referral sources', 'meal'],
      ['Conference travel and lodging', 'travel'],
      ['Home office, if used only for work', 'homeoffice'],
      ['Phone plan, business share', 'phone'],
      ['Website, directory listings and sponsorships', 'advertising'],
      ['Bookkeeper, IT support, payroll service', 'fees'],
    ],
    avoid: [
      ['entertainment', 'Client entertainment is not deductible. The meal at the event can be, if billed separately.'],
      ['dues', 'The club where you meet clients does not count, however useful. Professional societies do.'],
      ['clothing', 'Suits are not deductible.'],
    ],
  },
  {
    id: 'food', label: 'Restaurant, caterer or food service',
    attention: [
      ['Food and beverage purchases', 'cogs'],
      ['Smallwares, cleaning and paper supplies', 'supplies'],
      ['Kitchen equipment; note the cost of each', 'equipment'],
      ['Staff wages and tips paid out', 'payroll'],
      ['Rent and utilities', 'utilities'],
      ['Aprons, chef coats and non-slip shoes', 'uniforms'],
      ['POS, reservation and delivery-platform fees', 'bank'],
      ['Liquor license, health permits, inspections', 'fees'],
      ['Ads, menus, signage and social media', 'advertising'],
      ['Liability, property and workers’ comp insurance', 'insurance'],
    ],
    avoid: [
      ['fines', 'Health-code and parking fines are never deductible.'],
      ['meal', 'Meals you provide to staff on premises have their own rules. Keep them separate from client meals.'],
      ['personal', 'Food taken home for the family comes out of cost of goods. Note it.'],
    ],
  },
  {
    id: 'retail', label: 'Retail shop or online seller',
    attention: [
      ['Merchandise purchased for resale', 'cogs'],
      ['Packaging, boxes, labels and postage', 'shipping'],
      ['POS, e-commerce and inventory subscriptions', 'software'],
      ['Marketplace commissions and card fees', 'bank'],
      ['Store rent and utilities', 'rent'],
      ['Displays, fixtures and signage', 'supplies'],
      ['Ads, promotions and influencer payments', 'advertising'],
      ['Employee wages', 'payroll'],
      ['Business insurance', 'insurance'],
      ['Trade shows and buying trips', 'travel'],
    ],
    avoid: [
      ['personal', 'Merchandise you keep for yourself comes out of the deduction. Note it.'],
      ['clothing', 'Wearing what you sell does not make it deductible.'],
      ['commuting', 'Driving to your own store each day is commuting.'],
    ],
  },
  {
    id: 'driver', label: 'Rideshare, delivery or trucking',
    attention: [
      ['Tolls and paid parking while working', 'parking'],
      ['Phone plan and mount, business share', 'phone'],
      ['Passenger water, mints, chargers, cleaning supplies', 'supplies'],
      ['Dash cam and phone accessories', 'equipment'],
      ['Platform and commission fees on your statements', 'bank'],
      ['Rideshare insurance rider or commercial policy', 'insurance'],
      ['Background check and vehicle inspection fees', 'fees'],
      ['Roadside assistance membership', 'dues'],
    ],
    avoid: [
      ['vehicle', 'Gas, oil, repairs, car washes and car insurance are already inside the standard mileage rate. Log miles, not fuel.'],
      ['commuting', 'Miles count while the app is on and you are available or en route. Driving home with the app off is personal.'],
      ['meal', 'Lunch between rides is personal. Meals count only on overnight trips away from home.'],
    ],
  },
  {
    id: 'salon', label: 'Salon, barber, spa or personal care',
    attention: [
      ['Booth or chair rent', 'rent'],
      ['Color, product, foils, towels and tools', 'supplies'],
      ['Chairs, dryers, stations; note the cost of each', 'equipment'],
      ['License renewals and classes', 'education'],
      ['Booking and payment apps', 'software'],
      ['Card processing fees', 'bank'],
      ['Aprons, smocks and gloves', 'uniforms'],
      ['Social ads and business cards', 'advertising'],
      ['Liability insurance', 'insurance'],
    ],
    avoid: [
      ['clothing', 'The all-black outfit the salon requires is still everyday clothing.'],
      ['personal', 'Products you also use at home: only the business share.'],
      ['entertainment', 'Client outings are not deductible.'],
    ],
  },
  {
    id: 'homeservices', label: 'Landscaper, cleaner, painter or other home service',
    attention: [
      ['Mowers, blowers, sprayers, machines; note the cost of each', 'equipment'],
      ['Fuel for equipment, mulch, chemicals, cleaning supplies', 'supplies'],
      ['Trailer and storage rent', 'rent'],
      ['Helpers and crew you paid', 'payroll'],
      ['Liability insurance', 'insurance'],
      ['Uniforms, gloves, eye and ear protection', 'uniforms'],
      ['Dump fees and permits', 'fees'],
      ['Tolls and parking', 'parking'],
      ['Yard signs, truck lettering, online ads', 'advertising'],
      ['Phone plan, business share', 'phone'],
    ],
    avoid: [
      ['vehicle', 'Truck gas and repairs are inside the standard mileage rate. Fuel for mowers and machines is different: log it under Supplies.'],
      ['fines', 'Tickets are never deductible.'],
      ['clothing', 'Ordinary work clothes are not deductible; gloves and safety gear are.'],
    ],
  },
  {
    id: 'tech', label: 'IT, software developer or online business',
    attention: [
      ['Computers, monitors and peripherals; note the cost of each', 'equipment'],
      ['Software, cloud hosting, domains, SaaS tools', 'software'],
      ['Home office used only for work', 'homeoffice'],
      ['Internet and phone, business share', 'phone'],
      ['Courses and certifications', 'education'],
      ['Contractors you paid', 'payroll'],
      ['Payment processor and app-store fees', 'bank'],
      ['Conference travel', 'travel'],
      ['Ads and marketing tools', 'advertising'],
    ],
    avoid: [
      ['homeoffice', 'Exclusive use is the test. A desk in the living room does not qualify.'],
      ['phone', 'A shared personal phone is only partly deductible. A second line used only for work is 100%.'],
      ['personal', 'Gadgets with real personal use: only the business share.'],
    ],
  },
  {
    id: 'creative', label: 'Photographer, designer, writer or other creative',
    attention: [
      ['Cameras, lenses, lights, computers; note the cost of each', 'equipment'],
      ['Editing software, cloud storage, stock assets', 'software'],
      ['Props, backdrops, printing, portfolio materials', 'supplies'],
      ['Portfolio site, ads and directory listings', 'advertising'],
      ['Travel to shoots and client sites', 'travel'],
      ['Workshops and classes', 'education'],
      ['Gear insurance', 'insurance'],
      ['Home studio used only for work', 'homeoffice'],
      ['Assistants, models, second shooters', 'payroll'],
    ],
    avoid: [
      ['clothing', 'Wardrobe for shoots is not deductible unless it is a costume unusable elsewhere.'],
      ['personal', 'Gear you also use on vacation: only the business share.'],
      ['travel', 'Trips with a personal component: only the business days and business costs.'],
    ],
  },
  {
    id: 'fitness', label: 'Trainer, coach, instructor or wellness',
    attention: [
      ['Studio, gym floor or room rent', 'rent'],
      ['Training equipment; note the cost of each', 'equipment'],
      ['Certifications, CEUs and CPR renewal', 'education'],
      ['Liability insurance', 'insurance'],
      ['Scheduling, payment and music-licensing subscriptions', 'software'],
      ['Card processing fees', 'bank'],
      ['Ads, website and social media', 'advertising'],
      ['Professional association dues', 'dues'],
      ['Phone plan, business share', 'phone'],
    ],
    avoid: [
      ['clothing', 'Athletic wear is everyday clothing, whatever the logo.'],
      ['personal', 'Your own gym membership and supplements are personal.'],
      ['meal', 'Meals with clients are 50% only when business is actually discussed.'],
    ],
  },
  {
    id: 'rental', label: 'Rental property owner',
    attention: [
      ['Repair and maintenance materials and labor', 'supplies'],
      ['Landlord insurance', 'insurance'],
      ['Property manager, attorney and accountant fees', 'fees'],
      ['Advertising for tenants and screening fees', 'advertising'],
      ['Trips to the property to manage or repair it', 'parking'],
      ['Landlord and bookkeeping software', 'software'],
      ['HOA and condo dues', 'dues'],
      ['Utilities you pay for the unit', 'utilities'],
      ['Improvements: new roof, HVAC, appliances; list each separately', 'equipment'],
    ],
    avoid: [
      ['equipment', 'Improvements are depreciated over years, not deducted now. Describe the work so your CPA can tell a repair from an improvement.'],
      ['travel', 'Trips to look at property you do not own are not deductible.'],
      ['personal', 'Days you or family use the property reduce the deduction.'],
    ],
  },
  {
    id: 'other', label: 'Other / general business',
    attention: [
      ['Meals with clients, business discussed', 'meal'],
      ['Overnight travel and lodging', 'travel'],
      ['Parking and tolls', 'parking'],
      ['Office and job supplies', 'supplies'],
      ['Software and subscriptions', 'software'],
      ['Phone and internet, business share', 'phone'],
      ['Courses, licenses and certifications', 'education'],
      ['Professional dues', 'dues'],
      ['Advertising and website', 'advertising'],
      ['Accountant, attorney and other professional fees', 'fees'],
    ],
    avoid: [
      ['entertainment', 'Entertainment is not deductible; the meal portion can be if billed separately.'],
      ['clothing', 'Ordinary clothing is never deductible, however required.'],
      ['commuting', 'Home to your regular workplace is personal.'],
    ],
  },
]

export const INDUSTRY_BY_ID = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]))
export const DEFAULT_INDUSTRY = 'other'

export function industryFor(id) {
  return INDUSTRY_BY_ID[id] || INDUSTRY_BY_ID[DEFAULT_INDUSTRY]
}

// Categories the industry's attention list points at, in first-seen order.
export function commonCategories(industryId) {
  const seen = []
  for (const [, cat] of industryFor(industryId).attention) if (!seen.includes(cat)) seen.push(cat)
  return seen
}

// Category options for a picker: the industry's common ones first, then the rest.
export function categoryGroups(industryId) {
  const ind = industryFor(industryId)
  const common = commonCategories(industryId).map((id) => CATEGORY_BY_ID[id]).filter(Boolean)
  const rest = CATEGORIES.filter((c) => !common.includes(c))
  return [
    { label: `Common for ${ind.label.toLowerCase()}`, options: common },
    { label: 'All categories', options: rest },
  ]
}

// How one expense line is treated for a given industry.
export function classify(categoryId, industryId) {
  const cat = CATEGORY_BY_ID[categoryId] || CATEGORY_BY_ID.meal
  const ind = industryFor(industryId)
  const avoid = ind.avoid.find(([id]) => id === cat.id)
  return {
    ...cat,
    typical: commonCategories(industryId).includes(cat.id),
    watchNote: avoid ? avoid[1] : '',
    treatmentLabel: TREATMENTS[cat.treatment].label,
    treatmentShort: TREATMENTS[cat.treatment].short,
  }
}
