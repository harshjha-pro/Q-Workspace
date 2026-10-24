import type { Application, Booking, CityEvent, Classified, ConciergeRequest, Enquiry, Job, LabourPost, Property, ServiceRequest } from '@/types/models';
import { DEMO_USER_ID } from './directory';
import { ago, ahead, dayStr } from './time';

const job = (id: string, title: string, employerName: string, category: string, type: Job['type'], localityId: string, salaryMin: number, salaryMax: number, salaryPeriod: Job['salaryPeriod'], experience: string, education: string, skills: string[], description: string, verifiedEmployer: boolean, extra: Partial<Job> = {}): Job => ({
  id, title, employerName, category, type, localityId, salaryMin, salaryMax, salaryPeriod, experience, education, skills, description, verifiedEmployer,
  benefits: ['As stated by employer'], deadline: dayStr(14), status: 'open', createdAt: ago(Number(id.slice(2)) * 9), demo: true, ...extra
});

export const jobs = (): Job[] => [
  job('j-1', 'Accounts Executive', 'Sutradhar Suitings Outlet (Demo)', 'Accounting & finance', 'full_time', 'riico', 15000, 22000, 'month', '1–3 years', 'B.Com', ['Tally', 'GST', 'Excel'], 'Maintain books, GST returns support and vendor reconciliation.', false, { featured: true, employerId: 'u-6', postedBy: 'u-6', benefits: ['PF', 'Paid leave'] }),
  job('j-2', 'Sales Associate (Part-time)', 'Chhaya Electronics (Demo)', 'Sales', 'part_time', 'bhopalganj', 120, 150, 'hour', 'Freshers welcome', '12th pass', ['Communication', 'Mobile phones'], 'Evening shifts 5–9 pm. Ideal for college students.', true, { urgent: true }),
  job('j-3', 'Loom Operator', 'Navrang Weaving Works (Demo)', 'Textile industry', 'full_time', 'riico', 12000, 16000, 'month', '1+ year', 'Any', ['Air-jet loom', 'Shift work'], 'Operate and monitor looms in rotating shifts.', false),
  job('j-4', 'Delivery Partner', 'Mewar Fresh Mart (Demo)', 'Drivers & delivery', 'full_time', 'shastri-nagar', 11000, 14000, 'month', 'Freshers welcome', 'Any', ['Two-wheeler', 'Licence'], 'Local grocery deliveries within 3 km. Own two-wheeler preferred.', true, { benefits: ['Fuel allowance (as stated)'] }),
  job('j-5', 'Front Office Executive', 'Arogya Multispeciality Hospital (Demo)', 'Healthcare', 'full_time', 'azad-nagar', 13000, 17000, 'month', '0–2 years', 'Graduate', ['Computer basics', 'Hindi & English'], 'Patient registration and front-desk coordination.', true),
  job('j-6', 'Maths Teacher (Class 6–10)', 'Gyan Deep Public School (Demo)', 'Education', 'full_time', 'shastri-nagar', 18000, 25000, 'month', '2+ years', 'B.Sc + B.Ed', ['Mathematics', 'Classroom management'], 'Teach middle and secondary maths.', false),
  job('j-7', 'Social Media Intern', 'Kesar Thali House (Demo)', 'Technology', 'internship', 'azad-nagar', 4000, 6000, 'month', 'Students', 'Pursuing graduation', ['Instagram', 'Canva'], 'Create posts and reels for a local restaurant. 3 months.', true),
  job('j-8', 'Data Entry (Work from home)', 'Vriddhi Business Consultants (Demo)', 'Office & admin', 'wfh', 'all', 8000, 10000, 'month', 'Freshers welcome', '12th pass', ['Typing', 'Excel'], 'Remote data entry. No registration fee is ever charged for this job.', false),
  job('j-9', 'Diwali Season Store Helper', 'Swarn Kala Jewellers (Demo)', 'Seasonal', 'temporary', 'bhopalganj', 500, 700, 'day', 'None', 'Any', ['Customer handling'], 'Temporary festival-season helper for 3 weeks.', true),
  job('j-10', 'Cafe Barista (Weekend)', 'Chai Pe Charcha Cafe (Demo)', 'Student jobs', 'part_time', 'rc-vyas', 400, 500, 'day', 'Freshers welcome', 'Any', ['Customer service'], 'Saturday–Sunday shifts. Training provided.', true),
  job('j-11', 'Electrician (Industrial)', 'Dhaage Machinery Spares (Demo)', 'Skilled labour', 'full_time', 'riico', 16000, 21000, 'month', '2+ years', 'ITI Electrician', ['Industrial wiring', 'Motor rewinding'], 'Maintenance electrician for textile units.', false),
  job('j-12', 'Hotel Steward', 'Utsav Banquet & Lawns (Demo)', 'Retail & hospitality', 'full_time', 'suwana', 10000, 13000, 'month', '0–1 year', 'Any', ['Service etiquette'], 'Banquet service staff. Food and accommodation as stated by employer.', true, { status: 'pending_review' })
];

