import { lazy, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { UIProvider } from '@/components/ui/overlay';
import { RequireAuth, RequireRole } from './guards';
import { ErrorBoundary } from './ErrorBoundary';
import NotFound from './NotFound';
import HomePage from '@/features/home/HomePage';

/** Lazy-load a named export so each feature module becomes its own chunk. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lz<M extends Record<string, any>>(loader: () => Promise<M>, name: keyof M) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}

const news = () => import('@/features/news/pages');
const community = () => import('@/features/community/pages');
const discover = () => import('@/features/discover/pages');
const services = () => import('@/features/services/pages');
const jobs = () => import('@/features/jobs/pages');
const property = () => import('@/features/property/pages');
const market = () => import('@/features/marketplace/pages');
const agri = () => import('@/features/agriculture/pages');
const gov = () => import('@/features/government/pages');
const edu = () => import('@/features/education/pages');
const health = () => import('@/features/healthcare/pages');
const events = () => import('@/features/events/pages');
const transport = () => import('@/features/transport/pages');
const finance = () => import('@/features/finance/pages');
const biz = () => import('@/features/businesses/pages');
const ai = () => import('@/features/ai/pages');
const notif = () => import('@/features/notifications/pages');
const rewards = () => import('@/features/rewards/pages');
const account = () => import('@/features/account/pages');
const insights = () => import('@/features/insights/pages');
const admin = () => import('@/features/admin/pages');

const P = {
  News: lz(news, 'NewsPage'), Article: lz(news, 'ArticlePage'), Alerts: lz(news, 'AlertsPage'), Podcasts: lz(news, 'PodcastsPage'), Sports: lz(news, 'SportsPage'), Prices: lz(news, 'PricesPage'),
  Community: lz(community, 'CommunityPage'), Post: lz(community, 'PostPage'), Polls: lz(community, 'PollsPage'), Poll: lz(community, 'PollPage'), NewPoll: lz(community, 'NewPollPage'),
  Discover: lz(discover, 'DiscoverPage'), Category: lz(discover, 'CategoryLandingPage'), Search: lz(discover, 'SearchPage'),
  Services: lz(services, 'ServicesPage'), ServiceCat: lz(services, 'ServiceCategoryPage'), Provider: lz(services, 'ProviderPage'), Requests: lz(services, 'ServiceRequestsPage'),
  NewRequest: lz(services, 'NewServiceRequestPage'), Request: lz(services, 'ServiceRequestPage'), Assistance: lz(services, 'AssistancePage'), ProviderDash: lz(services, 'ProviderDashboardPage'), Labour: lz(services, 'LabourPage'),
  Jobs: lz(jobs, 'JobsPage'), Job: lz(jobs, 'JobPage'), Applications: lz(jobs, 'ApplicationsPage'), Employers: lz(jobs, 'EmployersPage'), Recruitment: lz(jobs, 'RecruitmentPage'),
  Property: lz(property, 'PropertyPage'), PropertyDetail: lz(property, 'PropertyDetailPage'), Students: lz(property, 'StudentStaysPage'), PropertyForm: lz(property, 'PropertyFormPage'), OwnerDash: lz(property, 'OwnerDashboardPage'),
  Market: lz(market, 'MarketplacePage'), Classified: lz(market, 'ClassifiedPage'), ClassifiedForm: lz(market, 'ClassifiedFormPage'),
  Agri: lz(agri, 'AgriculturePage'),
  Gov: lz(gov, 'GovernmentPage'), Scheme: lz(gov, 'SchemePage'), Eligibility: lz(gov, 'EligibilityPage'),
  Edu: lz(edu, 'EducationPage'), Institution: lz(edu, 'InstitutionPage'), Student: lz(edu, 'StudentDashboardPage'),
  Health: lz(health, 'HealthcarePage'), HealthProvider: lz(health, 'HealthProviderPage'), HealthAssist: lz(health, 'HealthAssistPage'),
  Weddings: lz(events, 'WeddingsPage'), Vendor: lz(events, 'VendorPage'), Events: lz(events, 'EventsPage'), Event: lz(events, 'EventPage'), Booking: lz(events, 'EventBookingPage'), Matrimonial: lz(events, 'MatrimonialPage'),
  Transport: lz(transport, 'TransportPage'),
  Finance: lz(finance, 'FinancePage'), Pros: lz(finance, 'ProfessionalsPage'), Pro: lz(finance, 'ProfessionalPage'),
  Businesses: lz(biz, 'BusinessesPage'), Business: lz(biz, 'BusinessPage'), BizDash: lz(biz, 'BusinessDashboardPage'), BizForm: lz(biz, 'BusinessFormPage'), Advertise: lz(biz, 'AdvertisePage'), BizAssist: lz(biz, 'BusinessAssistancePage'), B2B: lz(biz, 'B2BPage'),
  AI: lz(ai, 'AIPage'), Notifications: lz(notif, 'NotificationsPage'), Offers: lz(rewards, 'OffersPage'), Rewards: lz(rewards, 'RewardsPage'),
  Profile: lz(account, 'ProfilePage'), Settings: lz(account, 'SettingsPage'), SignIn: lz(account, 'SignInPage'), Help: lz(account, 'HelpPage'), Policy: lz(account, 'PolicyPage'),
  Pricing: lz(account, 'PricingPage'), Checkout: lz(account, 'CheckoutPage'), Payments: lz(account, 'PaymentsPage'),
  Insights: lz(insights, 'InsightsPage'), Admin: lz(admin, 'AdminPage')
};

const auth = (n: ReactNode) => <RequireAuth>{n}</RequireAuth>;

function Boundary({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return <ErrorBoundary resetKey={loc.pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <BrowserRouter>
      <UIProvider>
        <Boundary>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="news" element={<P.News />} />
              <Route path="news/:id" element={<P.Article />} />
              <Route path="alerts" element={<P.Alerts />} />
              <Route path="podcasts" element={<P.Podcasts />} />
              <Route path="sports" element={<P.Sports />} />
              <Route path="prices" element={<P.Prices />} />
              <Route path="community" element={<P.Community />} />
              <Route path="community/:id" element={<P.Post />} />
              <Route path="polls" element={<P.Polls />} />
              <Route path="polls/new" element={auth(<P.NewPoll />)} />
              <Route path="polls/:id" element={<P.Poll />} />
              <Route path="discover" element={<P.Discover />} />
              <Route path="discover/:slug" element={<P.Category />} />
              <Route path="search" element={<P.Search />} />
              <Route path="services" element={<P.Services />} />
              <Route path="services/:category" element={<P.ServiceCat />} />
              <Route path="service-providers/:id" element={<P.Provider />} />
              <Route path="service-requests" element={auth(<P.Requests />)} />
              <Route path="service-requests/new" element={auth(<P.NewRequest />)} />
              <Route path="service-requests/:id" element={auth(<P.Request />)} />
              <Route path="assistance" element={<P.Assistance />} />
              <Route path="labour" element={<P.Labour />} />
              <Route path="provider-dashboard" element={<RequireRole roles={['provider', 'admin']}><P.ProviderDash /></RequireRole>} />
              <Route path="jobs" element={<P.Jobs />} />
              <Route path="jobs/:id" element={<P.Job />} />
              <Route path="applications" element={auth(<P.Applications />)} />
              <Route path="employers" element={<RequireRole roles={['employer', 'admin']}><P.Employers /></RequireRole>} />
              <Route path="recruitment" element={<P.Recruitment />} />
              <Route path="property" element={<P.Property />} />
              <Route path="property/students" element={<P.Students />} />
              <Route path="property/new" element={auth(<P.PropertyForm />)} />
              <Route path="property/:id/edit" element={auth(<P.PropertyForm />)} />
              <Route path="property/:id" element={<P.PropertyDetail />} />
              <Route path="owner-dashboard" element={<RequireRole roles={['owner', 'admin']}><P.OwnerDash /></RequireRole>} />
              <Route path="marketplace" element={<P.Market />} />
              <Route path="marketplace/new" element={auth(<P.ClassifiedForm />)} />
              <Route path="marketplace/:id/edit" element={auth(<P.ClassifiedForm />)} />
              <Route path="marketplace/:id" element={<P.Classified />} />
              <Route path="agriculture" element={<P.Agri />} />
              <Route path="government" element={<P.Gov />} />
              <Route path="government/eligibility" element={<P.Eligibility />} />
              <Route path="government/schemes/:id" element={<P.Scheme />} />
              <Route path="education" element={<P.Edu />} />
              <Route path="education/:id" element={<P.Institution />} />
              <Route path="student" element={auth(<P.Student />)} />
              <Route path="healthcare" element={<P.Health />} />
              <Route path="healthcare/assist" element={<P.HealthAssist />} />
              <Route path="healthcare/:id" element={<P.HealthProvider />} />
              <Route path="weddings" element={<P.Weddings />} />
              <Route path="weddings/:id" element={<P.Vendor />} />
              <Route path="matrimonial" element={<P.Matrimonial />} />
              <Route path="events" element={<P.Events />} />
              <Route path="events/:id" element={<P.Event />} />
              <Route path="events/:id/book" element={auth(<P.Booking />)} />
              <Route path="transport" element={<P.Transport />} />
              <Route path="finance" element={<P.Finance />} />
              <Route path="professionals" element={<P.Pros />} />
              <Route path="professionals/:id" element={<P.Pro />} />
              <Route path="businesses" element={<P.Businesses />} />
              <Route path="businesses/new" element={auth(<P.BizForm />)} />
              <Route path="businesses/:id/edit" element={auth(<P.BizForm />)} />
              <Route path="businesses/:id" element={<P.Business />} />
              <Route path="business-dashboard" element={<RequireRole roles={['business', 'admin']}><P.BizDash /></RequireRole>} />
              <Route path="business-assistance" element={<P.BizAssist />} />
              <Route path="advertise" element={<P.Advertise />} />
              <Route path="b2b" element={<P.B2B />} />
              <Route path="ai" element={<P.AI />} />
              <Route path="notifications" element={auth(<P.Notifications />)} />
              <Route path="offers" element={<P.Offers />} />
              <Route path="rewards" element={<P.Rewards />} />
              <Route path="profile" element={auth(<P.Profile />)} />
              <Route path="settings" element={<P.Settings />} />
              <Route path="signin" element={<P.SignIn />} />
              <Route path="help" element={<P.Help />} />
              <Route path="privacy" element={<P.Policy />} />
              <Route path="terms" element={<P.Policy />} />
              <Route path="policies/:slug" element={<P.Policy />} />
              <Route path="pricing" element={<P.Pricing />} />
              <Route path="checkout" element={auth(<P.Checkout />)} />
              <Route path="payments" element={auth(<P.Payments />)} />
              <Route path="insights" element={<RequireRole roles={['admin', 'business']}><P.Insights /></RequireRole>} />
              <Route path="admin" element={<RequireRole roles={['admin']}><P.Admin /></RequireRole>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Boundary>
      </UIProvider>
    </BrowserRouter>
  );
}
