/* One Bhilwara — content data.
   Phone numbers are national / Rajasthan state helplines only. Local offices link to a
   Google Maps search instead of a hard-coded number, so nothing here goes stale silently. */
window.OB_DATA = {
  city: {
    lat: 25.3463,
    lon: 74.6364
  },

  emergency: [
    { id: 'e112', num: '112', icon: '🚨', en: 'All emergencies', hi: 'सभी आपात सेवाएँ', priority: true },
    { id: 'e100', num: '100', icon: '👮', en: 'Police', hi: 'पुलिस', priority: true },
    { id: 'e108', num: '108', icon: '🚑', en: 'Ambulance (108)', hi: 'एम्बुलेंस (108)', priority: true },
    { id: 'e101', num: '101', icon: '🚒', en: 'Fire brigade', hi: 'अग्निशमन', priority: true },
    { id: 'e102', num: '102', icon: '🤰', en: 'Ambulance for mother & child', hi: 'मातृ-शिशु एम्बुलेंस' },
    { id: 'e1090', num: '1090', icon: '👩', en: 'Women helpline (Rajasthan Police)', hi: 'महिला हेल्पलाइन (राजस्थान पुलिस)' },
    { id: 'e181', num: '181', icon: '🏛️', en: 'Rajasthan Sampark (grievances)', hi: 'राजस्थान संपर्क (शिकायत)' },
    { id: 'e1098', num: '1098', icon: '🧒', en: 'Childline', hi: 'चाइल्डलाइन' },
    { id: 'e1930', num: '1930', icon: '💻', en: 'Cyber crime / online fraud', hi: 'साइबर अपराध / ऑनलाइन धोखाधड़ी' },
    { id: 'e14567', num: '14567', icon: '🧓', en: 'Elder line (senior citizens)', hi: 'एल्डर लाइन (वरिष्ठ नागरिक)' },
    { id: 'e1033', num: '1033', icon: '🛣️', en: 'National Highway emergency', hi: 'राष्ट्रीय राजमार्ग आपातकाल' },
    { id: 'e1912', num: '1912', icon: '⚡', en: 'Electricity complaint', hi: 'बिजली शिकायत' },
    { id: 'e139', num: '139', icon: '🚆', en: 'Railway enquiry & help', hi: 'रेलवे पूछताछ व सहायता' },
    { id: 'e1906', num: '1906', icon: '🔥', en: 'LPG gas leak', hi: 'एलपीजी गैस रिसाव' },
    { id: 'e14416', num: '14416', icon: '💬', en: 'Tele-MANAS mental health', hi: 'टेली-मानस मानसिक स्वास्थ्य' }
  ],

  /* Directory entries open a Maps search for "<query>". */
  directory: [
    {
      id: 'health', icon: '🏥', en: 'Health', hi: 'स्वास्थ्य',
      items: [
        { id: 'd-mgh', en: 'Mahatma Gandhi Government Hospital', hi: 'महात्मा गांधी राजकीय चिकित्सालय', q: 'Mahatma Gandhi Hospital Bhilwara' },
        { id: 'd-gmc', en: 'Government Medical College', hi: 'राजकीय मेडिकल कॉलेज', q: 'Government Medical College Bhilwara' },
        { id: 'd-blood', en: 'Blood banks near me', hi: 'नज़दीकी ब्लड बैंक', q: 'blood bank Bhilwara' },
        { id: 'd-pharm', en: 'Pharmacies open now', hi: 'खुली दवा दुकानें', q: 'pharmacy open now Bhilwara' }
      ]
    },
    {
      id: 'gov', icon: '🏛️', en: 'Government offices', hi: 'सरकारी कार्यालय',
      items: [
        { id: 'd-coll', en: 'District Collectorate', hi: 'जिला कलेक्टरेट', q: 'District Collectorate Bhilwara' },
        { id: 'd-nn', en: 'Nagar Nigam (Municipal Corporation)', hi: 'नगर निगम', q: 'Nagar Nigam Bhilwara' },
        { id: 'd-sp', en: 'Superintendent of Police office', hi: 'पुलिस अधीक्षक कार्यालय', q: 'SP Office Bhilwara' },
        { id: 'd-court', en: 'District & Sessions Court', hi: 'जिला एवं सत्र न्यायालय', q: 'District Court Bhilwara' },
        { id: 'd-rto', en: 'District Transport Office (DTO)', hi: 'जिला परिवहन कार्यालय', q: 'District Transport Office Bhilwara' },
        { id: 'd-po', en: 'Head Post Office', hi: 'प्रधान डाकघर', q: 'Head Post Office Bhilwara' },
        { id: 'd-emitra', en: 'e-Mitra kiosks', hi: 'ई-मित्र केंद्र', q: 'e-Mitra Bhilwara' }
      ]
    },
    {
      id: 'police', icon: '🚓', en: 'Police stations', hi: 'पुलिस थाने',
      items: [
        { id: 'd-ps', en: 'Police stations near me', hi: 'नज़दीकी पुलिस थाने', q: 'police station Bhilwara' },
        { id: 'd-mahila', en: 'Mahila Thana', hi: 'महिला थाना', q: 'Mahila Thana Bhilwara' },
        { id: 'd-traffic', en: 'Traffic Police', hi: 'यातायात पुलिस', q: 'Traffic Police Bhilwara' }
      ]
    },
    {
      id: 'edu', icon: '🎓', en: 'Education', hi: 'शिक्षा',
      items: [
        { id: 'd-mlv', en: 'Manikya Lal Verma Government College', hi: 'माणिक्य लाल वर्मा राजकीय महाविद्यालय', q: 'MLV Government College Bhilwara' },
        { id: 'd-sangam', en: 'Sangam University', hi: 'संगम विश्वविद्यालय', q: 'Sangam University Bhilwara' },
        { id: 'd-lib', en: 'Public libraries', hi: 'सार्वजनिक पुस्तकालय', q: 'public library Bhilwara' }
      ]
    },
    {
      id: 'biz', icon: '🧵', en: 'Textile & business', hi: 'वस्त्र व व्यापार',
      items: [
        { id: 'd-riico', en: 'RIICO industrial areas', hi: 'रीको औद्योगिक क्षेत्र', q: 'RIICO Industrial Area Bhilwara' },
        { id: 'd-textile', en: 'Textile & suiting showrooms', hi: 'कपड़ा व सूटिंग शोरूम', q: 'textile showroom Bhilwara' },
        { id: 'd-dic', en: 'District Industries Centre', hi: 'जिला उद्योग केंद्र', q: 'District Industries Centre Bhilwara' },
        { id: 'd-banks', en: 'Banks & ATMs', hi: 'बैंक व एटीएम', q: 'ATM Bhilwara' }
      ]
    },
    {
      id: 'daily', icon: '🛒', en: 'Daily needs', hi: 'दैनिक ज़रूरतें',
      items: [
        { id: 'd-petrol', en: 'Petrol pumps', hi: 'पेट्रोल पंप', q: 'petrol pump Bhilwara' },
        { id: 'd-ev', en: 'EV charging', hi: 'ईवी चार्जिंग', q: 'EV charging station Bhilwara' },
        { id: 'd-gas', en: 'LPG gas agencies', hi: 'एलपीजी गैस एजेंसी', q: 'LPG gas agency Bhilwara' },
        { id: 'd-mandi', en: 'Krishi Upaj Mandi', hi: 'कृषि उपज मंडी', q: 'Krishi Upaj Mandi Bhilwara' }
      ]
    }
  ],

  /* Distances are approximate road distances from Bhilwara city. */
  places: [
    { id: 'p-harni', icon: '🛕', km: 6, tag: 'temple', q: 'Harni Mahadev Temple Bhilwara',
      en: 'Harni Mahadev', hi: 'हरणी महादेव',
      den: 'Hillside Shiva temple just outside the city, busy during Shivratri and the monsoon.',
      dhi: 'शहर के पास पहाड़ी पर स्थित शिव मंदिर, शिवरात्रि और सावन में विशेष भीड़।' },
    { id: 'p-gandhisagar', icon: '🌅', km: 1, tag: 'nature', q: 'Gandhi Sagar Talab Bhilwara',
      en: 'Gandhi Sagar Lake', hi: 'गांधी सागर तालाब',
      den: 'City lake for an evening walk and sunset views.',
      dhi: 'शाम की सैर और सूर्यास्त के लिए शहर का तालाब।' },
    { id: 'p-pur', icon: '🪨', km: 12, tag: 'heritage', q: 'Pur Udan Chhatri Bhilwara',
      en: 'Pur — Udan Chhatri & Adhar Shila', hi: 'पुर — उड़न छतरी व अधर शिला',
      den: 'Old town of Pur with a historic Jain temple and a famous balancing rock.',
      dhi: 'पुर कस्बा — ऐतिहासिक जैन मंदिर और प्रसिद्ध संतुलित चट्टान।' },
    { id: 'p-kyara', icon: '🙏', km: 14, tag: 'temple', q: 'Kyara Ke Balaji Bhilwara',
      en: 'Kyara ke Balaji', hi: 'क्यारा के बालाजी',
      den: 'Hanuman temple among natural rock formations near Pur.',
      dhi: 'पुर के पास प्राकृतिक चट्टानों के बीच हनुमान मंदिर।' },
    { id: 'p-mandal', icon: '🏛️', km: 15, tag: 'heritage', q: 'Battis Khambon Ki Chhatri Mandal Bhilwara',
      en: 'Mandal — Battis Khambon ki Chhatri', hi: 'मांडल — बत्तीस खंभों की छतरी',
      den: 'Thirty-two-pillared memorial cenotaph and old talab at Mandal.',
      dhi: 'मांडल में बत्तीस खंभों वाली ऐतिहासिक छतरी और पुराना तालाब।' },
    { id: 'p-shahpura', icon: '🎨', km: 55, tag: 'culture', q: 'Ramdwara Shahpura Bhilwara',
      en: 'Shahpura — Ramdwara & Phad art', hi: 'शाहपुरा — रामद्वारा व फड़ कला',
      den: 'Seat of the Ramsnehi sect, and home of the traditional Phad scroll painting.',
      dhi: 'रामस्नेही संप्रदाय का प्रमुख धाम और पारंपरिक फड़ चित्रकला का घर।' },
    { id: 'p-mandalgarh', icon: '🏰', km: 55, tag: 'heritage', q: 'Mandalgarh Fort',
      en: 'Mandalgarh Fort', hi: 'मांडलगढ़ दुर्ग',
      den: 'Hill fort with sweeping views over the Banas and Bairach rivers region.',
      dhi: 'पहाड़ी दुर्ग जहाँ से आसपास के क्षेत्र का सुंदर दृश्य दिखता है।' },
    { id: 'p-asind', icon: '🛕', km: 55, tag: 'temple', q: 'Savai Bhoj Mandir Asind',
      en: 'Asind — Savai Bhoj Temple', hi: 'आसींद — सवाई भोज मंदिर',
      den: 'Important shrine associated with Devnarayan ji, with a large annual fair.',
      dhi: 'देवनारायण जी से जुड़ा प्रमुख धाम, यहाँ वार्षिक मेला लगता है।' },
    { id: 'p-badnore', icon: '🏯', km: 70, tag: 'heritage', q: 'Badnore Fort',
      en: 'Badnore Fort', hi: 'बदनोर दुर्ग',
      den: 'Seven-storey hilltop fort in the north of the district.',
      dhi: 'जिले के उत्तर में स्थित सात मंज़िला पहाड़ी दुर्ग।' },
    { id: 'p-bijolia', icon: '⛰️', km: 85, tag: 'heritage', q: 'Bijolia Mandakini Temple',
      en: 'Bijolia — Mandakini temples', hi: 'बिजौलिया — मंदाकिनी मंदिर',
      den: 'Group of old carved temples; also known for the Bijolia peasant movement.',
      dhi: 'प्राचीन नक्काशीदार मंदिर समूह; बिजौलिया किसान आंदोलन के लिए भी प्रसिद्ध।' },
    { id: 'p-menal', icon: '💧', km: 100, tag: 'nature', q: 'Menal Waterfall',
      en: 'Menal Waterfall & Mahanaleshwar', hi: 'मेनाल जलप्रपात व महानालेश्वर',
      den: 'Gorge waterfall beside a carved Shiva temple, best during the monsoon (near Bijolia).',
      dhi: 'घाटी में झरना और नक्काशीदार शिव मंदिर, मानसून में सबसे सुंदर (बिजौलिया के पास)।' },
    { id: 'p-dhanop', icon: '🌺', km: 75, tag: 'temple', q: 'Dhanop Mata Temple',
      en: 'Dhanop Mata Temple', hi: 'धनोप माता मंदिर',
      den: 'Revered Devi temple with a busy fair during Navratri.',
      dhi: 'प्रसिद्ध देवी मंदिर, नवरात्र में विशेष मेला।' }
  ],

  transport: [
    { id: 't-rail', icon: '🚆', en: 'Bhilwara Railway Station (BHL)', hi: 'भीलवाड़ा रेलवे स्टेशन (BHL)',
      den: 'On the Ajmer–Chittorgarh line. Trains to Jaipur, Udaipur, Delhi, Mumbai and more.',
      dhi: 'अजमेर–चित्तौड़गढ़ लाइन पर। जयपुर, उदयपुर, दिल्ली, मुंबई आदि के लिए ट्रेनें।',
      q: 'Bhilwara Railway Station', link: 'https://www.irctc.co.in/' },
    { id: 't-bus', icon: '🚌', en: 'Central Bus Stand (RSRTC)', hi: 'केंद्रीय बस स्टैंड (रोडवेज)',
      den: 'Rajasthan Roadways buses across the state and to neighbouring states.',
      dhi: 'राज्य भर और पड़ोसी राज्यों के लिए राजस्थान रोडवेज बसें।',
      q: 'Roadways Bus Stand Bhilwara', link: 'https://rsrtconline.rajasthan.gov.in/' },
    { id: 't-air', icon: '✈️', en: 'Nearest airports', hi: 'नज़दीकी हवाई अड्डे',
      den: 'Udaipur (Maharana Pratap, ~165 km), Kishangarh (~130 km), Jaipur (~250 km).',
      dhi: 'उदयपुर (महाराणा प्रताप, ~165 किमी), किशनगढ़ (~130 किमी), जयपुर (~250 किमी)।',
      q: 'Maharana Pratap Airport Udaipur' },
    { id: 't-road', icon: '🛣️', en: 'By road', hi: 'सड़क मार्ग',
      den: 'On NH-48 between Ajmer and Chittorgarh. Ajmer ~135 km, Chittorgarh ~55 km.',
      dhi: 'अजमेर और चित्तौड़गढ़ के बीच NH-48 पर। अजमेर ~135 किमी, चित्तौड़गढ़ ~55 किमी।',
      q: 'Bhilwara' }
  ],

  services: [
    { id: 's-sso', icon: '🔑', en: 'Rajasthan SSO', hi: 'राजस्थान एसएसओ', den: 'Single sign-on for state services', dhi: 'राज्य सेवाओं का एकल लॉगिन', url: 'https://sso.rajasthan.gov.in/' },
    { id: 's-emitra', icon: '🧾', en: 'e-Mitra', hi: 'ई-मित्र', den: 'Certificates, bills & applications', dhi: 'प्रमाण पत्र, बिल व आवेदन', url: 'https://emitra.rajasthan.gov.in/' },
    { id: 's-janaadhaar', icon: '👨‍👩‍👧', en: 'Jan Aadhaar', hi: 'जन आधार', den: 'Family ID & scheme benefits', dhi: 'परिवार पहचान व योजनाओं का लाभ', url: 'https://janaadhaar.rajasthan.gov.in/' },
    { id: 's-sampark', icon: '📣', en: 'Rajasthan Sampark', hi: 'राजस्थान संपर्क', den: 'File & track a grievance', dhi: 'शिकायत दर्ज करें व स्थिति देखें', url: 'https://sampark.rajasthan.gov.in/' },
    { id: 's-district', icon: '🏛️', en: 'District website', hi: 'जिला वेबसाइट', den: 'Official Bhilwara district portal', dhi: 'भीलवाड़ा जिले का आधिकारिक पोर्टल', url: 'https://bhilwara.rajasthan.gov.in/' },
    { id: 's-avvnl', icon: '⚡', en: 'Electricity (AVVNL)', hi: 'बिजली (एवीवीएनएल)', den: 'Ajmer Discom bills & complaints', dhi: 'अजमेर डिस्कॉम बिल व शिकायत', url: 'https://energy.rajasthan.gov.in/avvnl' },
    { id: 's-parivahan', icon: '🚗', en: 'Parivahan', hi: 'परिवहन', den: 'Driving licence & vehicle services', dhi: 'ड्राइविंग लाइसेंस व वाहन सेवाएँ', url: 'https://parivahan.gov.in/' },
    { id: 's-digilocker', icon: '📂', en: 'DigiLocker', hi: 'डिजिलॉकर', den: 'Your documents, digitally', dhi: 'आपके दस्तावेज़ डिजिटल रूप में', url: 'https://www.digilocker.gov.in/' },
    { id: 's-passport', icon: '🛂', en: 'Passport Seva', hi: 'पासपोर्ट सेवा', den: 'Apply or renew a passport', dhi: 'पासपोर्ट आवेदन या नवीनीकरण', url: 'https://www.passportindia.gov.in/' },
    { id: 's-irctc', icon: '🎫', en: 'IRCTC', hi: 'आईआरसीटीसी', den: 'Book train tickets', dhi: 'ट्रेन टिकट बुक करें', url: 'https://www.irctc.co.in/' },
    { id: 's-rsrtc', icon: '🚌', en: 'RSRTC booking', hi: 'रोडवेज बुकिंग', den: 'Book Rajasthan Roadways buses', dhi: 'राजस्थान रोडवेज बस बुक करें', url: 'https://rsrtconline.rajasthan.gov.in/' },
    { id: 's-cyber', icon: '🛡️', en: 'Cyber crime portal', hi: 'साइबर अपराध पोर्टल', den: 'Report online fraud', dhi: 'ऑनलाइन धोखाधड़ी की शिकायत', url: 'https://cybercrime.gov.in/' }
  ],

  facts: [
    { en: 'Bhilwara is known as the “Textile City of India”, famous for its suiting fabric.', hi: 'भीलवाड़ा को “भारत की वस्त्र नगरी” कहा जाता है, यह सूटिंग कपड़े के लिए प्रसिद्ध है।' },
    { en: 'Shahpura in the district is the home of Phad, a centuries-old scroll painting tradition.', hi: 'जिले का शाहपुरा सदियों पुरानी फड़ चित्रकला परंपरा का घर है।' },
    { en: 'Rampura Agucha in Bhilwara district is one of the world’s largest zinc mines.', hi: 'भीलवाड़ा जिले का रामपुरा आगुचा विश्व की सबसे बड़ी जस्ता खदानों में से एक है।' },
    { en: 'The Bijolia peasant movement, one of India’s earliest organised farmer movements, began in this district.', hi: 'भारत के शुरुआती संगठित किसान आंदोलनों में से एक, बिजौलिया किसान आंदोलन, इसी जिले में शुरू हुआ।' }
  ]
};