export const applications = (): Application[] => [
  { id: 'a-1', jobId: 'j-1', jobTitle: 'Accounts Executive', employerName: 'Sutradhar Suitings Outlet (Demo)', userId: DEMO_USER_ID, applicantName: 'Aarav Sharma', mobile: '9876543210', coverNote: '2 years of Tally experience.', status: 'shortlisted', history: [{ status: 'submitted', at: ago(80) }, { status: 'under_review', at: ago(60) }, { status: 'shortlisted', at: ago(20) }], createdAt: ago(80), demo: true },
  { id: 'a-2', jobId: 'j-1', jobTitle: 'Accounts Executive', employerName: 'Sutradhar Suitings Outlet (Demo)', userId: 'u-9', applicantName: 'Deepak Tailor', mobile: '9812345670', coverNote: 'Fresher with Tally certificate.', status: 'submitted', history: [{ status: 'submitted', at: ago(30) }], createdAt: ago(30), demo: true },
  { id: 'a-3', jobId: 'j-6', jobTitle: 'Maths Teacher (Class 6–10)', employerName: 'Gyan Deep Public School (Demo)', userId: 'u-12', applicantName: 'Pooja Vaishnav', mobile: '9898989898', coverNote: 'B.Sc B.Ed, 3 years teaching.', status: 'interview', history: [{ status: 'submitted', at: ago(100) }, { status: 'interview', at: ago(10) }], createdAt: ago(100), demo: true }
];

const prop = (id: string, title: string, listingType: Property['listingType'], category: string, price: number, localityId: string, extra: Partial<Property>): Property => ({
  id, title, listingType, category, price, localityId, furnishing: 'semi', amenities: [], description: 'Sample listing for demonstration.', ownerName: 'Sample owner (Demo)', ownerType: 'owner',
  verification: 'unverified', available: true, photos: 4, views: 80 + price % 300, enquiries: 3, status: 'active', createdAt: ago(Number(id.slice(3)) * 14), demo: true, ...extra
});

export const properties = (): Property[] => [
  prop('pr-1', '2 BHK flat for rent near park', 'rent', 'Residential', 9500, 'shastri-nagar', { areaSqft: 950, bedrooms: 2, bathrooms: 2, amenities: ['Parking', 'Water tank', 'Power backup'], ownerId: 'u-8', ownerName: 'Neha Agarwal (Demo)', verification: 'verified' }),
  prop('pr-2', '3 BHK independent house for sale', 'sale', 'Residential', 6200000, 'rc-vyas', { areaSqft: 1800, bedrooms: 3, bathrooms: 3, furnishing: 'unfurnished', amenities: ['Garden', 'Parking'], ownerType: 'agent', ownerName: 'Sample Realty (Demo)' }),
  prop('pr-3', 'Ground-floor shop on main road', 'rent', 'Shop', 18000, 'bhopalganj', { areaSqft: 300, furnishing: 'unfurnished', amenities: ['Road facing', 'Shutter'] }),
  prop('pr-4', 'Office space, 2nd floor', 'rent', 'Office', 22000, 'azad-nagar', { areaSqft: 700, furnishing: 'furnished', amenities: ['Lift', 'Washroom', 'Parking'] }),
  prop('pr-5', 'Industrial shed 5,000 sq ft', 'rent', 'Industrial', 75000, 'riico', { areaSqft: 5000, furnishing: 'unfurnished', amenities: ['3-phase power', 'Loading area'], ownerType: 'agent', ownerName: 'Sample Industrial Realty (Demo)' }),
  prop('pr-6', 'Residential plot 1,500 sq ft', 'sale', 'Plot', 2400000, 'suwana', { areaSqft: 1500, furnishing: 'unfurnished', amenities: ['Corner plot'] }),
  prop('pr-7', 'Agricultural land 2 bigha', 'sale', 'Agricultural land', 3500000, 'pur', { furnishing: 'unfurnished', amenities: ['Well', 'Road access'] }),
  prop('pr-8', 'Student PG with meals', 'rent', 'PG', 6500, 'azad-nagar', { furnishing: 'furnished', amenities: ['Wi-Fi', 'Meals', 'Laundry', 'Study table'], ownerId: 'u-8', ownerName: 'Neha Agarwal (Demo)', verification: 'verified', student: { meals: true, deposit: 6500, rules: ['Entry by 10 pm', 'No smoking'], occupancy: 'shared', restriction: 'women_only', nearInstitution: 'Medical college area (approx.)' } }),
  prop('pr-9', 'Single room for students', 'rent', 'Student room', 4000, 'kashipuri', { furnishing: 'semi', amenities: ['Attached bath', 'Wi-Fi'], student: { meals: false, deposit: 4000, rules: ['No loud music after 10 pm'], occupancy: 'single', restriction: 'none' } }),
  prop('pr-10', 'Boys hostel — shared rooms', 'rent', 'Hostel', 5500, 'subhash-nagar', { furnishing: 'furnished', amenities: ['Meals', 'Wi-Fi', 'Security'], student: { meals: true, deposit: 5000, rules: ['Gate closes 10:30 pm'], occupancy: 'shared', restriction: 'men_only', nearInstitution: 'College area (approx.)' } }),
  prop('pr-11', 'Shared flat — 1 bed available', 'rent', 'Shared accommodation', 3500, 'bapu-nagar', { furnishing: 'furnished', amenities: ['Kitchen', 'Wi-Fi'], student: { meals: false, deposit: 3500, rules: ['Share utilities'], occupancy: 'shared', restriction: 'none' } }),
  prop('pr-12', '1 BHK for rent', 'rent', 'Residential', 6000, 'sanganer', { areaSqft: 550, bedrooms: 1, bathrooms: 1, available: false })
];

