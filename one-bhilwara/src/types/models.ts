/* One Bhilwara data model. Mirrors supabase/schema.sql so the local demo adapter and a
   real backend share the same shapes. Every record carries `demo` when it is sample data. */

export type ID = string;
export type ISODate = string;

export interface Base {
  id: ID;
  createdAt: ISODate;
  updatedAt?: ISODate;
  /** true for seeded sample data or anything produced only in demo mode */
  demo?: boolean;
}

export type Role = 'resident' | 'business' | 'provider' | 'jobseeker' | 'employer' | 'owner' | 'admin';
export type Verification = 'unverified' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'suspended';
export type Lang = 'en' | 'hi';

export interface Locality {
  id: ID;
  name: string;
  nameHi: string;
  zone: 'Central' | 'North' | 'South' | 'East' | 'West' | 'Outskirts';
}

export interface CandidateProfile {
  headline: string;
  education: string;
  skills: string[];
  experienceYears: number;
  preferredRole: string;
  preferredSalary: number;
  preferredLocalityId: ID;
  availability: 'immediate' | '15_days' | '30_days' | 'part_time';
  resumeName?: string;
  visibility: 'employers' | 'private';
}

export interface User extends Base {
  name: string;
  mobile?: string;
  email?: string;
  localityId: ID;
  role: Role;
  bio?: string;
  interests: string[];
  status: 'active' | 'suspended';
  privacy: { showContact: boolean; profilePublic: boolean; personalisedFeed: boolean };
  candidate?: CandidateProfile;
  following: ID[];
  blocked: ID[];
}

export interface Preferences {
  lang: Lang;
  localityId: ID;
  localities: ID[];
  interests: string[];
  newsCategories: string[];
  jobCategories: string[];
  homeSections: string[];
  notifyCategories: string[];
  pushAsked: boolean;
  followedMedia: string[];
}

export interface Business extends Base {
  name: string;
  category: string;
  description: string;
  address: string;
  localityId: ID;
  phone?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  hours: string;
  priceRange: 1 | 2 | 3 | 4;
  products: string[];
  tags: string[];
  verification: Verification;
  ownerId?: ID;
  claimed: boolean;
  rating: number;
  reviewCount: number;
  views: number;
  clicks: number;
  leads: number;
  premium?: boolean;
  sponsored?: boolean;
  b2b?: boolean;
  wedding?: string;
}

export interface VerificationRequest extends Base {
  businessId: ID;
  businessName: string;
  submittedBy: ID;
  documents: string[];
  status: Verification;
  note?: string;
}

export interface Provider extends Base {
  name: string;
  category: string;
  description: string;
  localityId: ID;
  rating: number;
  reviewCount: number;
  priceFrom?: number;
  priceUnit?: 'visit' | 'hour' | 'day' | 'job';
  availability: 'available' | 'busy' | 'offline';
  emergency: boolean;
  verification: Verification;
  experienceYears: number;
  languages: string[];
  /** Only shown if the provider consented to activity status */
  lastActiveAt?: ISODate;
  activityConsent: boolean;
  ownerId?: ID;
  seasonal?: boolean;
}

export type RequestStatus = 'open' | 'responded' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface ProviderResponse {
  providerId: ID;
  providerName: string;
  message: string;
  quote?: number;
  at: ISODate;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
}

export interface StatusEntry { status: string; at: ISODate; note?: string }

export interface ServiceRequest extends Base {
  userId: ID;
  category: string;
  description: string;
  localityId: ID;
  preferredDate: string;
  preferredTime: string;
  urgency: 'normal' | 'same_day' | 'emergency';
  photos: string[];
  status: RequestStatus;
  responses: ProviderResponse[];
  confirmedProviderId?: ID;
  history: StatusEntry[];
  reviewed?: boolean;
}

