import type { DBState, Settings } from '@/types/models';
import { businesses, DEMO_USER_ID, healthcare, institutions, professionals, providers, users } from './directory';
import { applications, bookings, classifieds, concierge, enquiries, events, jobs, labour, properties, serviceRequests } from './listings';
import { alerts, articles, comments, polls, posts, schemes } from './content';
import { ago, ahead, dayStr } from './time';

export const DB_VERSION = 1;

export const defaultSettings = (): Settings => ({
  fees: { conciergeFee: 99, recruitmentFeePercent: 8.33, featuredJob: 299, urgentJob: 149, eventBookingFeePercent: 2, serviceCommissionPercent: 0, gstPercent: 18 },
  plans: [
    { id: 'biz-free', name: 'Basic listing', price: 0, period: 'month', audience: 'business', features: ['Business profile', '5 photos', 'Enquiry button', 'Reviews'] },
    { id: 'biz-plus', name: 'Premium profile', price: 499, period: 'month', audience: 'business', features: ['Everything in Basic', '30 photos + catalogue', 'Website & social links', 'Offers & vouchers', 'Basic analytics'] },
    { id: 'biz-pro', name: 'Growth', price: 1499, period: 'month', audience: 'business', features: ['Everything in Premium', 'Featured placement (1 category)', 'Lead insights', 'Priority support'] },
    { id: 'emp-starter', name: 'Job post pack (3)', price: 599, period: 'month', audience: 'employer', features: ['3 job posts', '30-day visibility', 'Applicant dashboard'] },
    { id: 'emp-pro', name: 'Employer Pro', price: 1999, period: 'month', audience: 'employer', features: ['Unlimited posts', '2 featured jobs', 'Candidate search (demo)'] },
    { id: 'prop-boost', name: 'Property boost', price: 299, period: 'month', audience: 'property', features: ['Top of locality results', 'Highlighted card'] }
  ],
  featureFlags: { b2b: true, insights: true, matrimonial: true, spinWheel: true, aiAssistant: true, podcasts: true },
  pointsRules: { poll_vote: 5, daily_checkin: 2, place_checkin: 10, challenge: 25, review: 0, campaign: 5 },
  categories: [],
  notificationTemplates: [
    { id: 'app-status', name: 'Application status', text: 'Your application for {job} is now {status}.' },
    { id: 'poll-result', name: 'Poll results', text: 'Results are out for “{poll}”.' },
    { id: 'request-response', name: 'Provider response', text: '{provider} responded to your {service} request.' }
  ]
});

