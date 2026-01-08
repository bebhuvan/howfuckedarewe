/**
 * City Configurations for howfuckedarewe.in
 *
 * Each city has:
 * - Basic info (name, population, coordinates)
 * - WAQI station IDs (verified January 2026)
 * - Sardonic tagline
 *
 * To add a new city:
 * 1. Search WAQI: https://api.waqi.info/search/?keyword=CITY&token=YOUR_TOKEN
 * 2. Verify stations have PM2.5 data
 * 3. Add configuration below
 */

import type { CityConfig } from './types';

// ============================================================================
// City Configurations
// ============================================================================

export const BANGALORE: CityConfig = {
  slug: 'bangalore',
  name: 'Bangalore',
  localName: 'ಬೆಂಗಳೂರು',
  state: 'Karnataka',
  coordinates: { lat: 12.9716, lng: 77.5946 },
  population: 13_000_000,
  timezone: 'Asia/Kolkata',
  tagline: 'Tech capital of India. Zero innovation in breathing.',
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
};

export const DELHI: CityConfig = {
  slug: 'delhi',
  name: 'Delhi',
  localName: 'दिल्ली',
  state: 'Delhi NCR',
  coordinates: { lat: 28.6139, lng: 77.2090 },
  population: 32_000_000,
  timezone: 'Asia/Kolkata',
  tagline: 'The national capital of coughing. Also governance. Mostly coughing.',
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
};

export const MUMBAI: CityConfig = {
  slug: 'mumbai',
  name: 'Mumbai',
  localName: 'मुंबई',
  state: 'Maharashtra',
  coordinates: { lat: 19.0760, lng: 72.8777 },
  population: 21_000_000,
  timezone: 'Asia/Kolkata',
  tagline: 'Bollywood dreams. Reality: emphysema.',
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
};

export const CHENNAI: CityConfig = {
  slug: 'chennai',
  name: 'Chennai',
  localName: 'சென்னை',
  state: 'Tamil Nadu',
  coordinates: { lat: 13.0827, lng: 80.2707 },
  population: 11_000_000,
  timezone: 'Asia/Kolkata',
  tagline: "Filter coffee won't filter this air.",
  stations: [
    { id: 13739, name: 'Kodungaiyur', area: 'Kodungaiyur' },
    { id: 13740, name: 'Arumbakkam', area: 'Arumbakkam' },
    { id: 11859, name: 'Manali Village', area: 'Manali' },
    { id: 8185, name: 'Manali', area: 'Manali' },
    { id: 11279, name: 'Velachery Res. Area', area: 'Velachery' },
    { id: 13737, name: 'Royapuram', area: 'Royapuram' },
  ],
};

export const KOLKATA: CityConfig = {
  slug: 'kolkata',
  name: 'Kolkata',
  localName: 'কলকাতা',
  state: 'West Bengal',
  coordinates: { lat: 22.5726, lng: 88.3639 },
  population: 15_000_000,
  timezone: 'Asia/Kolkata',
  tagline: 'City of Joy. The joy of chronic bronchitis.',
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
};

export const HYDERABAD: CityConfig = {
  slug: 'hyderabad',
  name: 'Hyderabad',
  localName: 'హైదరాబాద్',
  state: 'Telangana',
  coordinates: { lat: 17.3850, lng: 78.4867 },
  population: 10_000_000,
  timezone: 'Asia/Kolkata',
  tagline: 'Biryani with a side of particulate matter.',
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
};

export const AHMEDABAD: CityConfig = {
  slug: 'ahmedabad',
  name: 'Ahmedabad',
  localName: 'અમદાવાદ',
  state: 'Gujarat',
  coordinates: { lat: 23.0225, lng: 72.5714 },
  population: 8_000_000,
  timezone: 'Asia/Kolkata',
  tagline: 'Vibrant Gujarat. Vibrating alveoli.',
  stations: [
    { id: 13749, name: 'Gyaspur', area: 'Gyaspur' },
    { id: 8192, name: 'Maninagar', area: 'Maninagar' },
    { id: 13748, name: 'Rakhial', area: 'Rakhial' },
    { id: 13746, name: 'SAC ISRO Satellite', area: 'Satellite' },
    { id: 13750, name: 'Chandkheda', area: 'Chandkheda' },
    { id: 12451, name: 'Phase-4 GIDC Vatva', area: 'Vatva' },
    { id: 13745, name: 'SVPI Airport Hansol', area: 'Hansol' },
  ],
};

