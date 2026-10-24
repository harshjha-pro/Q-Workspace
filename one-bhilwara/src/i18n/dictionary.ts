/* UI strings. Every key exists in both languages; tests check parity (src/i18n/dictionary.test.ts). */
export const en = {
  appName: 'One Bhilwara',
  tagline: 'One City. Everything Connected.',
  supporting: 'Your city’s news, people, services, opportunities and everyday needs — all in one place.',
  navHome: 'Home', navNews: 'News', navDiscover: 'Discover', navAI: 'AI Assistant', navProfile: 'Profile',
  searchPlaceholder: 'What are you looking for in Bhilwara?',
  search: 'Search', notifications: 'Notifications', language: 'Language', locality: 'Locality', chooseLocality: 'Choose your locality',
  signIn: 'Sign in', signOut: 'Sign out', signUp: 'Create account', account: 'Account',
  greetingMorning: 'Good morning', greetingAfternoon: 'Good afternoon', greetingEvening: 'Good evening',
  seeAll: 'See all', save: 'Save', saved: 'Saved', share: 'Share', report: 'Report', comment: 'Comment', comments: 'Comments', reply: 'Reply', like: 'Like',
  cancel: 'Cancel', confirm: 'Confirm', submit: 'Submit', close: 'Close', back: 'Back', edit: 'Edit', delete: 'Delete', apply: 'Apply', reset: 'Reset', filters: 'Filters', sort: 'Sort',
  enquire: 'Send enquiry', call: 'Call', directions: 'Directions', book: 'Book', loadMore: 'Load more', results: 'results', noResults: 'No results found',
  verified: 'Verified', unverified: 'Not verified', sponsored: 'Sponsored', demo: 'Demo', sample: 'Sample data', demoMode: 'Demo mode',
  offline: 'You’re offline. Saved pages still work; some features need a connection.', backOnline: 'Back online',
  breaking: 'City alert', weather: 'Weather', quickAccess: 'Quick access', localNews: 'Local news', trending: 'Discussions & polls',
  nearbyServices: 'Nearby services', localJobs: 'Jobs & part-time', propertyPg: 'Property & student stays', buySell: 'Buy & sell',
  eventsWeddings: 'Events & weddings', mandiPrices: 'Mandi prices', govServices: 'Schemes & citizen services', featuredBusinesses: 'Featured businesses',
  offers: 'Offers & vouchers', askAI: 'Ask One Bhilwara AI', recommended: 'Recommended for you', customiseHome: 'Customise home',
  alerts: 'City alerts', community: 'Community', polls: 'Polls', services: 'Local services', jobs: 'Jobs', property: 'Property', marketplace: 'Buy & sell',
  agriculture: 'Agriculture', government: 'Government & e-Mitra', education: 'Education', healthcare: 'Healthcare', weddings: 'Weddings', events: 'Events',
  transport: 'Travel & transport', finance: 'Finance', professionals: 'Professionals', businesses: 'Business directory', rewards: 'Rewards', settings: 'Settings',
  help: 'Help & support', privacy: 'Privacy', terms: 'Terms', admin: 'Admin', more: 'More', all: 'All', loading: 'Loading…',
  emergency: 'Emergency? Call 112', installApp: 'Install One Bhilwara', install: 'Install', later: 'Later', updateReady: 'A new version is available.', reload: 'Reload',
  demoNotice: 'Demo mode: sample data, simulated bookings and payments. Nothing here is a live listing or transaction.', switchRole: 'Switch demo role', resetDemo: 'Reset demo data',
  pageNotFound: 'Page not found', goHome: 'Go home', somethingWrong: 'Something went wrong', tryAgain: 'Try again'
};

export type Dict = typeof en;