/** Build a fresh demo database. Timestamps are relative to now. */
export function buildSeed(): DBState {
  return {
    version: DB_VERSION,
    seededAt: new Date().toISOString(),
    users: users(),
    businesses: businesses(),
    verificationRequests: [
      { id: 'vr-1', businessId: 'b-3', businessName: 'Sutradhar Suitings Outlet (Demo)', submittedBy: 'u-3', documents: ['GST certificate (demo file)', 'Shop photo (demo)'], status: 'under_review', createdAt: ago(40), demo: true },
      { id: 'vr-2', businessId: 'b-7', businessName: 'Lakdi Ghar Furniture (Demo)', submittedBy: 'u-3', documents: ['Udyam certificate (demo file)'], status: 'submitted', createdAt: ago(10), demo: true },
      { id: 'vr-3', businessId: 'b-16', businessName: 'Navrang Weaving Works (Demo)', submittedBy: 'u-6', documents: ['Factory licence (demo file)'], status: 'submitted', createdAt: ago(6), demo: true }
    ],
    providers: providers(),
    serviceRequests: serviceRequests(),
    concierge: concierge(),
    reviews: [
      { id: 'r-1', targetType: 'business', targetId: 'b-1', userId: 'u-2', userName: 'Priya M.', rating: 5, text: 'Fresh vegetables and quick delivery.', verifiedTransaction: false, reply: { text: 'Thank you! (demo reply)', at: ago(20) }, createdAt: ago(50), demo: true },
      { id: 'r-2', targetType: 'business', targetId: 'b-1', userId: 'u-11', userName: 'Ramesh C.', rating: 4, text: 'Good range, a bit crowded on Sundays.', verifiedTransaction: false, createdAt: ago(120), demo: true },
      { id: 'r-3', targetType: 'provider', targetId: 'p-1', userId: 'u-4', userName: 'Sunita K.', rating: 5, text: 'Fixed the leak in 30 minutes, fair charge.', verifiedTransaction: false, createdAt: ago(70), demo: true },
      { id: 'r-4', targetType: 'provider', targetId: 'p-12', userId: DEMO_USER_ID, userName: 'Aarav S.', rating: 4, text: 'On time, explained the issue.', verifiedTransaction: true, createdAt: ago(230), demo: true },
      { id: 'r-5', targetType: 'business', targetId: 'b-2', userId: 'u-12', userName: 'Pooja V.', rating: 5, text: 'Best dal baati in town!', verifiedTransaction: false, createdAt: ago(30), demo: true },
      { id: 'r-6', targetType: 'institution', targetId: 'i-2', userId: 'u-9', userName: 'Deepak T.', rating: 4, text: 'Helpful faculty, crowded batches.', verifiedTransaction: false, createdAt: ago(300), demo: true, reported: true },
      { id: 'r-7', targetType: 'vendor', targetId: 'b-10', userId: 'u-2', userName: 'Priya M.', rating: 5, text: 'Beautiful candid photos.', verifiedTransaction: false, createdAt: ago(400), demo: true }
    ],
    jobs: jobs(),
    applications: applications(),
    recruitment: [{ id: 'rr-1', userId: 'u-6', company: 'Sutradhar Suitings Outlet (Demo)', role: 'Store manager', category: 'Retail & hospitality', experience: '3+ years', budget: 25000, localityId: 'riico', openings: 1, feeAccepted: true, status: 'sourcing', createdAt: ago(48), demo: true }],
    labour: labour(),
    properties: properties(),
    classifieds: classifieds(),
    enquiries: enquiries(),
    articles: articles(),
    alerts: alerts(),
    comments: comments(),
    posts: posts(),
    polls: polls(),
    votes: [],
    events: events(),
    bookings: bookings(),
    institutions: institutions(),
    healthcare: healthcare(),
    healthAssist: [],
    schemes: schemes(),
    professionals: professionals(),
    notifications: [
      { id: 'nt-1', userId: DEMO_USER_ID, type: 'job', title: 'Application shortlisted', body: 'Accounts Executive — Sutradhar Suitings Outlet (Demo)', link: '/applications', read: false, createdAt: ago(20), demo: true },
      { id: 'nt-2', userId: DEMO_USER_ID, type: 'service', title: 'Provider responded', body: 'Rakesh Plumbing Works (Demo) replied to your plumber request (simulated).', link: '/service-requests/sr-1', read: false, createdAt: ago(2), demo: true },
      { id: 'nt-3', userId: 'all', type: 'alert', title: 'Water supply interruption (simulated)', body: 'Shastri Nagar · 10 am–4 pm', link: '/alerts', read: false, createdAt: ago(2), demo: true },
      { id: 'nt-4', userId: DEMO_USER_ID, type: 'comment', title: 'New reply to your comment', body: 'Pooja V. replied on “Ward cleanliness drive…”', link: '/news/n-1', read: true, createdAt: ago(1), demo: true },
      { id: 'nt-5', userId: DEMO_USER_ID, type: 'property', title: 'Owner replied to your enquiry', body: '2 BHK flat for rent near park', link: '/profile?tab=enquiries', read: true, createdAt: ago(10), demo: true },
      { id: 'nt-6', userId: DEMO_USER_ID, type: 'event', title: 'Event reminder', body: 'Heritage Walk: Old City (Sample) is in 3 days.', link: '/events/e-7', read: false, createdAt: ago(5), demo: true },
      { id: 'nt-7', userId: 'all', type: 'news', title: 'New local story', body: 'New community park benches in R.C. Vyas Colony (sample)', link: '/news/n-14', read: false, createdAt: ago(3), demo: true },
      { id: 'nt-8', userId: DEMO_USER_ID, type: 'job_match', title: 'New job match', body: 'Accounts roles near Azad Nagar match your profile.', link: '/jobs?category=Accounting%20%26%20finance', read: false, createdAt: ago(7), demo: true }
    ],
    offers: [
      { id: 'of-1', title: '10% off on first home delivery', businessId: 'b-1', businessName: 'Mewar Fresh Mart (Demo)', description: 'Sample voucher for first-time delivery orders.', benefit: '10% off (max ₹100)', category: 'Grocery', validFrom: dayStr(-5), validTo: dayStr(20), terms: ['Sample offer — not redeemable', 'One per user', 'Minimum order as set by business'], redemption: 'Show the voucher code at checkout (demo).', sponsored: true, status: 'active', createdAt: ago(100), demo: true },
      { id: 'of-2', title: 'Free dessert with family thali', businessId: 'b-2', businessName: 'Kesar Thali House (Demo)', description: 'Sample restaurant deal.', benefit: 'Free dessert', category: 'Restaurants & cafes', validFrom: dayStr(-2), validTo: dayStr(10), terms: ['Sample offer — not redeemable', 'Dine-in only'], redemption: 'Show code to staff (demo).', status: 'active', createdAt: ago(40), demo: true },
      { id: 'of-3', title: 'Diwali deep-cleaning ₹300 off', businessId: 'b-18', businessName: 'Gharelu Seva Kendra (Demo)', description: 'Festival service discount (sample).', benefit: '₹300 off on 3 BHK', category: 'Home services', validFrom: dayStr(-1), validTo: dayStr(25), terms: ['Sample offer — not redeemable'], redemption: 'Quote the code while booking (demo).', status: 'active', createdAt: ago(20), demo: true },
      { id: 'of-4', title: 'Free screen guard with phone purchase', businessId: 'b-4', businessName: 'Chhaya Electronics (Demo)', description: 'Sample electronics offer.', benefit: 'Free screen guard', category: 'Electronics', validFrom: dayStr(-10), validTo: dayStr(-1), terms: ['Sample offer'], redemption: 'In store (demo).', status: 'expired', createdAt: ago(300), demo: true },
      { id: 'of-5', title: '15% off on garba passes', businessId: 'b-9', businessName: 'Utsav Banquet & Lawns (Demo)', description: 'Event offer (sample).', benefit: '15% off', category: 'Events & weddings', validFrom: dayStr(-1), validTo: dayStr(4), terms: ['Sample offer — not redeemable'], redemption: 'Apply during demo booking.', sponsored: true, status: 'active', createdAt: ago(20), demo: true }
    ],
    vouchers: [],
    points: [
      { id: 'pt-1', userId: DEMO_USER_ID, action: 'poll_vote', points: 5, at: ago(100), note: 'Voted in a community poll' },
      { id: 'pt-2', userId: DEMO_USER_ID, action: 'place_checkin', points: 10, at: ago(200), note: 'Checked in: Harni Mahadev (demo)' }
    ],
    cases: [
      { id: 'cs-1', kind: 'report', targetType: 'comment', targetId: 'cm-5', targetTitle: 'Comment on “Textile units explore rooftop solar…”', reason: 'Spam or misleading', details: 'Looks promotional.', reporterId: 'u-2', status: 'open', createdAt: ago(3), demo: true },
      { id: 'cs-2', kind: 'report', targetType: 'classified', targetId: 'c-2', targetTitle: 'Maruti Swift VXi, 2017', reason: 'Suspected fake listing', details: 'Price seems too low.', reporterId: 'u-12', status: 'reviewing', createdAt: ago(20), demo: true },
      { id: 'cs-3', kind: 'complaint', targetType: 'provider', targetId: 'p-6', targetTitle: 'Speed Auto Garage (Demo)', reason: 'No-show', details: 'Provider did not arrive at the agreed time.', reporterId: DEMO_USER_ID, status: 'open', createdAt: ago(30), demo: true },
      { id: 'cs-4', kind: 'report', targetType: 'review', targetId: 'r-6', targetTitle: 'Review on Lakshya Coaching Centre (Demo)', reason: 'Inappropriate', details: '', reporterId: 'u-3', status: 'open', createdAt: ago(8), demo: true },
      { id: 'cs-5', kind: 'dispute', targetType: 'booking', targetId: 'bk-1', targetTitle: 'Heritage Walk booking', reason: 'Refund question', details: 'Asked about cancellation policy.', reporterId: DEMO_USER_ID, status: 'actioned', resolution: 'Explained policy (demo).', createdAt: ago(60), demo: true }
    ],
    campaigns: [
      { id: 'ad-1', businessId: 'b-1', businessName: 'Mewar Fresh Mart (Demo)', objective: 'enquiries', placement: 'home', localityId: 'shastri-nagar', category: 'Grocery', startDate: dayStr(-7), endDate: dayStr(23), budget: 3000, headline: 'Fresh vegetables delivered in 30 minutes*', status: 'live', impressions: 4210, clicks: 186, createdAt: ago(170), demo: true },
      { id: 'ad-2', businessId: 'b-9', businessName: 'Utsav Banquet & Lawns (Demo)', objective: 'awareness', placement: 'festival', localityId: 'all', category: 'Events & weddings', startDate: dayStr(-2), endDate: dayStr(12), budget: 8000, headline: 'Book your wedding season dates', status: 'live', impressions: 2980, clicks: 97, createdAt: ago(50), demo: true },
      { id: 'ad-3', businessId: 'b-4', businessName: 'Chhaya Electronics (Demo)', objective: 'visits', placement: 'category', localityId: 'all', category: 'Electronics', startDate: dayStr(2), endDate: dayStr(16), budget: 2500, headline: 'Festival phone exchange offers', status: 'pending_review', impressions: 0, clicks: 0, createdAt: ago(5), demo: true }
    ],
    payments: [
      { id: 'pay-1', userId: 'u-3', description: 'Premium profile — 1 month (demo)', amount: 499, gst: 90, status: 'demo_success', invoiceNo: 'DEMO-INV-0001', plan: 'biz-plus', kind: 'subscription', createdAt: ago(200), demo: true },
      { id: 'pay-2', userId: 'u-6', description: 'Featured job: Accounts Executive (demo)', amount: 299, gst: 54, status: 'demo_success', invoiceNo: 'DEMO-INV-0002', kind: 'job_package', createdAt: ago(90), demo: true }
    ],
    audit: [
      { id: 'au-1', at: ago(48), actorId: 'u-10', actorName: 'Admin Desk', action: 'verify_business', target: 'b-1', details: 'Approved verification (demo)' },
      { id: 'au-2', at: ago(30), actorId: 'u-10', actorName: 'Admin Desk', action: 'suspend_user', target: 'u-12', details: 'Spam reports (demo)' }
    ],
    matrimonial: [
      { id: 'mt-1', userId: 'u-12', displayName: 'P. V. (Demo)', age: 27, education: 'M.Sc', profession: 'Teacher', generalLocation: 'Bhilwara', about: 'Sample profile for demo only.', preferences: 'Educated, family-oriented (sample)', photoVisibility: 'on_accept', contactVisibility: 'hidden', interestsReceived: [], interestsSent: [], status: 'active', createdAt: ago(300), demo: true },
      { id: 'mt-2', userId: 'u-9', displayName: 'D. T. (Demo)', age: 29, education: 'B.Com', profession: 'Accountant', generalLocation: 'Bhilwara district', about: 'Sample profile for demo only.', preferences: 'Sample preferences', photoVisibility: 'hidden', contactVisibility: 'hidden', interestsReceived: [], interestsSent: [], status: 'active', createdAt: ago(250), demo: true },
      { id: 'mt-3', userId: 'u-11', displayName: 'R. C. (Demo)', age: 31, education: 'B.Tech', profession: 'Engineer', generalLocation: 'Rajasthan', about: 'Sample profile for demo only.', preferences: 'Sample preferences', photoVisibility: 'on_accept', contactVisibility: 'hidden', interestsReceived: [], interestsSent: [], status: 'active', createdAt: ago(200), demo: true }
    ],
    b2b: [
      { id: 'bb-1', company: 'Sample Garments Unit (Demo)', kind: 'buy', product: 'Polyester-viscose suiting, 10,000 m', quantity: '10,000 m', localityId: 'riico', details: 'Need samples first. Delivery in 30 days.', status: 'open', createdAt: ago(20), demo: true },
      { id: 'bb-2', company: 'Sangam Yarn Traders (Demo)', kind: 'sell', product: 'PV yarn 2/30s', quantity: '5 tonnes/month', localityId: 'riico', details: 'Regular supply available (as stated).', status: 'open', createdAt: ago(60), demo: true }
    ],
    saved: [
      { userId: DEMO_USER_ID, type: 'job', id: 'j-1', at: ago(70) },
      { userId: DEMO_USER_ID, type: 'property', id: 'pr-8', at: ago(40) },
      { userId: DEMO_USER_ID, type: 'article', id: 'n-2', at: ago(4) }
    ],
    checkins: [],
    spins: [],
    ai: [],
    searches: ['plumber', 'PG near college', 'part-time jobs'],
    settings: defaultSettings()
  };
}

export { DEMO_USER_ID, ahead };