export interface ConciergeRequest extends Base {
  userId: ID;
  serviceType: string;
  localityId: ID;
  preferredTime: string;
  budget: number;
  notes: string;
  feeAccepted: boolean;
  status: 'received' | 'coordinator_assigned' | 'options_shared' | 'arranged' | 'closed' | 'cancelled';
  coordinator?: string;
  suggestions: ID[];
  history: StatusEntry[];
}

export interface Review extends Base {
  targetType: 'business' | 'provider' | 'institution' | 'vendor' | 'professional';
  targetId: ID;
  userId: ID;
  userName: string;
  rating: number;
  text: string;
  reply?: { text: string; at: ISODate };
  verifiedTransaction: boolean;
  reported?: boolean;
  hidden?: boolean;
}

export type JobType = 'full_time' | 'part_time' | 'internship' | 'wfh' | 'temporary';

export interface Job extends Base {
  title: string;
  employerName: string;
  employerId?: ID;
  category: string;
  type: JobType;
  localityId: ID;
  salaryMin: number;
  salaryMax: number;
  salaryPeriod: 'month' | 'day' | 'hour';
  experience: string;
  education: string;
  skills: string[];
  description: string;
  benefits: string[];
  deadline: string;
  verifiedEmployer: boolean;
  status: 'open' | 'closed' | 'pending_review' | 'removed';
  featured?: boolean;
  urgent?: boolean;
  postedBy?: ID;
}

export type ApplicationStatus = 'submitted' | 'under_review' | 'shortlisted' | 'interview' | 'selected' | 'rejected' | 'withdrawn';

export interface Application extends Base {
  jobId: ID;
  jobTitle: string;
  employerName: string;
  userId: ID;
  applicantName: string;
  mobile: string;
  coverNote: string;
  status: ApplicationStatus;
  history: StatusEntry[];
}

export interface RecruitmentRequest extends Base {
  userId: ID;
  company: string;
  role: string;
  category: string;
  experience: string;
  budget: number;
  localityId: ID;
  openings: number;
  feeAccepted: boolean;
  status: 'received' | 'sourcing' | 'shortlist_shared' | 'closed';
}

export interface LabourPost extends Base {
  contractorId?: ID;
  contractorName: string;
  title: string;
  skill: string;
  workers: number;
  wage: number;
  wageUnit: 'day' | 'job';
  localityId: ID;
  duration: string;
  startDate: string;
  interests: { userId: ID; name: string; availability: string; at: ISODate; status: 'interested' | 'accepted' | 'declined' }[];
  status: 'open' | 'filled' | 'closed';
}

export interface StudentDetails {
  meals: boolean;
  deposit: number;
  rules: string[];
  occupancy: 'single' | 'shared';
  /** only when stated by the provider */
  restriction?: 'none' | 'women_only' | 'men_only';
  nearInstitution?: string;
}

export interface Property extends Base {
  title: string;
  listingType: 'sale' | 'rent';
  category: string;
  price: number;
  localityId: ID;
  areaSqft?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnishing: 'furnished' | 'semi' | 'unfurnished';
  amenities: string[];
  description: string;
  ownerName: string;
  ownerType: 'owner' | 'agent';
  ownerId?: ID;
  verification: Verification;
  available: boolean;
  student?: StudentDetails;
  photos: number;
  views: number;
  enquiries: number;
  status: 'active' | 'inactive' | 'pending_review' | 'removed';
}

export interface Classified extends Base {
  title: string;
  category: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  price: number;
  negotiable: boolean;
  description: string;
  localityId: ID;
  sellerId: ID;
  sellerName: string;
  contactPref: 'chat' | 'call' | 'whatsapp';
  status: 'active' | 'sold' | 'expired' | 'removed' | 'flagged';
  expiresAt: ISODate;
  photos: number;
  vehicle?: { make: string; model: string; year: number; km: number; owners?: number };
}