const cls = (id: string, title: string, category: string, condition: Classified['condition'], price: number, localityId: string, sellerId: string, sellerName: string, description: string, extra: Partial<Classified> = {}): Classified => ({
  id, title, category, condition, price, localityId, sellerId, sellerName, description, negotiable: true, contactPref: 'chat', status: 'active',
  expiresAt: ahead(24 * 30), photos: 3, createdAt: ago(Number(id.slice(2)) * 11), demo: true, ...extra
});

export const classifieds = (): Classified[] => [
  cls('c-1', 'Honda Activa 6G, 2021', 'Two-wheelers', 'good', 52000, 'shastri-nagar', 'u-2', 'Priya M.', 'Single owner, regular service. Papers available for inspection in person.', { vehicle: { make: 'Honda', model: 'Activa 6G', year: 2021, km: 18500, owners: 1 } }),
  cls('c-2', 'Maruti Swift VXi, 2017', 'Cars', 'good', 365000, 'rc-vyas', 'u-11', 'Ramesh C.', 'Petrol, well maintained.', { vehicle: { make: 'Maruti Suzuki', model: 'Swift VXi', year: 2017, km: 64000, owners: 2 } }),
  cls('c-3', 'Redmi Note 12, 6/128', 'Mobile phones', 'like_new', 9500, 'azad-nagar', DEMO_USER_ID, 'Aarav S.', 'With box and bill. 10 months old.'),
  cls('c-4', 'NEET reference books set', 'Books', 'good', 1800, 'kashipuri', 'u-12', 'Pooja V.', 'Physics, chemistry, biology — light pencil marks.', { negotiable: false }),
  cls('c-5', 'Study table + chair', 'Student essentials', 'good', 2200, 'azad-nagar', 'u-9', 'Deepak T.', 'Moving out, must go this week.'),
  cls('c-6', 'Sheesham double bed', 'Furniture', 'fair', 9000, 'sanganer', 'u-4', 'Sunita K.', 'Solid wood, needs polish.'),
  cls('c-7', 'Samsung 7 kg washing machine', 'Home appliances', 'good', 7500, 'bapu-nagar', 'u-4', 'Sunita K.', 'Front load, working perfectly.'),
  cls('c-8', 'Dell laptop i5 8th gen', 'Computers', 'good', 21000, 'subhash-nagar', 'u-3', 'Rohit J.', '8 GB RAM, 256 GB SSD.'),
  cls('c-9', 'Cricket kit (junior)', 'Sports equipment', 'like_new', 2500, 'rc-vyas', 'u-12', 'Pooja V.', 'Bat, pads, gloves, helmet.'),
  cls('c-10', 'Industrial sewing machine', 'Commercial equipment', 'good', 14000, 'riico', 'u-3', 'Rohit J.', 'Juki model, serviced.'),
  cls('c-11', 'Drill machine + tool kit', 'Tools', 'new', 3200, 'pur', 'u-7', 'Mahendra G.', 'Unused gift.', { status: 'sold' }),
  cls('c-12', 'Bridal lehenga (worn once)', 'Fashion', 'like_new', 15000, 'subhash-nagar', 'u-2', 'Priya M.', 'Dry cleaned. Size M.')
];

