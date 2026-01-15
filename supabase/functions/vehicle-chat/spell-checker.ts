/**
 * Spell Checker and Fuzzy Matcher for Vehicle Chat
 * Handles typos and misspellings in user queries to improve AI understanding
 */

// Common vehicle/driving terms dictionary with common misspellings
const VEHICLE_TERMS: Record<string, string[]> = {
  'battery': ['batry', 'batary', 'batery', 'battry', 'batt'],
  'location': ['locaton', 'locashun', 'locashon', 'lokashun'],
  'speed': ['sped', 'spede', 'spead'],
  'where': ['wher', 'were', 'whare', 'ware'],
  'you': ['yu', 'u', 'yuo', 'yo'],
  'are': ['ar', 'r', 're'],
  'level': ['levl', 'leval', 'lvl', 'leve'],
  'limit': ['limt', 'limmit', 'limet'],
  'trip': ['trep', 'tripp', 'trip'],
  'distance': ['distnce', 'distanc', 'distanse'],
  'mileage': ['milege', 'milag', 'milage'],
  'ignition': ['ignishun', 'ignishon', 'ignishn'],
  'status': ['statas', 'statuss', 'statuse'],
  'current': ['curret', 'curren', 'curent'],
  'position': ['posishun', 'posishon', 'posishn'],
  'parked': ['parkd', 'parkt'],
  'moving': ['movin', 'movng'],
  'stopped': ['stopd', 'stopt', 'stoped'],
  'driving': ['drivin', 'drivng'],
  'today': ['todai', 'todey', 'todae'],
  'yesterday': ['yestaday', 'yestaday', 'yesturday'],
  'how': ['how', 'hou'],
  'many': ['meny', 'mane'],
  'what': ['wat', 'wht'],
  'when': ['wen', 'whn'],
  'show': ['sho', 'shw'],
  'tell': ['tel', 'tll'],
  'me': ['me', 'mi'],
};

/**
 * Normalize and correct common typos in user message
 */
export function normalizeMessage(message: string): string {
  let normalized = message.toLowerCase().trim();
  
  // Replace common typos using word boundaries
  for (const [correct, typos] of Object.entries(VEHICLE_TERMS)) {
    for (const typo of typos) {
      // Use word boundaries to avoid partial matches
      const regex = new RegExp(`\\b${typo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      normalized = normalized.replace(regex, correct);
    }
  }
  
  // Fix common character substitutions and patterns
  normalized = normalized
    .replace(/\bwher\b/gi, 'where')
    .replace(/\byu\b/gi, 'you')
    .replace(/\bar\b/gi, 'are')
    .replace(/\bthru\b/gi, 'through')
    .replace(/\btho\b/gi, 'though')
    .replace(/\bwat\b/gi, 'what')
    .replace(/\bwen\b/gi, 'when')
    .replace(/\bhou\b/gi, 'how')
    .replace(/\bmeny\b/gi, 'many')
    .replace(/\bsho\b/gi, 'show')
    .replace(/\btel\b/gi, 'tell')
    .replace(/\bmi\b/gi, 'me')
    .replace(/\bparkd\b/gi, 'parked')
    .replace(/\bmovin\b/gi, 'moving')
    .replace(/\bdrivin\b/gi, 'driving');
  
  return normalized;
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 * Returns the minimum number of single-character edits needed
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Find closest match from dictionary using fuzzy matching
 * Returns the best match if within tolerance threshold
 */
export function fuzzyMatch(term: string, dictionary: string[]): string | null {
  if (!term || term.length === 0) return null;
  
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  const maxDistance = Math.max(1, Math.ceil(term.length * 0.3)); // 30% tolerance, min 1
  
  for (const dictTerm of dictionary) {
    const distance = levenshteinDistance(term.toLowerCase(), dictTerm.toLowerCase());
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = dictTerm;
    }
  }
  
  return bestMatch;
}

/**
 * Preprocess user message: normalize, correct typos, improve for LLM
 * Returns both normalized and original for different use cases
 */
export function preprocessUserMessage(message: string): {
  normalized: string;
  original: string;
  corrections: Array<{ original: string; corrected: string }>;
} {
  const original = message;
  const normalized = normalizeMessage(message);
  const corrections: Array<{ original: string; corrected: string }> = [];
  
  // Track corrections made by comparing word-by-word
  const originalWords = original.toLowerCase().split(/\s+/);
  const normalizedWords = normalized.split(/\s+/);
  
  for (let i = 0; i < Math.min(originalWords.length, normalizedWords.length); i++) {
    if (originalWords[i] !== normalizedWords[i]) {
      corrections.push({
        original: originalWords[i],
        corrected: normalizedWords[i]
      });
    }
  }
  
  return {
    normalized,
    original,
    corrections
  };
}

/**
 * Check if a message contains typos that were corrected
 */
export function hasTypos(message: string): boolean {
  const { corrections } = preprocessUserMessage(message);
  return corrections.length > 0;
}