export interface Enquiry extends Base {
  targetType: 'business' | 'provider' | 'property' | 'classified' | 'institution' | 'healthcare' | 'vendor' | 'professional' | 'finance' | 'b2b' | 'agent' | 'courier' | 'transport';
  targetId: ID;
  targetName: string;
  ownerId?: ID;
  fromUserId: ID;
  name: string;
  mobile: string;
  message: string;
  consent: boolean;
  preferredTime?: string;
  status: 'new' | 'responded' | 'closed';
  replies: { from: string; text: string; at: ISODate }[];
}

export interface Article extends Base {
  title: string;
  titleHi?: string;
  summary: string;
  body: string[];
  category: string;
  source: string;
  sourceUrl?: string;
  localityId?: ID;
  publishedAt: ISODate;
  status: 'draft' | 'scheduled' | 'published' | 'unpublished';
  scheduledAt?: ISODate;
  likedBy: ID[];
  tags: string[];
  breaking?: boolean;
}

export interface CivicAlert extends Base {
  title: string;
  description: string;
  type: 'road' | 'water' | 'electricity' | 'notice' | 'traffic' | 'weather' | 'municipal' | 'emergency';
  severity: 'info' | 'advisory' | 'warning' | 'critical';
  localityId?: ID;
  startsAt: ISODate;
  expiresAt: ISODate;
  source: string;
  status: 'active' | 'scheduled' | 'resolved';
}

export interface Comment extends Base {
  targetType: 'article' | 'post' | 'poll' | 'event';
  targetId: ID;
  parentId?: ID;
  userId: ID;
  userName: string;
  text: string;
  likedBy: ID[];
  reported?: boolean;
  hidden?: boolean;
}

export interface Post extends Base {
  kind: 'question' | 'discussion' | 'suggestion' | 'recommendation' | 'announcement' | 'photo' | 'event';
  userId: ID;
  userName: string;
  localityId: ID;
  text: string;
  photo?: boolean;
  reactions: Record<string, ID[]>;
  status: 'published' | 'pending' | 'removed';
}

export interface PollOption { id: ID; label: string }

export interface Poll extends Base {
  question: string;
  description?: string;
  category: string;
  localityId?: ID;
  options: PollOption[];
  opensAt: ISODate;
  closesAt: ISODate;
  revealAt: ISODate;
  visibility: 'anonymous' | 'public';
  origin: 'admin' | 'community';
  createdBy: ID;
  status: 'pending' | 'approved' | 'rejected';
  image?: string;
  /** previous edition of the same question, for comparison */
  previous?: { label: string; date: string; percentages: number[] };
  /** seeded vote counts per option for demo polls */
  seedCounts?: number[];
}

export interface Vote extends Base { pollId: ID; optionId: ID; userId: ID }

export interface TicketType { id: ID; name: string; price: number; capacity: number; sold: number }

export interface CityEvent extends Base {
  title: string;
  description: string;
  category: string;
  startsAt: ISODate;
  endsAt: ISODate;
  venue: string;
  localityId: ID;
  organizer: string;
  organizerId?: ID;
  ticketTypes: TicketType[];
  registrationUrl?: string;
  status: 'published' | 'pending_review' | 'cancelled';
}

export interface Booking extends Base {
  kind: 'event' | 'bus' | 'train' | 'service' | 'plan';
  refId: ID;
  title: string;
  userId: ID;
  reference: string;
  lines: { label: string; qty: number; price: number }[];
  total: number;
  attendees: string[];
  status: 'demo_confirmed' | 'cancelled' | 'pending';
  date?: string;
  meta?: Record<string, string>;
}

export interface Institution extends Base {
  name: string;
  category: string;
  localityId: ID;
  courses: string[];
  phone?: string;
  website?: string;
  admission?: string;
  verification: Verification;
  rating: number;
  reviewCount: number;
  description: string;
}

export interface HealthProvider extends Base {
  name: string;
  type: string;
  specialty: string;
  address: string;
  localityId: ID;
  phone?: string;
  hours?: string;
  hoursVerified: boolean;
  services: string[];
  verification: Verification;
  source: string;
  emergency24x7?: boolean;
}