const ev = (id: string, title: string, category: string, startsInH: number, durH: number, venue: string, localityId: string, organizer: string, description: string, tickets: [string, number, number][], extra: Partial<CityEvent> = {}): CityEvent => ({
  id, title, category, startsAt: ahead(startsInH), endsAt: ahead(startsInH + durH), venue, localityId, organizer, description,
  ticketTypes: tickets.map(([name, price, capacity], i) => ({ id: `${id}-t${i}`, name, price, capacity, sold: Math.round(capacity * 0.4) })),
  status: 'published', createdAt: ago(100), demo: true, ...extra
});

export const events = (): CityEvent[] => [
  ev('e-1', 'Textile Expo Bhilwara (Sample)', 'Exhibition', 24 * 9, 8 * 3, 'Sample exhibition ground', 'riico', 'Sample Traders Association (Demo)', 'A sample B2B exhibition of suiting, shirting and yarn suppliers.', [['Visitor pass', 0, 2000], ['Business delegate', 499, 300]]),
  ev('e-2', 'Garba Night 2026 (Sample)', 'Festival', 24 * 4 + 6, 5, 'Utsav Banquet & Lawns (Demo)', 'suwana', 'Utsav Banquet & Lawns (Demo)', 'Community garba evening with live dhol. Family event.', [['Single entry', 299, 500], ['Couple entry', 499, 200], ['Child (under 12)', 99, 200]]),
  ev('e-3', 'Phad Painting Workshop (Sample)', 'Workshop', 24 * 6, 3, 'Shiksha Sadan Library (Demo)', 'subhash-nagar', 'Sample Arts Collective (Demo)', 'Introductory workshop on the Phad scroll-painting tradition. Materials included.', [['Workshop seat', 650, 25]]),
  ev('e-4', 'Inter-School Cricket Cup (Sample)', 'Sports', 24 * 12, 8, 'Sample sports ground', 'kashipuri', 'Sample Sports Club (Demo)', 'Under-16 inter-school cricket tournament.', [['Free entry', 0, 1000]]),
  ev('e-5', 'MSME Digital Growth Meetup (Sample)', 'Business', 24 * 15, 3, 'Sample conference hall', 'azad-nagar', 'One Bhilwara (Demo)', 'Learn how to list your business, run offers and get enquiries online.', [['Business owner', 199, 120]]),
  ev('e-6', 'Sufi & Folk Evening (Sample)', 'Concert', 24 * 20, 3, 'Sample town hall', 'bhopalganj', 'Sample Cultural Society (Demo)', 'An evening of Rajasthani folk and Sufi music.', [['Silver', 300, 300], ['Gold', 600, 100]]),
  ev('e-7', 'Heritage Walk: Old City (Sample)', 'Religious & heritage', 24 * 3, 2, 'Meeting point: sample chowk', 'bhopalganj', 'Sample Heritage Volunteers (Demo)', 'Guided morning heritage walk.', [['Walk pass', 150, 40]])
];

export const labour = (): LabourPost[] => [
  { id: 'l-1', contractorId: 'u-6', contractorName: 'Mazboot Builders (Demo)', title: 'Masons for 3-storey residence', skill: 'Mason', workers: 4, wage: 900, wageUnit: 'day', localityId: 'suwana', duration: '6 weeks', startDate: dayStr(5), interests: [{ userId: 'u-9', name: 'Deepak T.', availability: 'From next week', at: ago(5), status: 'interested' }], status: 'open', createdAt: ago(30), demo: true },
  { id: 'l-2', contractorName: 'Sample Logistics (Demo)', title: 'Loading/unloading helpers', skill: 'Helper', workers: 6, wage: 650, wageUnit: 'day', localityId: 'riico', duration: '10 days', startDate: dayStr(2), interests: [], status: 'open', createdAt: ago(12), demo: true },
  { id: 'l-3', contractorName: 'Utsav Event Crew (Demo)', title: 'Wedding setup staff', skill: 'Event staff', workers: 10, wage: 800, wageUnit: 'day', localityId: 'pur', duration: '3 days', startDate: dayStr(8), interests: [], status: 'open', createdAt: ago(6), demo: true }
];

