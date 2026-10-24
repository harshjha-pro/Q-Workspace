import type { Locality, Role } from '@/types/models';

/** Editable sample locality list (admin → Settings → Localities in production). */
export const LOCALITIES: Locality[] = [
  { id: 'all', name: 'All Bhilwara', nameHi: 'संपूर्ण भीलवाड़ा', zone: 'Central' },
  { id: 'azad-nagar', name: 'Azad Nagar', nameHi: 'आज़ाद नगर', zone: 'Central' },
  { id: 'shastri-nagar', name: 'Shastri Nagar', nameHi: 'शास्त्री नगर', zone: 'Central' },
  { id: 'subhash-nagar', name: 'Subhash Nagar', nameHi: 'सुभाष नगर', zone: 'North' },
  { id: 'rc-vyas', name: 'R.C. Vyas Colony', nameHi: 'आर.सी. व्यास कॉलोनी', zone: 'South' },
  { id: 'bapu-nagar', name: 'Bapu Nagar', nameHi: 'बापू नगर', zone: 'East' },
  { id: 'kashipuri', name: 'Kashipuri', nameHi: 'काशीपुरी', zone: 'West' },
  { id: 'bhopalganj', name: 'Bhopalganj', nameHi: 'भोपालगंज', zone: 'Central' },
  { id: 'sanganer', name: 'Sanganer', nameHi: 'सांगानेर', zone: 'Outskirts' },
  { id: 'pur', name: 'Pur', nameHi: 'पुर', zone: 'Outskirts' },
  { id: 'suwana', name: 'Suwana', nameHi: 'सुवाणा', zone: 'Outskirts' },
  { id: 'pansal', name: 'Pansal', nameHi: 'पांसल', zone: 'Outskirts' },
  { id: 'riico', name: 'RIICO Industrial Area', nameHi: 'रीको औद्योगिक क्षेत्र', zone: 'Outskirts' }
];

export const localityName = (id: string | undefined, lang: 'en' | 'hi' = 'en') => {
  const l = LOCALITIES.find((x) => x.id === id);
  if (!l) return 'Bhilwara';
  return lang === 'hi' ? l.nameHi : l.name;
};

export const ROLES: { id: Role; label: string; desc: string }[] = [
  { id: 'resident', label: 'Resident', desc: 'News, services, community, shopping' },
  { id: 'business', label: 'Business owner', desc: 'Listing, enquiries, offers, ads' },
  { id: 'provider', label: 'Service provider', desc: 'Service requests, claims, reviews' },
  { id: 'jobseeker', label: 'Job seeker', desc: 'Jobs, applications, candidate profile' },
  { id: 'employer', label: 'Employer', desc: 'Post jobs, applicants, recruitment' },
  { id: 'owner', label: 'Property owner', desc: 'Listings, enquiries, performance' },
  { id: 'admin', label: 'Administrator', desc: 'Moderation, verification, settings' }
];

export const SERVICE_CATEGORIES = [
  { id: 'plumber', name: 'Plumbers', icon: 'Wrench' },
  { id: 'electrician', name: 'Electricians', icon: 'Zap' },
  { id: 'carpenter', name: 'Carpenters', icon: 'Hammer' },
  { id: 'mechanic', name: 'Mechanics', icon: 'Car' },
  { id: 'salon', name: 'Barbers & salons', icon: 'Scissors' },
  { id: 'beautician', name: 'Beauticians', icon: 'Sparkles' },
  { id: 'cleaning', name: 'Cleaners', icon: 'SprayCan' },
  { id: 'housekeeping', name: 'Housekeeping', icon: 'House' },
  { id: 'painter', name: 'Painters', icon: 'PaintRoller' },
  { id: 'appliance', name: 'Appliance repair', icon: 'WashingMachine' },
  { id: 'ac', name: 'AC repair', icon: 'AirVent' },
  { id: 'pest', name: 'Pest control', icon: 'Bug' },
  { id: 'movers', name: 'Packers & movers', icon: 'Truck' },
  { id: 'delivery', name: 'Delivery helpers', icon: 'Bike' },
  { id: 'helper', name: 'Household helpers', icon: 'HandHelping' },
  { id: 'labour', name: 'Construction labour', icon: 'HardHat' },
  { id: 'contractor', name: 'Contractors', icon: 'Building2' },
  { id: 'event-staff', name: 'Event workers', icon: 'PartyPopper' },
  { id: 'wedding-services', name: 'Wedding services', icon: 'Heart' },
  { id: 'gardener', name: 'Gardeners', icon: 'Flower2' },
  { id: 'tutor', name: 'Tutors', icon: 'GraduationCap' },
  { id: 'device-repair', name: 'Computer & mobile repair', icon: 'Smartphone' },
  { id: 'other', name: 'Other professionals', icon: 'Briefcase' }
] as const;

