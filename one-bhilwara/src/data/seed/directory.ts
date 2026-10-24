import type { Business, FinanceProduct, HealthProvider, Institution, Professional, Provider, User } from '@/types/models';
import { ago } from './time';

/* All names below are FICTIONAL sample records. No phone numbers are seeded: demo listings
   show "contact hidden in demo" instead of a number that might belong to a real person. */

export const DEMO_USER_ID = 'u-demo';

export const users = (): User[] => [
  {
    id: DEMO_USER_ID, createdAt: ago(24 * 40), demo: true, name: 'Aarav Sharma', mobile: '9876543210', email: 'aarav.demo@example.com',
    localityId: 'shastri-nagar', role: 'resident', bio: 'Demo account for exploring One Bhilwara.', interests: ['News', 'Jobs', 'Services', 'Events'],
    status: 'active', privacy: { showContact: false, profilePublic: true, personalisedFeed: true }, following: ['b-1', 'b-4'], blocked: [],
    candidate: { headline: 'Commerce graduate, Tally & GST', education: 'B.Com', skills: ['Tally', 'GST filing', 'MS Excel'], experienceYears: 2, preferredRole: 'Accounts executive', preferredSalary: 18000, preferredLocalityId: 'azad-nagar', availability: '15_days', visibility: 'employers' }
  },
  ...[
    ['u-2', 'Priya Mehta', 'azad-nagar', 'resident'], ['u-3', 'Rohit Jain', 'subhash-nagar', 'business'], ['u-4', 'Sunita Kanwar', 'bapu-nagar', 'resident'],
    ['u-5', 'Imran Khan', 'bhopalganj', 'provider'], ['u-6', 'Kavita Soni', 'rc-vyas', 'employer'], ['u-7', 'Mahendra Gurjar', 'pur', 'resident'],
    ['u-8', 'Neha Agarwal', 'kashipuri', 'owner'], ['u-9', 'Deepak Tailor', 'sanganer', 'jobseeker'], ['u-10', 'Admin Desk', 'azad-nagar', 'admin'],
    ['u-11', 'Ramesh Choudhary', 'suwana', 'resident'], ['u-12', 'Pooja Vaishnav', 'shastri-nagar', 'resident']
  ].map(([id, name, localityId, role], i): User => ({
    id, name, localityId, role: role as User['role'], createdAt: ago(24 * (60 - i * 3)), demo: true, interests: [], status: i === 10 ? 'suspended' : 'active',
    privacy: { showContact: false, profilePublic: true, personalisedFeed: true }, following: [], blocked: []
  }))
];

const biz = (
  id: string, name: string, category: string, localityId: string, description: string, products: string[],
  verification: Business['verification'], rating: number, reviewCount: number, extra: Partial<Business> = {}
): Business => ({
  id, name, category, localityId, description, products, verification, rating, reviewCount,
  address: `Sample address, ${localityId.replace(/-/g, ' ')}, Bhilwara`, hours: 'Mon–Sat 10:00–20:00 (sample)', priceRange: 2, tags: [],
  claimed: verification === 'verified', views: 120 + reviewCount * 9, clicks: 30 + reviewCount * 2, leads: Math.round(reviewCount / 3),
  createdAt: ago(24 * (30 + reviewCount)), demo: true, ...extra
});

