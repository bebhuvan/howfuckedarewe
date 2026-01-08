/**
 * Ingestion Worker Configuration
 * 
 * Full station list for all cities (matching src/lib/cities.ts)
 */

// Station configuration for each city
export interface StationConfig {
  id: number;
  name: string;
  area: string;
}

export interface CityConfig {
  slug: string;
  name: string;
  localName: string;
  state: string;
  population: number;
  stations: StationConfig[];
}

// Cities to ingest data for - full station list
export const CITIES: CityConfig[] = [
  {
    slug: 'delhi',
    name: 'Delhi',
    localName: 'दिल्ली',
    state: 'Delhi NCR',
    population: 32000000,
    stations: [
      { id: 2553, name: 'Anand Vihar', area: 'Anand Vihar' },
      { id: 10118, name: 'ITI Shahdra', area: 'Jhilmil' },
      { id: 10112, name: 'PGDAV College', area: 'Sriniwaspuri' },
      { id: 2556, name: 'RK Puram', area: 'RK Puram' },
      { id: 10124, name: 'Pusa', area: 'Pusa' },
      { id: 10121, name: 'Sonia Vihar', area: 'Sonia Vihar' },
      { id: 10705, name: 'JLN Stadium', area: 'JLN Stadium' },
      { id: 10704, name: 'Mother Dairy Patparganj', area: 'Patparganj' },
      { id: 10113, name: 'ITI Jahangirpuri', area: 'Jahangirpuri' },
      { id: 10122, name: 'Lodhi Road', area: 'Lodhi Road' },
      { id: 10114, name: 'DITE Wazirpur', area: 'Wazirpur' },
      { id: 10115, name: 'Satyawati College', area: 'Ashok Vihar' },
      { id: 3715, name: 'ITO', area: 'ITO' },
      { id: 10111, name: 'Dhyan Chand Stadium', area: 'Central Delhi' },
      { id: 2554, name: 'Mandir Marg', area: 'Mandir Marg' },
      { id: 10125, name: 'Burari Crossing', area: 'Burari' },
      { id: 8179, name: 'Shadipur', area: 'Shadipur' },
    ],
  },
  {
    slug: 'mumbai',
    name: 'Mumbai',
    localName: 'मुंबई',
    state: 'Maharashtra',
    population: 21000000,
    stations: [
      { id: 13715, name: 'Bandra Kurla Complex', area: 'BKC' },
      { id: 11962, name: 'Colaba', area: 'Colaba' },
      { id: 13707, name: 'Navy Nagar-Colaba', area: 'Colaba' },
      { id: 13709, name: 'Mazgaon', area: 'Mazgaon' },
      { id: 13706, name: 'Siddharth Nagar-Worli', area: 'Worli' },
      { id: 12464, name: 'Sion', area: 'Sion' },
      { id: 13712, name: 'Deonar', area: 'Deonar' },
      { id: 12454, name: 'Kurla', area: 'Kurla' },
      { id: 12456, name: 'Chhatrapati Shivaji Intl. Airport', area: 'Airport' },
      { id: 12455, name: 'Vile Parle West', area: 'Vile Parle' },
      { id: 13713, name: 'Chakala-Andheri East', area: 'Andheri' },
      { id: 11898, name: 'Nerul', area: 'Navi Mumbai' },
      { id: 12459, name: 'Powai', area: 'Powai' },
      { id: 12461, name: 'Mahape', area: 'Navi Mumbai' },
      { id: 13710, name: 'Khindipada-Bhandup West', area: 'Bhandup' },
      { id: 13803, name: 'Malad West', area: 'Malad' },
      { id: 13708, name: 'Mulund West', area: 'Mulund' },
      { id: 13711, name: 'Kandivali East', area: 'Kandivali' },
      { id: 13714, name: 'Borivali East MPCB', area: 'Borivali' },
      { id: 12460, name: 'Borivali East', area: 'Borivali' },
    ],
  },
  {
    slug: 'kolkata',
    name: 'Kolkata',
    localName: 'কলকাতা',
    state: 'West Bengal',
    population: 15000000,
    stations: [
      { id: 12746, name: 'Ballygunge', area: 'Ballygunge' },
      { id: 12458, name: 'Jadavpur', area: 'Jadavpur' },
      { id: 9068, name: 'Victoria', area: 'Victoria' },
      { id: 12457, name: 'Fort William', area: 'Fort William' },
      { id: 9145, name: 'Rabindra Bharati University', area: 'Jorasanko' },
      { id: 12467, name: 'Rabindra Sarobar', area: 'Rabindra Sarobar' },
      { id: 12745, name: 'Bidhannagar', area: 'Salt Lake' },
      { id: 11281, name: 'Ghusuri', area: 'Howrah' },
      { id: 11320, name: 'Padmapukur', area: 'Howrah' },
      { id: 12450, name: 'Belur Math', area: 'Belur' },
    ],
  },
  {
    slug: 'bangalore',
    name: 'Bangalore',
    localName: 'ಬೆಂಗಳೂರು',
    state: 'Karnataka',
    population: 13000000,
    stations: [
      { id: 8190, name: 'BTM Layout', area: 'BTM Layout' },
      { id: 11276, name: 'Jayanagar 5th Block', area: 'Jayanagar' },
      { id: 11428, name: 'Hebbal', area: 'Hebbal' },
      { id: 11293, name: 'Silk Board', area: 'Silk Board' },
      { id: 11312, name: 'Bapuji Nagar', area: 'Bapuji Nagar' },
      { id: 11270, name: 'Hombegowda Nagar', area: 'Hombegowda Nagar' },
      { id: 12441, name: 'BWSSB Kadabesanahalli', area: 'Kadabesanahalli' },
      { id: 8686, name: 'City Railway Station', area: 'Majestic' },
      { id: 8687, name: 'Sanegurava Halli', area: 'Sanegurava Halli' },
      { id: 3758, name: 'Peenya', area: 'Peenya' },
    ],
  },
  {
    slug: 'chennai',
    name: 'Chennai',
    localName: 'சென்னை',
    state: 'Tamil Nadu',
    population: 11000000,
    stations: [
      { id: 13739, name: 'Kodungaiyur', area: 'Kodungaiyur' },
      { id: 13740, name: 'Arumbakkam', area: 'Arumbakkam' },
      { id: 11859, name: 'Manali Village', area: 'Manali' },
      { id: 8185, name: 'Manali', area: 'Manali' },
      { id: 11279, name: 'Velachery Res. Area', area: 'Velachery' },
      { id: 13737, name: 'Royapuram', area: 'Royapuram' },
    ],
  },
  {
    slug: 'hyderabad',
    name: 'Hyderabad',
    localName: 'హైదరాబాద్',
    state: 'Telangana',
    population: 10000000,
    stations: [
      { id: 8677, name: 'Zoo Park', area: 'Bahadurpura West' },
      { id: 8182, name: 'Sanathnagar', area: 'Sanathnagar' },
      { id: 14135, name: 'New Malakpet', area: 'Malakpet' },
      { id: 14125, name: 'Somajiguda', area: 'Somajiguda' },
      { id: 9144, name: 'IDA Pashamylaram', area: 'Pashamylaram' },
      { id: 11284, name: 'Central University', area: 'Gachibowli' },
      { id: 11305, name: 'ICRISAT Patancheru', area: 'Patancheru' },
      { id: 11295, name: 'Bollaram Industrial Area', area: 'Bollaram' },
    ],
  },
  {
    slug: 'ahmedabad',
    name: 'Ahmedabad',
    localName: 'અમદાવાદ',
    state: 'Gujarat',
    population: 8000000,
    stations: [
      { id: 13749, name: 'Gyaspur', area: 'Gyaspur' },
      { id: 8192, name: 'Maninagar', area: 'Maninagar' },
      { id: 13748, name: 'Rakhial', area: 'Rakhial' },
      { id: 13746, name: 'SAC ISRO Satellite', area: 'Satellite' },
      { id: 13750, name: 'Chandkheda', area: 'Chandkheda' },
      { id: 12451, name: 'Phase-4 GIDC Vatva', area: 'Vatva' },
      { id: 13745, name: 'SVPI Airport Hansol', area: 'Hansol' },
    ],
  },
  {
    slug: 'patna',
    name: 'Patna',
    localName: 'पटना',
    state: 'Bihar',
    population: 2500000,
    stations: [
      { id: 12742, name: 'Samanpura', area: 'Samanpura' },
      { id: 12744, name: 'Muradpur', area: 'Muradpur' },
      { id: 12743, name: 'Rajbansi Nagar', area: 'Rajbansi Nagar' },
      { id: 8674, name: 'IGSC Planetarium Complex', area: 'Planetarium' },
      { id: 12888, name: 'DRM Office Danapur', area: 'Danapur' },
      { id: 12887, name: 'Govt. High School Shikarpur', area: 'Shikarpur' },
    ],
  },
  {
    slug: 'lucknow',
    name: 'Lucknow',
    localName: 'लखनऊ',
    state: 'Uttar Pradesh',
    population: 3500000,
    stations: [
      { id: 8673, name: 'Lalbagh', area: 'Lalbagh' },
      { id: 3845, name: 'Central School', area: 'Central School' },
      { id: 12468, name: 'Gomti Nagar', area: 'Gomti Nagar' },
      { id: 8188, name: 'Talkatora', area: 'Talkatora' },
      { id: 13721, name: 'B R Ambedkar University', area: 'Ambedkar University' },
      { id: 13720, name: 'Kukrail Picnic Spot', area: 'Kukrail' },
    ],
  },
  {
    slug: 'agra',
    name: 'Agra',
    localName: 'आगरा',
    state: 'Uttar Pradesh',
    population: 1800000,
    stations: [
      { id: 8186, name: 'Sanjay Palace', area: 'Sanjay Palace' },
      { id: 13873, name: 'Rohta', area: 'Rohta' },
      { id: 13754, name: 'Manoharpur', area: 'Manoharpur' },
      { id: 13752, name: 'Shahjahan Garden', area: 'Shahjahan Garden' },
      { id: 13753, name: 'Sector-3B Avas Vikas Colony', area: 'Avas Vikas' },
    ],
  },
];

// WAQI API configuration
export const WAQI_CONFIG = {
  baseUrl: 'https://api.waqi.info',
  userAgent: 'howfuckedarewe.in/2.0 (air-quality-tracker)',
  // Rate limiting: WAQI allows ~1000 requests/minute on free tier
  maxConcurrent: 5,
  delayBetweenBatchesMs: 100,
};

// Health metrics constants
export const METRICS = {
  // WHO Air Quality Guideline (2021) for PM2.5 annual mean
  WHO_GUIDELINE: 5,

  // Berkeley Earth cigarette equivalence
  // 22 µg/m³ PM2.5 = 1 cigarette/day in mortality risk
  CIGARETTE_PM25_EQUIVALENT: 22,

  // AQLI: years of life lost per 10 µg/m³ above WHO guideline
  AQLI_YEARS_PER_10UG: 0.98,
};

// Total stations count for reference
export const TOTAL_STATIONS = CITIES.reduce((sum, city) => sum + city.stations.length, 0);
// Should be ~100 stations total