export const serviceName = (id: string) => SERVICE_CATEGORIES.find((c) => c.id === id)?.name ?? id;

export const JOB_CATEGORIES = [
  'Sales', 'Office & admin', 'Accounting & finance', 'Textile industry', 'Retail & hospitality', 'Drivers & delivery',
  'Skilled labour', 'Unskilled labour', 'Healthcare', 'Education', 'Technology', 'Student jobs', 'Seasonal'
];

export const PROPERTY_CATEGORIES = [
  'Residential', 'Commercial', 'Shop', 'Office', 'Industrial', 'Plot', 'Agricultural land', 'PG', 'Hostel', 'Student room', 'Shared accommodation'
];

export const CLASSIFIED_CATEGORIES = [
  'Cars', 'Two-wheelers', 'Mobile phones', 'Computers', 'Electronics', 'Furniture', 'Home appliances', 'Books',
  'Student essentials', 'Fashion', 'Sports equipment', 'Tools', 'Commercial equipment', 'Other goods'
];

export const BUSINESS_CATEGORIES = [
  'Grocery', 'Restaurants & cafes', 'Retail', 'Clothing', 'Jewellery', 'Electronics', 'Furniture', 'Healthcare', 'Education',
  'Professional services', 'Manufacturers', 'Textile', 'Wholesale', 'Home services', 'Automotive', 'Events & weddings',
  'Transport', 'Courier', 'Hotels', 'Other'
];

export const WEDDING_CATEGORIES = [
  'Venues', 'Banquet halls', 'Photographers', 'Videographers', 'Makeup artists', 'Mehendi artists', 'Decorators', 'Caterers',
  'Jewellery', 'Boutiques', 'Invitations', 'DJs & entertainers', 'Event planners', 'Wedding transport', 'Accommodation'
];

export const NEWS_CATEGORIES = [
  { id: 'bhilwara', name: 'Bhilwara' },
  { id: 'rajasthan', name: 'Rajasthan' },
  { id: 'india', name: 'India' },
  { id: 'world', name: 'World' },
  { id: 'civic', name: 'Civic updates' },
  { id: 'traffic', name: 'Traffic & roads' },
  { id: 'notices', name: 'Public notices' },
  { id: 'education', name: 'Education' },
  { id: 'business', name: 'Business & textile' },
  { id: 'sports', name: 'Sports' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'events', name: 'Local events' },
  { id: 'social', name: 'Weddings & social' },
  { id: 'agriculture', name: 'Agriculture & mandi' }
];

export const newsCategoryName = (id: string) => NEWS_CATEGORIES.find((c) => c.id === id)?.name ?? id;

export const INTERESTS = ['News', 'Jobs', 'Property', 'Services', 'Events', 'Education', 'Agriculture', 'Shopping', 'Sports', 'Business', 'Health', 'Government'];

export const EVENT_CATEGORIES = ['Festival', 'Cultural', 'Exhibition', 'Religious & heritage', 'Workshop', 'Business', 'Sports', 'Concert', 'Community'];