export const businesses = (): Business[] => [
  biz('b-1', 'Mewar Fresh Mart (Demo)', 'Grocery', 'shastri-nagar', 'Neighbourhood grocery with daily vegetables, staples and home delivery within 3 km.', ['Groceries', 'Fresh vegetables', 'Dairy', 'Home delivery'], 'verified', 4.4, 86, { sponsored: true, premium: true, website: 'https://example.com', instagram: 'https://instagram.com/' }),
  biz('b-2', 'Kesar Thali House (Demo)', 'Restaurants & cafes', 'azad-nagar', 'Rajasthani and Gujarati thalis, family seating and evening snacks.', ['Rajasthani thali', 'Dal baati churma', 'Snacks', 'Catering'], 'verified', 4.6, 142, { priceRange: 2 }),
  biz('b-3', 'Sutradhar Suitings Outlet (Demo)', 'Textile', 'riico', 'Factory outlet for suiting and shirting fabric. Retail and bulk orders.', ['Suiting', 'Shirting', 'Bulk orders', 'Uniform fabric'], 'under_review', 4.2, 37, { b2b: true }),
  biz('b-4', 'Chhaya Electronics (Demo)', 'Electronics', 'bhopalganj', 'Mobile phones, accessories and home appliances with installation support.', ['Mobiles', 'LED TVs', 'Accessories', 'Repairs'], 'verified', 4.1, 64),
  biz('b-5', 'Rangreza Boutique (Demo)', 'Clothing', 'subhash-nagar', 'Designer suits, lehengas and alteration services.', ['Lehengas', 'Suits', 'Alterations'], 'unverified', 4.5, 22, { wedding: 'Boutiques' }),
  biz('b-6', 'Swarn Kala Jewellers (Demo)', 'Jewellery', 'bhopalganj', 'Gold and silver jewellery, bridal sets and repairs.', ['Gold jewellery', 'Silver', 'Bridal sets'], 'verified', 4.3, 51, { wedding: 'Jewellery', priceRange: 4 }),
  biz('b-7', 'Lakdi Ghar Furniture (Demo)', 'Furniture', 'sanganer', 'Sheesham and engineered-wood furniture; custom orders.', ['Beds', 'Sofas', 'Wardrobes', 'Custom work'], 'submitted', 3.9, 18),
  biz('b-8', 'Sankalp Auto Care (Demo)', 'Automotive', 'pansal', 'Two-wheeler and car servicing, tyres and batteries.', ['Car service', 'Bike service', 'Tyres', 'Batteries'], 'verified', 4.0, 77),
  biz('b-9', 'Utsav Banquet & Lawns (Demo)', 'Events & weddings', 'suwana', 'Lawn and banquet hall for weddings and functions, up to 800 guests.', ['Lawn', 'Banquet hall', 'In-house decor', 'Rooms'], 'verified', 4.4, 58, { wedding: 'Venues', priceRange: 4, sponsored: true }),
  biz('b-10', 'Pixel Kahani Studio (Demo)', 'Events & weddings', 'azad-nagar', 'Wedding photography, candid and pre-wedding shoots.', ['Candid photography', 'Videography', 'Albums'], 'verified', 4.7, 39, { wedding: 'Photographers' }),
  biz('b-11', 'Mehndi Rang by Sakshi (Demo)', 'Events & weddings', 'kashipuri', 'Bridal and party mehendi designs at home.', ['Bridal mehendi', 'Party mehendi'], 'unverified', 4.8, 26, { wedding: 'Mehendi artists', priceRange: 1 }),
  biz('b-12', 'Shubh Rasoi Caterers (Demo)', 'Events & weddings', 'bapu-nagar', 'Veg catering for weddings, kitty parties and corporate events.', ['Wedding catering', 'Live counters', 'Corporate lunch'], 'verified', 4.2, 31, { wedding: 'Caterers' }),
  biz('b-13', 'Saathi Travels (Demo)', 'Transport', 'bhopalganj', 'Taxi, tempo traveller and outstation trips.', ['Taxi', 'Tempo traveller', 'Outstation'], 'verified', 4.1, 44, { wedding: 'Wedding transport' }),
  biz('b-14', 'Turant Courier Point (Demo)', 'Courier', 'azad-nagar', 'Domestic courier booking and parcel pickup.', ['Domestic courier', 'Parcel pickup', 'Documents'], 'unverified', 3.8, 12),
  biz('b-15', 'Sangam Yarn Traders (Demo)', 'Wholesale', 'riico', 'Polyester-viscose yarn trading for weaving units.', ['PV yarn', 'Polyester yarn', 'Bulk supply'], 'unverified', 4.0, 9, { b2b: true }),
  biz('b-16', 'Navrang Weaving Works (Demo)', 'Manufacturers', 'riico', 'Grey fabric weaving unit taking job-work orders.', ['Grey fabric', 'Job work'], 'submitted', 4.1, 7, { b2b: true }),
  biz('b-17', 'Chai Pe Charcha Cafe (Demo)', 'Restaurants & cafes', 'rc-vyas', 'Student-friendly cafe with snacks, shakes and study corner.', ['Tea & coffee', 'Snacks', 'Wi-Fi'], 'verified', 4.3, 95, { priceRange: 1 }),
  biz('b-18', 'Gharelu Seva Kendra (Demo)', 'Home services', 'subhash-nagar', 'Booking desk for cleaning, pest control and appliance repair.', ['Deep cleaning', 'Pest control', 'Appliance repair'], 'verified', 4.0, 48),
  biz('b-19', 'Dhaage Machinery Spares (Demo)', 'Manufacturers', 'riico', 'Loom spares and maintenance for textile units.', ['Loom spares', 'Maintenance'], 'unverified', 3.9, 5, { b2b: true }),
  biz('b-20', 'Sajawat Decorators (Demo)', 'Events & weddings', 'pur', 'Floral and theme decoration for weddings and events.', ['Floral decor', 'Stage decor', 'Lighting'], 'unverified', 4.2, 15, { wedding: 'Decorators' }),
  biz('b-21', 'Taal DJ & Sound (Demo)', 'Events & weddings', 'sanganer', 'DJ, sound and lighting for sangeet and receptions.', ['DJ', 'Sound', 'Lighting'], 'unverified', 4.0, 19, { wedding: 'DJs & entertainers' }),
  biz('b-22', 'Roop Shringar Makeup (Demo)', 'Events & weddings', 'shastri-nagar', 'Bridal and party makeup, hair styling.', ['Bridal makeup', 'Party makeup'], 'verified', 4.6, 33, { wedding: 'Makeup artists' })
];

