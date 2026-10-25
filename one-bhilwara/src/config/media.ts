/**
 * Directory of real news & media outlets, grouped by reach.
 * Only names and official website links are listed — One Bhilwara does not show these
 * outlets' headlines, logos or content, and is not affiliated with them. To show their
 * stories in-app, connect a feed you have permission to use (see docs/INTEGRATIONS.md).
 */
export type MediaScope = 'local' | 'state' | 'india';
export type MediaKind = 'newspaper' | 'tv' | 'radio' | 'digital' | 'official' | 'agency';

export interface MediaChannel {
  id: string;
  name: string;
  nameHi?: string;
  scope: MediaScope;
  kind: MediaKind;
  languages: ('Hindi' | 'English')[];
  url: string;
  note?: string;
  /** Tailwind gradient for the monogram tile (no third-party logos are used). */
  tint: string;
}

export const MEDIA_SCOPES: { id: MediaScope; label: string; labelHi: string; blurb: string }[] = [
  { id: 'local', label: 'Local', labelHi: 'स्थानीय', blurb: 'Bhilwara city & district' },
  { id: 'state', label: 'State', labelHi: 'राज्य', blurb: 'Rajasthan' },
  { id: 'india', label: 'India', labelHi: 'देश', blurb: 'National news' }
];

export const MEDIA_KINDS: Record<MediaKind, { label: string; icon: string }> = {
  newspaper: { label: 'Newspapers', icon: 'Newspaper' },
  tv: { label: 'TV news', icon: 'Tv' },
  radio: { label: 'Radio', icon: 'Radio' },
  digital: { label: 'Digital', icon: 'Globe' },
  official: { label: 'Official sources', icon: 'Landmark' },
  agency: { label: 'News agencies', icon: 'Rss' }
};