export const hi: Dict = {
  appName: 'वन भीलवाड़ा',
  tagline: 'एक शहर। सब कुछ जुड़ा हुआ।',
  supporting: 'आपके शहर की खबरें, लोग, सेवाएँ, अवसर और रोज़मर्रा की ज़रूरतें — सब एक जगह।',
  navHome: 'होम', navNews: 'समाचार', navDiscover: 'खोजें', navAI: 'AI सहायक', navProfile: 'प्रोफ़ाइल',
  searchPlaceholder: 'भीलवाड़ा में आप क्या ढूँढ रहे हैं?',
  search: 'खोज', notifications: 'सूचनाएँ', language: 'भाषा', locality: 'इलाका', chooseLocality: 'अपना इलाका चुनें',
  signIn: 'साइन इन', signOut: 'साइन आउट', signUp: 'खाता बनाएँ', account: 'खाता',
  greetingMorning: 'सुप्रभात', greetingAfternoon: 'नमस्कार', greetingEvening: 'शुभ संध्या',
  seeAll: 'सभी देखें', save: 'सहेजें', saved: 'सहेजा गया', share: 'शेयर', report: 'रिपोर्ट', comment: 'टिप्पणी', comments: 'टिप्पणियाँ', reply: 'जवाब', like: 'पसंद',
  cancel: 'रद्द करें', confirm: 'पुष्टि करें', submit: 'जमा करें', close: 'बंद करें', back: 'वापस', edit: 'संपादित करें', delete: 'हटाएँ', apply: 'लागू करें', reset: 'रीसेट', filters: 'फ़िल्टर', sort: 'क्रम',
  enquire: 'पूछताछ भेजें', call: 'कॉल', directions: 'रास्ता', book: 'बुक करें', loadMore: 'और देखें', results: 'परिणाम', noResults: 'कोई परिणाम नहीं मिला',
  verified: 'सत्यापित', unverified: 'असत्यापित', sponsored: 'प्रायोजित', demo: 'डेमो', sample: 'नमूना डेटा', demoMode: 'डेमो मोड',
  offline: 'आप ऑफ़लाइन हैं। सहेजे गए पेज चलेंगे; कुछ सुविधाओं के लिए इंटरनेट चाहिए।', backOnline: 'फिर से ऑनलाइन',
  breaking: 'शहर अलर्ट', weather: 'मौसम', quickAccess: 'त्वरित पहुँच', localNews: 'स्थानीय समाचार', trending: 'चर्चाएँ और मतदान',
  nearbyServices: 'नज़दीकी सेवाएँ', localJobs: 'नौकरियाँ व पार्ट-टाइम', propertyPg: 'प्रॉपर्टी व छात्र आवास', buySell: 'खरीदें-बेचें',
  eventsWeddings: 'कार्यक्रम व शादी', mandiPrices: 'मंडी भाव', govServices: 'योजनाएँ व नागरिक सेवाएँ', featuredBusinesses: 'विशेष व्यवसाय',
  offers: 'ऑफ़र व वाउचर', askAI: 'वन भीलवाड़ा AI से पूछें', recommended: 'आपके लिए सुझाव', customiseHome: 'होम बदलें',
  alerts: 'शहर अलर्ट', community: 'समुदाय', polls: 'मतदान', services: 'स्थानीय सेवाएँ', jobs: 'नौकरियाँ', property: 'प्रॉपर्टी', marketplace: 'खरीदें-बेचें',
  agriculture: 'कृषि', government: 'सरकार व ई-मित्र', education: 'शिक्षा', healthcare: 'स्वास्थ्य', weddings: 'शादी', events: 'कार्यक्रम',
  transport: 'यात्रा व परिवहन', finance: 'वित्त', professionals: 'पेशेवर', businesses: 'व्यवसाय निर्देशिका', rewards: 'रिवॉर्ड्स', settings: 'सेटिंग्स',
  help: 'सहायता', privacy: 'गोपनीयता', terms: 'शर्तें', admin: 'एडमिन', more: 'और', all: 'सभी', loading: 'लोड हो रहा है…',
  emergency: 'आपात स्थिति? 112 पर कॉल करें', installApp: 'वन भीलवाड़ा इंस्टॉल करें', install: 'इंस्टॉल', later: 'बाद में', updateReady: 'नया संस्करण उपलब्ध है।', reload: 'रीलोड',
  demoNotice: 'डेमो मोड: नमूना डेटा, नकली बुकिंग और भुगतान। यहाँ कुछ भी असली लिस्टिंग या लेन-देन नहीं है।', switchRole: 'डेमो भूमिका बदलें', resetDemo: 'डेमो डेटा रीसेट करें',
  pageNotFound: 'पेज नहीं मिला', goHome: 'होम पर जाएँ', somethingWrong: 'कुछ गलत हो गया', tryAgain: 'फिर कोशिश करें'
};

export const dictionaries = { en, hi };
export type TKey = keyof Dict;