export const serviceRequests = (): ServiceRequest[] => [
  { id: 'sr-1', userId: DEMO_USER_ID, category: 'plumber', description: 'Kitchen sink leaking under the cabinet.', localityId: 'shastri-nagar', preferredDate: dayStr(1), preferredTime: 'Morning', urgency: 'same_day', photos: [], status: 'responded', responses: [{ providerId: 'p-1', providerName: 'Rakesh Plumbing Works (Demo)', message: 'Can come at 11 am. Visit charge ₹250 (sample).', quote: 250, at: ago(2), status: 'pending' }], history: [{ status: 'open', at: ago(4) }, { status: 'responded', at: ago(2), note: 'Simulated provider response' }], createdAt: ago(4), demo: true },
  { id: 'sr-2', userId: DEMO_USER_ID, category: 'ac', description: 'AC servicing before summer.', localityId: 'shastri-nagar', preferredDate: dayStr(-10), preferredTime: 'Evening', urgency: 'normal', photos: [], status: 'completed', responses: [{ providerId: 'p-12', providerName: 'CoolCare AC Service (Demo)', message: 'Done.', quote: 499, at: ago(250), status: 'accepted' }], confirmedProviderId: 'p-12', history: [{ status: 'open', at: ago(260) }, { status: 'confirmed', at: ago(250) }, { status: 'completed', at: ago(240) }], createdAt: ago(260), demo: true },
  { id: 'sr-3', userId: 'u-4', category: 'electrician', description: 'Inverter not charging.', localityId: 'bapu-nagar', preferredDate: dayStr(0), preferredTime: 'Afternoon', urgency: 'same_day', photos: [], status: 'open', responses: [], history: [{ status: 'open', at: ago(1) }], createdAt: ago(1), demo: true },
  { id: 'sr-4', userId: 'u-2', category: 'plumber', description: 'Overhead tank overflow valve replacement.', localityId: 'azad-nagar', preferredDate: dayStr(2), preferredTime: 'Morning', urgency: 'normal', photos: [], status: 'open', responses: [], history: [{ status: 'open', at: ago(3) }], createdAt: ago(3), demo: true }
];

export const concierge = (): ConciergeRequest[] => [
  { id: 'cr-1', userId: DEMO_USER_ID, serviceType: 'Home deep cleaning before Diwali', localityId: 'shastri-nagar', preferredTime: dayStr(6), budget: 3000, notes: '3 BHK, includes kitchen.', feeAccepted: true, status: 'coordinator_assigned', coordinator: 'Coordinator (Demo)', suggestions: ['p-9', 'p-17'], history: [{ status: 'received', at: ago(26) }, { status: 'coordinator_assigned', at: ago(20), note: 'Simulated — no real coordinator in demo' }], createdAt: ago(26), demo: true }
];

export const enquiries = (): Enquiry[] => [
  { id: 'q-1', targetType: 'business', targetId: 'b-1', targetName: 'Mewar Fresh Mart (Demo)', ownerId: 'u-3', fromUserId: 'u-2', name: 'Priya M.', mobile: '9811111111', message: 'Do you deliver to Azad Nagar?', consent: true, status: 'new', replies: [], createdAt: ago(5), demo: true },
  { id: 'q-2', targetType: 'property', targetId: 'pr-1', targetName: '2 BHK flat for rent near park', ownerId: 'u-8', fromUserId: DEMO_USER_ID, name: 'Aarav Sharma', mobile: '9876543210', message: 'Is it available from next month?', consent: true, status: 'responded', replies: [{ from: 'Owner (Demo)', text: 'Yes, available from the 1st.', at: ago(10) }], createdAt: ago(30), demo: true },
  { id: 'q-3', targetType: 'classified', targetId: 'c-3', targetName: 'Redmi Note 12, 6/128', ownerId: DEMO_USER_ID, fromUserId: 'u-9', name: 'Deepak T.', mobile: '9812345670', message: 'Final price?', consent: true, status: 'new', replies: [], createdAt: ago(3), demo: true },
  { id: 'q-4', targetType: 'business', targetId: 'b-1', targetName: 'Mewar Fresh Mart (Demo)', ownerId: 'u-3', fromUserId: 'u-12', name: 'Pooja V.', mobile: '9898989898', message: 'Can I order on WhatsApp?', consent: true, status: 'responded', replies: [{ from: 'Mewar Fresh Mart (Demo)', text: 'Yes, through the enquiry form for now.', at: ago(40) }], createdAt: ago(48), demo: true }
];

export const bookings = (): Booking[] => [
  { id: 'bk-1', kind: 'event', refId: 'e-7', title: 'Heritage Walk: Old City (Sample)', userId: DEMO_USER_ID, reference: 'DEMO-HW7K2', lines: [{ label: 'Walk pass', qty: 2, price: 150 }], total: 300, attendees: ['Aarav Sharma', 'Guest'], status: 'demo_confirmed', date: ahead(72), createdAt: ago(20), demo: true }
];