const prov = (
  id: string, name: string, category: string, localityId: string, description: string, rating: number, reviewCount: number,
  availability: Provider['availability'], verification: Provider['verification'], priceFrom: number | undefined, priceUnit: Provider['priceUnit'],
  extra: Partial<Provider> = {}
): Provider => ({
  id, name, category, localityId, description, rating, reviewCount, availability, verification, priceFrom, priceUnit,
  emergency: false, experienceYears: 3 + (reviewCount % 9), languages: ['Hindi', 'Mewari'], activityConsent: true,
  lastActiveAt: ago((reviewCount % 30) + 1), createdAt: ago(24 * 50), demo: true, ...extra
});

export const providers = (): Provider[] => [
  prov('p-1', 'Rakesh Plumbing Works (Demo)', 'plumber', 'shastri-nagar', 'Leakage, fittings, motor and tank work.', 4.6, 58, 'available', 'verified', 250, 'visit', { emergency: true, ownerId: 'u-5' }),
  prov('p-2', 'Jal Seva Plumbers (Demo)', 'plumber', 'bapu-nagar', 'Bathroom fittings and RO installation.', 4.2, 21, 'busy', 'unverified', 200, 'visit'),
  prov('p-3', 'Bijli Mitra Electricals (Demo)', 'electrician', 'azad-nagar', 'Wiring, inverter, fans and fault finding.', 4.7, 73, 'available', 'verified', 200, 'visit', { emergency: true }),
  prov('p-4', 'Shakti Electric Service (Demo)', 'electrician', 'kashipuri', 'House wiring and MCB/DB work.', 4.0, 15, 'available', 'submitted', 180, 'visit', { lastActiveAt: ago(40) }),
  prov('p-5', 'Vishwakarma Wood Works (Demo)', 'carpenter', 'sanganer', 'Furniture repair, modular kitchen and doors.', 4.4, 32, 'available', 'verified', undefined, 'job'),
  prov('p-6', 'Speed Auto Garage (Demo)', 'mechanic', 'pansal', 'Bike and car repair, doorstep breakdown help.', 4.1, 41, 'busy', 'verified', 300, 'visit', { emergency: true }),
  prov('p-7', 'Style Point Unisex Salon (Demo)', 'salon', 'rc-vyas', 'Haircut, grooming and home visits.', 4.5, 66, 'available', 'verified', 150, 'visit'),
  prov('p-8', 'Glow Beauty at Home (Demo)', 'beautician', 'shastri-nagar', 'Facials, waxing and bridal prep at home.', 4.6, 38, 'available', 'unverified', 400, 'visit'),
  prov('p-9', 'Chamak Deep Cleaning (Demo)', 'cleaning', 'subhash-nagar', 'Home, sofa and kitchen deep cleaning.', 4.3, 29, 'available', 'verified', 1500, 'job', { seasonal: true }),
  prov('p-10', 'Sahayak Housekeeping (Demo)', 'housekeeping', 'azad-nagar', 'Daily and weekly housekeeping staff.', 4.0, 12, 'offline', 'unverified', 6000, 'job', { activityConsent: false, lastActiveAt: undefined }),
  prov('p-11', 'Rang Mahal Painters (Demo)', 'painter', 'bapu-nagar', 'Interior/exterior painting and waterproofing.', 4.2, 24, 'available', 'verified', undefined, 'job', { seasonal: true }),
  prov('p-12', 'CoolCare AC Service (Demo)', 'ac', 'bhopalganj', 'AC service, gas refill and installation.', 4.4, 47, 'busy', 'verified', 499, 'visit'),
  prov('p-13', 'FixIt Appliance Repair (Demo)', 'appliance', 'kashipuri', 'Washing machine, fridge and microwave repair.', 4.1, 19, 'available', 'unverified', 299, 'visit'),
  prov('p-14', 'Suraksha Pest Control (Demo)', 'pest', 'rc-vyas', 'Termite and general pest treatment.', 4.3, 22, 'available', 'verified', 1200, 'job'),
  prov('p-15', 'Shifting Saathi Movers (Demo)', 'movers', 'sanganer', 'Local and intercity shifting.', 3.9, 17, 'available', 'unverified', undefined, 'job'),
  prov('p-16', 'Turant Delivery Helpers (Demo)', 'delivery', 'azad-nagar', 'Same-day local pickup and drop helpers.', 4.0, 9, 'available', 'unverified', 100, 'job'),
  prov('p-17', 'Madad Ghar Helpers (Demo)', 'helper', 'subhash-nagar', 'Temporary household and festival helpers.', 4.2, 14, 'available', 'verified', 800, 'day', { seasonal: true }),
  prov('p-18', 'Nirmaan Labour Group (Demo)', 'labour', 'pur', 'Masons, helpers and loading/unloading teams.', 4.0, 11, 'available', 'unverified', 700, 'day', { seasonal: true }),
  prov('p-19', 'Mazboot Builders (Demo)', 'contractor', 'suwana', 'Civil construction and renovation contracts.', 4.1, 8, 'busy', 'submitted', undefined, 'job'),
  prov('p-20', 'Utsav Event Crew (Demo)', 'event-staff', 'shastri-nagar', 'Event setup, serving staff and ushers.', 4.3, 13, 'available', 'unverified', 900, 'day', { seasonal: true }),
  prov('p-21', 'Hariyali Garden Care (Demo)', 'gardener', 'rc-vyas', 'Garden setup, maintenance and potting.', 4.5, 10, 'available', 'unverified', 350, 'visit'),
  prov('p-22', 'Vidya Home Tutors (Demo)', 'tutor', 'azad-nagar', 'Class 6–12 maths and science tutors.', 4.6, 27, 'available', 'verified', 2500, 'job'),
  prov('p-23', 'Mobile Doctor Repairs (Demo)', 'device-repair', 'bhopalganj', 'Phone screen, battery and laptop repair.', 4.2, 35, 'available', 'verified', 199, 'visit'),
  prov('p-24', 'Shaadi Sevak Team (Demo)', 'wedding-services', 'pur', 'Wedding helpers, halwai assistants and serving staff.', 4.1, 6, 'available', 'unverified', 800, 'day', { seasonal: true })
];

