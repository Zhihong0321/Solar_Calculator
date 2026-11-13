/**
 * Customer-name helpers for the review campaign: tidy a name for a greeting, spot company names,
 * and decide whether to send the Chinese message.
 *
 * Every function accepts anything (null, numbers, odd strings) and returns a safe value, never throws.
 */

const CJK = /[㐀-䶿一-鿿豈-﫿]/;

// Words that mark a Malay / Indian name ("... bin ...", "... a/l ..."). Any of these = not Chinese.
const MALAY_INDIAN_MARKERS = new Set([
  'bin', 'binti', 'bt', 'bte', 'binte', 'a/l', 'a/p', 's/o', 'd/o', 'hj', 'hjh', 'haji', 'hajjah', 'syed',
  'sharifah', 'mohd', 'mohamad', 'mohamed', 'muhammad', 'muhamad', 'md', 'nur', 'noor', 'nor', 'siti', 'abdul',
  'abd', 'ahmad', 'datuk', 'dato', 'datin', 'encik', 'puan', 'cik'
]);

// Words that mark a business, not a person.
const COMPANY_WORDS = new Set([
  'sdn', 'bhd', 'berhad', 'enterprise', 'enterprises', 'trading', 'trade', 'resources', 'holdings', 'industries',
  'industry', 'corporation', 'corp', 'company', 'co', 'ltd', 'limited', 'plt', 'llp', 'network', 'networks',
  'optometry', 'clinic', 'centre', 'center', 'restaurant', 'cafe', 'hotel', 'school', 'college', 'sekolah',
  'kedai', 'engineering', 'construction', 'services', 'service', 'solutions', 'technology',
  'furniture', 'workshop', 'therapy', 'care'
]);

// Chinese surnames as written in Malaysia (Hokkien / Cantonese / Hakka / Teochew / Mandarin pinyin spellings).
const CHINESE_SURNAMES = new Set([
  'ang', 'bong', 'chai', 'chan', 'chang', 'chao', 'chee', 'chen', 'cheng', 'cheah', 'cheong', 'chew', 'chia', 'chiam',
  'chiak', 'chiang', 'chin', 'chiew', 'chon', 'chong', 'choo', 'chow', 'chu', 'chua', 'chung', 'chye', 'ee', 'er', 'fah',
  'fan', 'fong', 'foo', 'fu', 'gan', 'goh', 'gui', 'hah', 'hang', 'heah', 'hee', 'heng', 'hew', 'ho', 'hoe', 'hon',
  'hong', 'hooi', 'hor', 'hu', 'huang', 'hung', 'jong', 'kam', 'kan', 'kee', 'khaw', 'khoo', 'khor', 'kiew', 'koay',
  'koh', 'kok', 'kong', 'kuan', 'kwan', 'kwok', 'lai', 'lam', 'lau', 'lee', 'lem', 'leng', 'leong', 'lew', 'li',
  'liang', 'liew', 'lim', 'lin', 'liu', 'lo', 'loh', 'lok', 'long', 'loo', 'low', 'lu', 'lum', 'mah', 'mak', 'moo',
  'moy', 'ng', 'ngai', 'oh', 'ong', 'ooi', 'ow', 'pan', 'pang', 'pek', 'phang', 'phoon', 'poh', 'quah', 'quan',
  'saw', 'see', 'seow', 'sia', 'sim', 'soh', 'soo', 'soong', 'sung', 'tai', 'tam', 'tan', 'tang', 'tay', 'tee',
  'teh', 'teng', 'teo', 'teoh', 'teon', 'tey', 'thong', 'tian', 'tim', 'ting', 'toh', 'tong', 'tor', 'voon', 'wan',
  'wang', 'wee', 'wong', 'woon', 'wu', 'yap', 'yeap', 'yee', 'yeo', 'yeoh', 'yew', 'yong', 'yu', 'zhang', 'zhao',
  'zheng', 'zhou', 'zhu'
]);

/** Removes "(...)" groups, including nested ones and an unclosed "(": "WONG (Ace glove (M) Sdn Bhd)" -> "WONG". */
function stripBrackets(value) {
  let text = String(value == null ? '' : value);
  for (let i = 0; i < 5 && /\([^()]*\)/.test(text); i += 1) text = text.replace(/\([^()]*\)/g, ' ');
  return text.replace(/\(.*$/, ' ').replace(/[()]/g, ' ');
}

const words = (value) => String(value == null ? '' : value).trim().split(/\s+/).filter(Boolean);

/**
 * Name as it should appear in a greeting: drops "(ATAP)" style tags and other brackets, keeps only
 * the part before "@" (the alias), fixes ALL-CAPS / all-lower case, collapses spaces.
 * "TAN BEE LING (ATAP)" -> "Tan Bee Ling".  Returns '' when nothing usable is left.
 */
function cleanCustomerName(raw) {
  let name = String(raw == null ? '' : raw);
  name = stripBrackets(name);                      // (ATAP), (Shop Lot), (MR.OOI), nested, or an unclosed "("
  name = name.split('@')[0];                       // "A @ B" -> "A"
  name = name.replace(/[^\p{L}\p{N}\s.'/-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return '';
  const connectors = new Set(['bin', 'binti', 'bt', 'bte', 'binte', 'a/l', 'a/p', 's/o', 'd/o']);
  const shout = name === name.toUpperCase();
  name = name
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (connectors.has(lower)) return lower;                       // "bin", "a/p" stay lower case
      if (shout || word === lower) {                                  // ALL CAPS or all lower -> Title Case
        return lower.replace(/(^|[-'])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
      }
      return word;                                                    // already mixed case: leave as typed
    })
    .join(' ');
  return name;
}

function isCompanyName(raw) {
  // Only the part outside brackets counts: "TAN SENG YAP (KIONG HENG ENTERPRISE)" is a person, "LER TRADING" is not.
  const outside = stripBrackets(raw);
  const tokens = outside.toLowerCase().replace(/[().,]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens.some((t) => COMPANY_WORDS.has(t));
}

/**
 * True when the name is very likely a Chinese person's name:
 *   - it contains Chinese characters, or
 *   - it is a person (not a company), has no Malay/Indian marker (bin, binti, a/l, a/p ...), and
 *     one of its first two words is a known Chinese surname (so "Tan Wei Ming", "Wei Ming Tan" is
 *     not matched but "William Tan Teck Swee" is).
 * When unsure it says false, so the customer gets the English message.
 */
function isChineseName(raw) {
  if (CJK.test(String(raw == null ? '' : raw))) return true;
  if (isCompanyName(raw)) return false;
  const tokens = words(cleanCustomerName(raw)).map((t) => t.toLowerCase());
  if (tokens.length < 2 || tokens.length > 5) return false;
  if (tokens.some((t) => MALAY_INDIAN_MARKERS.has(t))) return false;
  return tokens.slice(0, 2).some((t) => CHINESE_SURNAMES.has(t));
}

/** 'zh' or 'en'. */
function detectLanguage(raw) {
  try {
    return isChineseName(raw) ? 'zh' : 'en';
  } catch (_) {
    return 'en';
  }
}

/** The word(s) used after "Hi" / "您好": the cleaned name, or a polite generic when the record is a company or blank. */
function greetingName(raw, lang = 'en') {
  const fallback = lang === 'zh' ? '客户' : 'Valued Customer';
  if (isCompanyName(raw)) return fallback;
  return cleanCustomerName(raw) || fallback;
}

module.exports = { cleanCustomerName, isCompanyName, isChineseName, detectLanguage, greetingName };