export const PATNA: CityConfig = {
  slug: 'patna',
  name: 'Patna',
  localName: 'पटना',
  state: 'Bihar',
  coordinates: { lat: 25.5941, lng: 85.1376 },
  population: 2_500_000,
  timezone: 'Asia/Kolkata',
  tagline: "Bihar's crown jewel. The crown is made of soot.",
  stations: [
    { id: 12742, name: 'Samanpura', area: 'Samanpura' },
    { id: 12744, name: 'Muradpur', area: 'Muradpur' },
    { id: 12743, name: 'Rajbansi Nagar', area: 'Rajbansi Nagar' },
    { id: 8674, name: 'IGSC Planetarium Complex', area: 'Planetarium' },
    { id: 12888, name: 'DRM Office Danapur', area: 'Danapur' },
    { id: 12887, name: 'Govt. High School Shikarpur', area: 'Shikarpur' },

  ],
};

export const LUCKNOW: CityConfig = {
  slug: 'lucknow',
  name: 'Lucknow',
  localName: 'लखनऊ',
  state: 'Uttar Pradesh',
  coordinates: { lat: 26.8467, lng: 80.9462 },
  population: 3_500_000,
  timezone: 'Asia/Kolkata',
  tagline: 'City of Nawabs. Dying like commoners.',
  stations: [
    { id: 8673, name: 'Lalbagh', area: 'Lalbagh' },
    { id: 3845, name: 'Central School', area: 'Central School' },
    { id: 12468, name: 'Gomti Nagar', area: 'Gomti Nagar' },
    { id: 8188, name: 'Talkatora', area: 'Talkatora' },
    { id: 13721, name: 'B R Ambedkar University', area: 'Ambedkar University' },
    { id: 13720, name: 'Kukrail Picnic Spot', area: 'Kukrail' },
  ],
};

export const AGRA: CityConfig = {
  slug: 'agra',
  name: 'Agra',
  localName: 'आगरा',
  state: 'Uttar Pradesh',
  coordinates: { lat: 27.1767, lng: 78.0081 },
  population: 1_800_000,
  timezone: 'Asia/Kolkata',
  tagline: 'The Taj Mahal is turning yellow. So are your lungs.',
  stations: [
    { id: 8186, name: 'Sanjay Palace', area: 'Sanjay Palace' },
    { id: 13873, name: 'Rohta', area: 'Rohta' },
    { id: 13754, name: 'Manoharpur', area: 'Manoharpur' },
    { id: 13752, name: 'Shahjahan Garden', area: 'Shahjahan Garden' },
    { id: 13753, name: 'Sector-3B Avas Vikas Colony', area: 'Avas Vikas' },
  ],
};

// ============================================================================
// City Collections
// ============================================================================

/**
 * All supported cities
 */
export const ALL_CITIES: CityConfig[] = [
  DELHI,      // 17 stations
  MUMBAI,     // 20 stations
  KOLKATA,    // 10 stations
  BANGALORE,  // 10 stations
  CHENNAI,    // 8 stations
  HYDERABAD,  // 9 stations
  AHMEDABAD,  // 7 stations
  PATNA,      // 7 stations
  LUCKNOW,    // 6 stations
  AGRA,       // 6 stations
];

/**
 * Cities ordered by typical pollution levels (worst first)
 */
export const CITIES_BY_POLLUTION: CityConfig[] = [
  DELHI,
  PATNA,
  LUCKNOW,
  AGRA,
  KOLKATA,
  AHMEDABAD,
  MUMBAI,
  HYDERABAD,
  CHENNAI,
  BANGALORE,
];

/**
 * Get city by slug
 */
export function getCityBySlug(slug: string): CityConfig | undefined {
  return ALL_CITIES.find((city) => city.slug === slug);
}

/**
 * Get all city slugs (for static path generation)
 */
export function getAllCitySlugs(): string[] {
  return ALL_CITIES.map((city) => city.slug);
}

// ============================================================================
// All-India Meta Config
// ============================================================================

export const ALL_INDIA = {
  slug: 'india',
  name: 'All India',
  population: 1_400_000_000,
  tagline: "1.4 billion people. One shared atmosphere. Zero accountability.",
} as const;