export const institutions = (): Institution[] => [
  { id: 'i-1', name: 'Gyan Deep Public School (Demo)', category: 'School', localityId: 'shastri-nagar', courses: ['Nursery–Class 12', 'Science', 'Commerce'], admission: 'Admissions information is published by the school. (Sample record)', verification: 'unverified', rating: 4.2, reviewCount: 18, description: 'Sample school profile.', createdAt: ago(900), demo: true },
  { id: 'i-2', name: 'Lakshya Coaching Centre (Demo)', category: 'Competitive exams', localityId: 'azad-nagar', courses: ['NEET foundation', 'JEE foundation', 'Rajasthan Police'], verification: 'verified', rating: 4.4, reviewCount: 41, description: 'Sample coaching centre profile.', createdAt: ago(900), demo: true },
  { id: 'i-3', name: 'Kaushal Skill Hub (Demo)', category: 'Skill development', localityId: 'riico', courses: ['Tally & GST', 'Spoken English', 'Basic computers', 'Sewing machine operator'], verification: 'unverified', rating: 4.0, reviewCount: 12, description: 'Sample skill centre profile.', createdAt: ago(900), demo: true },
  { id: 'i-4', name: 'Shiksha Sadan Library (Demo)', category: 'Library', localityId: 'subhash-nagar', courses: ['Reading hall', 'AC seats', 'Monthly membership'], verification: 'verified', rating: 4.5, reviewCount: 29, description: 'Sample self-study library.', createdAt: ago(900), demo: true },
  { id: 'i-5', name: 'Saraswati Tuition Classes (Demo)', category: 'Tuition', localityId: 'bapu-nagar', courses: ['Class 9–10 all subjects', 'Class 11–12 Commerce'], verification: 'unverified', rating: 4.3, reviewCount: 9, description: 'Sample tuition profile.', createdAt: ago(900), demo: true },
  { id: 'i-6', name: 'Navkiran College of Commerce (Demo)', category: 'College', localityId: 'kashipuri', courses: ['B.Com', 'BBA', 'M.Com'], verification: 'unverified', rating: 3.9, reviewCount: 21, description: 'Fictional sample college — no affiliation is claimed.', createdAt: ago(900), demo: true },
  { id: 'i-7', name: 'Hunar Vocational Institute (Demo)', category: 'Vocational', localityId: 'sanganer', courses: ['Electrician trade', 'Fitter', 'Beauty & wellness'], verification: 'submitted', rating: 4.1, reviewCount: 7, description: 'Sample vocational institute.', createdAt: ago(900), demo: true }
];