export interface HealthAssistRequest extends Base {
  userId: ID;
  serviceType: string;
  localityId: ID;
  urgency: 'routine' | 'soon' | 'urgent';
  contactPref: 'call' | 'whatsapp' | 'in_app';
  status: 'received' | 'coordinating' | 'options_shared' | 'closed';
  history: StatusEntry[];
}

export interface EligibilityRule {
  maxIncome?: number;
  occupation?: string[];
  minAge?: number;
  maxAge?: number;
  state?: 'rajasthan';
  student?: boolean;
  gender?: 'female';
  landOwner?: boolean;
  daughterUnder10?: boolean;
}

export interface Scheme extends Base {
  name: string;
  level: 'central' | 'rajasthan';
  category: string;
  department: string;
  description: string;
  beneficiaries: string;
  eligibility: string[];
  benefits: string[];
  documents: string[];
  steps: string[];
  officialUrl: string;
  source: string;
  lastVerified?: string;
  rule: EligibilityRule;
}

export interface MandiPrice {
  id: ID;
  commodity: string;
  commodityHi: string;
  market: string;
  min: number;
  max: number;
  modal: number;
  unit: string;
  date: string;
  source: string;
  history: { date: string; modal: number }[];
  demo: true;
}

export interface PriceRecord { id: ID; item: string; price: number; unit: string; market: string; date: string; source: string; change: number; demo: true }

export interface Professional extends Base {
  name: string;
  profession: string;
  qualifications?: string;
  qualificationsVerified: boolean;
  services: string[];
  experience: string;
  localityId: ID;
  verification: Verification;
  rating: number;
  reviewCount: number;
}

export interface FinanceProduct {
  id: ID;
  category: string;
  provider: string;
  title: string;
  summary: string;
  features: string[];
  commission: boolean;
  demo: true;
}

export interface NotificationItem extends Base {
  userId: ID | 'all';
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
}

export interface Offer extends Base {
  title: string;
  businessId: ID;
  businessName: string;
  description: string;
  benefit: string;
  category: string;
  validFrom: string;
  validTo: string;
  terms: string[];
  redemption: string;
  sponsored?: boolean;
  status: 'active' | 'paused' | 'expired';
}

export interface ClaimedVoucher {
  id: ID;
  offerId: ID;
  userId: ID;
  code: string;
  status: 'claimed' | 'redeemed' | 'expired';
  claimedAt: ISODate;
  demo: true;
}

export interface PointsEntry { id: ID; userId: ID; action: string; points: number; at: ISODate; note: string }

export interface ModerationCase extends Base {
  kind: 'report' | 'complaint' | 'dispute';
  targetType: string;
  targetId: ID;
  targetTitle: string;
  reason: string;
  details: string;
  reporterId: ID;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  resolution?: string;
}

export interface Campaign extends Base {
  businessId: ID;
  businessName: string;
  objective: 'awareness' | 'visits' | 'enquiries' | 'offer';
  placement: 'sponsored_card' | 'featured_listing' | 'feed_post' | 'category' | 'home' | 'locality' | 'festival';
  localityId: ID | 'all';
  category: string;
  startDate: string;
  endDate: string;
  budget: number;
  creativeName?: string;
  headline: string;
  status: 'draft' | 'pending_review' | 'approved' | 'live' | 'rejected' | 'ended';
  impressions: number;
  clicks: number;
}

export interface Payment extends Base {
  userId: ID;
  description: string;
  amount: number;
  gst: number;
  status: 'demo_success' | 'demo_failed' | 'refund_requested' | 'refunded';
  invoiceNo: string;
  plan?: string;
  kind: 'subscription' | 'job_package' | 'ads' | 'assistance' | 'booking' | 'lead_fee';
}

export interface AuditLog { id: ID; at: ISODate; actorId: ID; actorName: string; action: string; target: string; details?: string }