export const MEDIA_CHANNELS: MediaChannel[] = [
  // Local — Bhilwara editions of regional papers plus official district sources
  { id: 'patrika-bhilwara', name: 'Rajasthan Patrika — Bhilwara', nameHi: 'राजस्थान पत्रिका — भीलवाड़ा', scope: 'local', kind: 'newspaper', languages: ['Hindi'], url: 'https://www.patrika.com/bhilwara-news/', note: 'Bhilwara city edition', tint: 'from-rose-500 to-red-600' },
  { id: 'bhaskar-bhilwara', name: 'Dainik Bhaskar — Bhilwara', nameHi: 'दैनिक भास्कर — भीलवाड़ा', scope: 'local', kind: 'newspaper', languages: ['Hindi'], url: 'https://www.bhaskar.com/local/rajasthan/bhilwara/', note: 'Bhilwara local page', tint: 'from-amber-500 to-orange-600' },
  { id: 'district-bhilwara', name: 'District Administration Bhilwara', nameHi: 'जिला प्रशासन भीलवाड़ा', scope: 'local', kind: 'official', languages: ['Hindi', 'English'], url: 'https://bhilwara.rajasthan.gov.in/', note: 'Official notices & press releases', tint: 'from-sky-600 to-blue-700' },

  // State — Rajasthan
  { id: 'patrika', name: 'Rajasthan Patrika', nameHi: 'राजस्थान पत्रिका', scope: 'state', kind: 'newspaper', languages: ['Hindi'], url: 'https://www.patrika.com/rajasthan-news/', tint: 'from-rose-500 to-red-600' },
  { id: 'bhaskar-rj', name: 'Dainik Bhaskar Rajasthan', nameHi: 'दैनिक भास्कर राजस्थान', scope: 'state', kind: 'newspaper', languages: ['Hindi'], url: 'https://www.bhaskar.com/local/rajasthan/', tint: 'from-amber-500 to-orange-600' },
  { id: 'navjyoti', name: 'Dainik Navjyoti', nameHi: 'दैनिक नवज्योति', scope: 'state', kind: 'newspaper', languages: ['Hindi'], url: 'https://www.dainiknavjyoti.com/', tint: 'from-indigo-500 to-blue-700' },
  { id: 'firstindia', name: 'First India', scope: 'state', kind: 'tv', languages: ['Hindi'], url: 'https://firstindia.co.in/', tint: 'from-red-500 to-rose-700' },
  { id: 'news18-rj', name: 'News18 Rajasthan', scope: 'state', kind: 'tv', languages: ['Hindi'], url: 'https://hindi.news18.com/news/rajasthan/', tint: 'from-slate-700 to-slate-900' },
  { id: 'dipr', name: 'DIPR Rajasthan', nameHi: 'सूचना एवं जनसंपर्क विभाग', scope: 'state', kind: 'official', languages: ['Hindi'], url: 'https://dipr.rajasthan.gov.in/', note: 'State government press releases', tint: 'from-sky-600 to-blue-700' },

  // India — national
  { id: 'ddnews', name: 'DD News', scope: 'india', kind: 'tv', languages: ['Hindi', 'English'], url: 'https://ddnews.gov.in/', note: 'Public broadcaster', tint: 'from-blue-600 to-indigo-700' },
  { id: 'ndtv', name: 'NDTV', scope: 'india', kind: 'tv', languages: ['English', 'Hindi'], url: 'https://www.ndtv.com/', tint: 'from-red-600 to-rose-700' },
  { id: 'aajtak', name: 'Aaj Tak', scope: 'india', kind: 'tv', languages: ['Hindi'], url: 'https://www.aajtak.in/', tint: 'from-red-500 to-orange-600' },
  { id: 'indiatoday', name: 'India Today', scope: 'india', kind: 'tv', languages: ['English'], url: 'https://www.indiatoday.in/', tint: 'from-rose-600 to-red-700' },
  { id: 'air', name: 'News On AIR', nameHi: 'आकाशवाणी समाचार', scope: 'india', kind: 'radio', languages: ['Hindi', 'English'], url: 'https://newsonair.gov.in/', note: 'All India Radio news', tint: 'from-teal-500 to-emerald-700' },
  { id: 'toi', name: 'The Times of India', scope: 'india', kind: 'newspaper', languages: ['English'], url: 'https://timesofindia.indiatimes.com/', tint: 'from-zinc-700 to-zinc-900' },
  { id: 'thehindu', name: 'The Hindu', scope: 'india', kind: 'newspaper', languages: ['English'], url: 'https://www.thehindu.com/', tint: 'from-sky-700 to-blue-900' },
  { id: 'indianexpress', name: 'The Indian Express', scope: 'india', kind: 'newspaper', languages: ['English'], url: 'https://indianexpress.com/', tint: 'from-neutral-700 to-neutral-900' },
  { id: 'ht', name: 'Hindustan Times', scope: 'india', kind: 'newspaper', languages: ['English'], url: 'https://www.hindustantimes.com/', tint: 'from-cyan-600 to-sky-800' },
  { id: 'jagran', name: 'Dainik Jagran', nameHi: 'दैनिक जागरण', scope: 'india', kind: 'newspaper', languages: ['Hindi'], url: 'https://www.jagran.com/', tint: 'from-orange-500 to-red-600' },
  { id: 'amarujala', name: 'Amar Ujala', nameHi: 'अमर उजाला', scope: 'india', kind: 'newspaper', languages: ['Hindi'], url: 'https://www.amarujala.com/', tint: 'from-yellow-500 to-amber-600' },
  { id: 'pti', name: 'Press Trust of India', scope: 'india', kind: 'agency', languages: ['English'], url: 'https://www.ptinews.com/', tint: 'from-blue-700 to-slate-800' },
  { id: 'pib', name: 'Press Information Bureau', nameHi: 'पत्र सूचना कार्यालय', scope: 'india', kind: 'official', languages: ['Hindi', 'English'], url: 'https://pib.gov.in/', note: 'Government of India releases', tint: 'from-orange-500 to-amber-600' }
];

export const monogram = (name: string) =>
  name.replace(/^(The|Dainik)\s+/i, '').split(/[\s—-]+/).filter((w) => w && !/^(of|the|and)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