export const healthcare = (): HealthProvider[] => [
  { id: 'h-1', name: 'Arogya Multispeciality Hospital (Demo)', type: 'Hospital', specialty: 'Multispeciality', address: 'Sample address, Azad Nagar', localityId: 'azad-nagar', hoursVerified: false, services: ['Emergency', 'General medicine', 'Orthopaedics', 'ICU'], verification: 'verified', source: 'Sample record', emergency24x7: true, createdAt: ago(900), demo: true },
  { id: 'h-2', name: 'Sanjeevani Clinic (Demo)', type: 'Clinic', specialty: 'General physician', address: 'Sample address, Shastri Nagar', localityId: 'shastri-nagar', hours: 'Mon–Sat 9–1, 5–8 (sample)', hoursVerified: false, services: ['OPD', 'Vaccination', 'Health check-up'], verification: 'unverified', source: 'Sample record', createdAt: ago(900), demo: true },
  { id: 'h-3', name: 'Dr. A. Verma — Child Specialist (Demo)', type: 'Doctor', specialty: 'Paediatrics', address: 'Sample address, Subhash Nagar', localityId: 'subhash-nagar', hoursVerified: false, services: ['Child OPD', 'Vaccination'], verification: 'unverified', source: 'Sample record — fictional doctor', createdAt: ago(900), demo: true },
  { id: 'h-4', name: 'Nidaan Diagnostics (Demo)', type: 'Diagnostics', specialty: 'Pathology & imaging', address: 'Sample address, Bhopalganj', localityId: 'bhopalganj', hoursVerified: false, services: ['Blood tests', 'X-ray', 'Ultrasound', 'Home sample collection'], verification: 'verified', source: 'Sample record', createdAt: ago(900), demo: true },
  { id: 'h-5', name: 'Seva Medical Store (Demo)', type: 'Pharmacy', specialty: 'Pharmacy', address: 'Sample address, R.C. Vyas Colony', localityId: 'rc-vyas', hoursVerified: false, services: ['Medicines', 'Home delivery'], verification: 'unverified', source: 'Sample record', createdAt: ago(900), demo: true },
  { id: 'h-6', name: 'Jeevan Rekha Ambulance (Demo)', type: 'Ambulance', specialty: 'Private ambulance', address: 'Sample address, Kashipuri', localityId: 'kashipuri', hoursVerified: false, services: ['Patient transport'], verification: 'unverified', source: 'Sample record — for emergencies dial 108/112', createdAt: ago(900), demo: true },
  { id: 'h-7', name: 'Gati Physiotherapy Centre (Demo)', type: 'Physiotherapy', specialty: 'Physiotherapy', address: 'Sample address, Bapu Nagar', localityId: 'bapu-nagar', hoursVerified: false, services: ['Back & neck pain', 'Post-surgery rehab', 'Sports injury'], verification: 'verified', source: 'Sample record', createdAt: ago(900), demo: true }
];