export interface Shipment { id: ID; trackingNo: string; from: string; to: string; packageType: string; status: string; history: StatusEntry[]; demo: true }

export interface MatrimonialProfile extends Base {
  userId: ID;
  displayName: string;
  age: number;
  education: string;
  profession: string;
  generalLocation: string;
  about: string;
  preferences: string;
  photoVisibility: 'hidden' | 'on_accept';
  contactVisibility: 'hidden' | 'on_accept';
  interestsReceived: ID[];
  interestsSent: ID[];
  status: 'active' | 'hidden' | 'reported';
}

export interface B2BRequirement extends Base {
  company: string;
  kind: 'buy' | 'sell';
  product: string;
  quantity: string;
  localityId: ID;
  details: string;
  status: 'open' | 'closed';
}

export interface Podcast { id: ID; title: string; description: string; host: string; durationSec: number; category: string; audioUrl?: string; publishedAt: ISODate; demo: true }

export interface Match {
  id: ID;
  sport: 'cricket' | 'kabaddi' | 'football';
  tournament: string;
  teamA: string;
  teamB: string;
  scoreA?: string;
  scoreB?: string;
  overs?: string;
  status: 'live' | 'upcoming' | 'completed';
  result?: string;
  startsAt: ISODate;
  venue: string;
  scorecard?: { batter: string; runs: number; balls: number }[];
  demo: true;
}

export interface AIMessage { id: ID; role: 'user' | 'assistant'; text: string; at: ISODate; cards?: { type: string; id: ID; title: string; subtitle: string; link: string }[]; actions?: { label: string; link: string }[]; sources?: { label: string; link: string }[]; demo?: boolean }

export interface Settings {
  fees: {
    conciergeFee: number;
    recruitmentFeePercent: number;
    featuredJob: number;
    urgentJob: number;
    eventBookingFeePercent: number;
    serviceCommissionPercent: number;
    gstPercent: number;
  };
  plans: { id: string; name: string; price: number; period: 'month' | 'year'; features: string[]; audience: 'business' | 'employer' | 'property' }[];
  featureFlags: Record<string, boolean>;
  pointsRules: Record<string, number>;
  categories: string[];
  notificationTemplates: { id: string; name: string; text: string }[];
}

export interface DBState {
  version: number;
  seededAt: ISODate;
  users: User[];
  businesses: Business[];
  verificationRequests: VerificationRequest[];
  providers: Provider[];
  serviceRequests: ServiceRequest[];
  concierge: ConciergeRequest[];
  reviews: Review[];
  jobs: Job[];
  applications: Application[];
  recruitment: RecruitmentRequest[];
  labour: LabourPost[];
  properties: Property[];
  classifieds: Classified[];
  enquiries: Enquiry[];
  articles: Article[];
  alerts: CivicAlert[];
  comments: Comment[];
  posts: Post[];
  polls: Poll[];
  votes: Vote[];
  events: CityEvent[];
  bookings: Booking[];
  institutions: Institution[];
  healthcare: HealthProvider[];
  healthAssist: HealthAssistRequest[];
  schemes: Scheme[];
  professionals: Professional[];
  notifications: NotificationItem[];
  offers: Offer[];
  vouchers: ClaimedVoucher[];
  points: PointsEntry[];
  cases: ModerationCase[];
  campaigns: Campaign[];
  payments: Payment[];
  audit: AuditLog[];
  matrimonial: MatrimonialProfile[];
  b2b: B2BRequirement[];
  saved: { userId: ID; type: string; id: ID; at: ISODate }[];
  checkins: { userId: ID; kind: 'daily' | 'place'; ref: string; at: ISODate }[];
  spins: { userId: ID; at: ISODate; result: string }[];
  ai: AIMessage[];
  searches: string[];
  settings: Settings;
}

export type CollectionName = { [K in keyof DBState]: DBState[K] extends Array<{ id: ID }> ? K : never }[keyof DBState];