export const EDUCATION_CATEGORIES = ['School', 'College', 'Coaching', 'Tuition', 'Skill development', 'Vocational', 'Competitive exams', 'Library'];

export const HEALTH_TYPES = ['Hospital', 'Clinic', 'Doctor', 'Diagnostics', 'Pharmacy', 'Ambulance', 'Physiotherapy'];

export const PROFESSIONS = ['Chartered accountant', 'Accountant', 'Company secretary', 'Lawyer', 'Tax consultant', 'Insurance advisor', 'Financial planner', 'Loan consultant', 'Business consultant'];

export const FINANCE_CATEGORIES = ['Bank accounts', 'Business loans', 'Personal loans', 'Vehicle loans', 'Home loans', 'Insurance', 'Credit cards', 'Savings & investments'];

/** Discover categories — each has its own landing page at /discover/:slug */
export const DISCOVER = [
  { slug: 'news-community', name: 'News & Community', icon: 'Newspaper', route: '/news', color: 'navy' },
  { slug: 'services', name: 'Local Services', icon: 'Wrench', route: '/services', color: 'teal' },
  { slug: 'jobs', name: 'Jobs & Careers', icon: 'BriefcaseBusiness', route: '/jobs', color: 'blue' },
  { slug: 'property', name: 'Property & Rentals', icon: 'House', route: '/property', color: 'violet' },
  { slug: 'marketplace', name: 'Buy & Sell', icon: 'ShoppingBag', route: '/marketplace', color: 'amber' },
  { slug: 'education', name: 'Education', icon: 'GraduationCap', route: '/education', color: 'indigo' },
  { slug: 'healthcare', name: 'Healthcare', icon: 'HeartPulse', route: '/healthcare', color: 'rose' },
  { slug: 'agriculture', name: 'Agriculture', icon: 'Wheat', route: '/agriculture', color: 'green' },
  { slug: 'government', name: 'Government & e-Mitra', icon: 'Landmark', route: '/government', color: 'slate' },
  { slug: 'weddings-events', name: 'Weddings & Events', icon: 'PartyPopper', route: '/weddings', color: 'pink' },
  { slug: 'food-shopping', name: 'Food & Shopping', icon: 'UtensilsCrossed', route: '/businesses', color: 'orange' },
  { slug: 'travel', name: 'Travel & Transport', icon: 'Bus', route: '/transport', color: 'cyan' },
  { slug: 'professionals', name: 'Professional Services', icon: 'Scale', route: '/professionals', color: 'navy' },
  { slug: 'finance', name: 'Finance', icon: 'Landmark', route: '/finance', color: 'emerald' },
  { slug: 'directory', name: 'Business Directory', icon: 'Store', route: '/businesses', color: 'teal' }
] as const;

export const HOME_SECTIONS = [
  { id: 'alerts', name: 'City alerts' },
  { id: 'news', name: 'Local news' },
  { id: 'community', name: 'Discussions & polls' },
  { id: 'services', name: 'Nearby services' },
  { id: 'jobs', name: 'Jobs' },
  { id: 'property', name: 'Property & PG' },
  { id: 'marketplace', name: 'Buy & sell' },
  { id: 'events', name: 'Events & weddings' },
  { id: 'mandi', name: 'Mandi prices' },
  { id: 'government', name: 'Schemes & services' },
  { id: 'businesses', name: 'Featured businesses' },
  { id: 'offers', name: 'Offers' },
  { id: 'recommended', name: 'Recommended for you' }
];

export const EMERGENCY_NUMBERS = [
  { num: '112', label: 'All emergencies' },
  { num: '100', label: 'Police' },
  { num: '108', label: 'Ambulance' },
  { num: '101', label: 'Fire' },
  { num: '1090', label: 'Women helpline (Rajasthan Police)' },
  { num: '1098', label: 'Childline' },
  { num: '1930', label: 'Cyber fraud' },
  { num: '181', label: 'Rajasthan Sampark' }
];