export const professionals = (): Professional[] => [
  { id: 'pr-1', name: 'S. Bansal & Associates (Demo)', profession: 'Chartered accountant', qualifications: 'As supplied by provider — not verified (demo)', qualificationsVerified: false, services: ['GST returns', 'Income tax', 'Audit'], experience: '12 years (as supplied)', localityId: 'azad-nagar', verification: 'unverified', rating: 4.5, reviewCount: 23, createdAt: ago(900), demo: true },
  { id: 'pr-2', name: 'Adv. R. Rathore (Demo)', profession: 'Lawyer', qualificationsVerified: false, services: ['Property matters', 'Civil cases', 'Notary guidance'], experience: '9 years (as supplied)', localityId: 'bhopalganj', verification: 'unverified', rating: 4.3, reviewCount: 14, createdAt: ago(900), demo: true },
  { id: 'pr-3', name: 'Kar Sahayak Tax Desk (Demo)', profession: 'Tax consultant', qualificationsVerified: false, services: ['ITR filing', 'TDS', 'PAN assistance'], experience: '6 years (as supplied)', localityId: 'shastri-nagar', verification: 'verified', rating: 4.2, reviewCount: 31, createdAt: ago(900), demo: true },
  { id: 'pr-4', name: 'Suraksha Insurance Advisory (Demo)', profession: 'Insurance advisor', qualificationsVerified: false, services: ['Health insurance', 'Motor insurance', 'Term plans'], experience: '7 years (as supplied)', localityId: 'subhash-nagar', verification: 'unverified', rating: 4.0, reviewCount: 11, createdAt: ago(900), demo: true },
  { id: 'pr-5', name: 'Vriddhi Business Consultants (Demo)', profession: 'Business consultant', qualificationsVerified: false, services: ['Udyam registration guidance', 'Project reports', 'Loan documentation'], experience: '8 years (as supplied)', localityId: 'riico', verification: 'unverified', rating: 4.1, reviewCount: 8, createdAt: ago(900), demo: true },
  { id: 'pr-6', name: 'N. Joshi, Company Secretary (Demo)', profession: 'Company secretary', qualificationsVerified: false, services: ['Company incorporation', 'ROC filings'], experience: '5 years (as supplied)', localityId: 'azad-nagar', verification: 'unverified', rating: 4.4, reviewCount: 6, createdAt: ago(900), demo: true }
];

export const financeProducts = (): FinanceProduct[] => [
  { id: 'f-1', category: 'Business loans', provider: 'Sample Bank A (Demo)', title: 'MSME working-capital loan', summary: 'Illustrative product card. Rates, fees and eligibility are set by the lender.', features: ['For registered MSMEs', 'Documents: Udyam, GST, bank statements'], commission: true, demo: true },
  { id: 'f-2', category: 'Home loans', provider: 'Sample Housing Finance (Demo)', title: 'Home purchase loan', summary: 'Illustrative product card. Approval depends on the lender.', features: ['Purchase or construction', 'Property documents needed'], commission: true, demo: true },
  { id: 'f-3', category: 'Vehicle loans', provider: 'Sample Bank B (Demo)', title: 'Two-wheeler loan', summary: 'Illustrative product card.', features: ['New two-wheelers', 'KYC + income proof'], commission: true, demo: true },
  { id: 'f-4', category: 'Insurance', provider: 'Sample Insurer (Demo)', title: 'Family health cover', summary: 'Illustrative product card. Read the policy wording before buying.', features: ['Family floater', 'Cashless network (insurer-defined)'], commission: true, demo: true },
  { id: 'f-5', category: 'Bank accounts', provider: 'Sample Bank A (Demo)', title: 'Savings account', summary: 'Illustrative product card.', features: ['KYC required'], commission: false, demo: true },
  { id: 'f-6', category: 'Personal loans', provider: 'Sample NBFC (Demo)', title: 'Personal loan', summary: 'Illustrative product card. Borrow only what you can repay.', features: ['Salaried and self-employed'], commission: true, demo: true },
  { id: 'f-7', category: 'Credit cards', provider: 'Sample Bank B (Demo)', title: 'Entry-level credit card', summary: 'Illustrative product card. Issued only by the bank after its own checks.', features: ['Fees and interest set by issuer'], commission: true, demo: true },
  { id: 'f-8', category: 'Savings & investments', provider: 'Information only', title: 'Understanding fixed deposits & small savings', summary: 'General information. Not investment advice.', features: ['Compare official rates on bank/post office sites'], commission: false, demo: true }
];
