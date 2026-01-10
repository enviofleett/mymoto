/**
 * Semantic Embedding Generator for Vehicle Chat RAG
 * 
 * Creates 1536-dimension vectors for semantic similarity search.
 * Uses keyword-based encoding with TF-IDF-like weighting.
 * Compatible with pgvector cosine distance operators.
 */

// Vehicle/driving domain vocabulary with semantic weights
const DOMAIN_VOCABULARY: Record<string, { weight: number; category: string }> = {
  // Driving behavior terms
  'driving': { weight: 1.0, category: 'behavior' },
  'braking': { weight: 1.2, category: 'behavior' },
  'acceleration': { weight: 1.2, category: 'behavior' },
  'cornering': { weight: 1.1, category: 'behavior' },
  'speeding': { weight: 1.3, category: 'behavior' },
  'overspeeding': { weight: 1.4, category: 'behavior' },
  'harsh': { weight: 1.3, category: 'behavior' },
  'smooth': { weight: 1.0, category: 'behavior' },
  'aggressive': { weight: 1.2, category: 'behavior' },
  'safe': { weight: 1.1, category: 'behavior' },
  'careful': { weight: 1.0, category: 'behavior' },
  'reckless': { weight: 1.3, category: 'behavior' },
  
  // Score/performance terms
  'score': { weight: 1.2, category: 'performance' },
  'rating': { weight: 1.1, category: 'performance' },
  'performance': { weight: 1.0, category: 'performance' },
  'excellent': { weight: 1.1, category: 'performance' },
  'good': { weight: 0.9, category: 'performance' },
  'poor': { weight: 1.0, category: 'performance' },
  'improved': { weight: 1.0, category: 'performance' },
  'declined': { weight: 1.0, category: 'performance' },
  
  // Time/history terms
  'yesterday': { weight: 1.2, category: 'time' },
  'today': { weight: 1.0, category: 'time' },
  'week': { weight: 1.1, category: 'time' },
  'month': { weight: 1.2, category: 'time' },
  'last': { weight: 0.8, category: 'time' },
  'history': { weight: 1.1, category: 'time' },
  'past': { weight: 0.9, category: 'time' },
  'recent': { weight: 1.0, category: 'time' },
  'ago': { weight: 0.8, category: 'time' },
  
  // Trip terms
  'trip': { weight: 1.2, category: 'trip' },
  'trips': { weight: 1.2, category: 'trip' },
  'journey': { weight: 1.1, category: 'trip' },
  'travel': { weight: 1.0, category: 'trip' },
  'distance': { weight: 1.0, category: 'trip' },
  'mileage': { weight: 1.1, category: 'trip' },
  'kilometer': { weight: 0.9, category: 'trip' },
  'km': { weight: 0.9, category: 'trip' },
  
  // Location terms
  'location': { weight: 1.1, category: 'location' },
  'where': { weight: 1.2, category: 'location' },
  'home': { weight: 1.0, category: 'location' },
  'work': { weight: 1.0, category: 'location' },
  'office': { weight: 1.0, category: 'location' },
  'arrived': { weight: 1.0, category: 'location' },
  'left': { weight: 1.0, category: 'location' },
  'parked': { weight: 1.0, category: 'location' },
  
  // Vehicle status terms
  'battery': { weight: 1.2, category: 'status' },
  'fuel': { weight: 1.1, category: 'status' },
  'engine': { weight: 1.1, category: 'status' },
  'ignition': { weight: 1.0, category: 'status' },
  'online': { weight: 1.0, category: 'status' },
  'offline': { weight: 1.0, category: 'status' },
  'speed': { weight: 1.1, category: 'status' },
  'moving': { weight: 1.0, category: 'status' },
  'stopped': { weight: 1.0, category: 'status' },
  
  // Command terms
  'lock': { weight: 1.3, category: 'command' },
  'unlock': { weight: 1.3, category: 'command' },
  'alert': { weight: 1.2, category: 'command' },
  'notify': { weight: 1.1, category: 'command' },
  'command': { weight: 1.0, category: 'command' },
  'control': { weight: 1.0, category: 'command' },
};

// Category dimension ranges (total: 1536)
const CATEGORY_RANGES: Record<string, [number, number]> = {
  'behavior': [0, 200],
  'performance': [200, 350],
  'time': [350, 500],
  'trip': [500, 650],
  'location': [650, 800],
  'status': [800, 950],
  'command': [950, 1100],
  'general': [1100, 1536],
};

/**
 * Simple hash function for string to number
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Generate a semantic embedding for text content
 * Creates a 1536-dimension vector optimized for cosine similarity search
 */
export function generateTextEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  
  // Tokenize and normalize
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  
  // Process domain vocabulary matches
  for (const [word, count] of wordCounts) {
    const vocabEntry = DOMAIN_VOCABULARY[word];
    
    if (vocabEntry) {
      const [start, end] = CATEGORY_RANGES[vocabEntry.category];
      const range = end - start;
      
      // Distribute influence across the category range
      const hash = hashString(word);
      const positions = 15; // Number of dimensions to activate per word
      
      for (let i = 0; i < positions; i++) {
        const pos = start + ((hash + i * 97) % range);
        const weight = vocabEntry.weight * Math.log2(count + 1);
        embedding[pos] += weight * Math.cos(i * 0.4);
      }
    } else {
      // General vocabulary - use hash-based distribution
      const [start, end] = CATEGORY_RANGES['general'];
      const range = end - start;
      const hash = hashString(word);
      
      for (let i = 0; i < 5; i++) {
        const pos = start + ((hash + i * 31) % range);
        embedding[pos] += 0.3 * Math.log2(count + 1) * Math.sin(i * 0.5);
      }
    }
  }
  
  // Add n-gram features for context
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + '_' + words[i + 1];
    const hash = hashString(bigram);
    const [start, end] = CATEGORY_RANGES['general'];
    const pos = start + (hash % (end - start));
    embedding[pos] += 0.5;
  }
  
  // Add sentence-level features
  const sentenceFeatures = {
    questionMark: text.includes('?') ? 1 : 0,
    exclamation: text.includes('!') ? 1 : 0,
    wordCount: Math.min(words.length / 50, 1),
    avgWordLength: words.reduce((sum, w) => sum + w.length, 0) / Math.max(words.length, 1) / 10,
  };
  
  // Encode sentence features in last dimensions
  embedding[1530] = sentenceFeatures.questionMark * 0.5;
  embedding[1531] = sentenceFeatures.exclamation * 0.3;
  embedding[1532] = sentenceFeatures.wordCount;
  embedding[1533] = sentenceFeatures.avgWordLength;
  
  // Normalize to unit vector for cosine similarity
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
}

/**
 * Generate embedding for driving analytics/trip data
 * Optimized for trip_analytics table searches
 */
export function generateDrivingEmbedding(
  summary: string,
  driverScore: number,
  harshBraking: number,
  harshAcceleration: number,
  harshCornering: number,
  avgSpeed: number,
  maxSpeed: number
): number[] {
  // Start with text-based embedding
  const embedding = generateTextEmbedding(summary);
  
  // Enhance behavior dimensions with numeric metrics
  const [behaviorStart] = CATEGORY_RANGES['behavior'];
  
  // Driver score influence (0-100 mapped to behavior dims)
  const scoreNormalized = driverScore / 100;
  for (let i = 0; i < 30; i++) {
    embedding[behaviorStart + i] += scoreNormalized * Math.sin(i * 0.2) * 0.5;
  }
  
  // Harsh events influence
  const totalEvents = harshBraking + harshAcceleration + harshCornering;
  const eventsNormalized = Math.min(totalEvents / 20, 1);
  
  for (let i = 30; i < 60; i++) {
    embedding[behaviorStart + i] += (harshBraking / Math.max(totalEvents, 1)) * Math.cos((i - 30) * 0.3) * eventsNormalized;
  }
  for (let i = 60; i < 90; i++) {
    embedding[behaviorStart + i] += (harshAcceleration / Math.max(totalEvents, 1)) * Math.cos((i - 60) * 0.3) * eventsNormalized;
  }
  for (let i = 90; i < 120; i++) {
    embedding[behaviorStart + i] += (harshCornering / Math.max(totalEvents, 1)) * Math.cos((i - 90) * 0.3) * eventsNormalized;
  }
  
  // Speed metrics in status dimensions
  const [statusStart] = CATEGORY_RANGES['status'];
  const speedNorm = Math.min(avgSpeed / 120, 1);
  const maxSpeedNorm = Math.min(maxSpeed / 150, 1);
  
  for (let i = 0; i < 25; i++) {
    embedding[statusStart + i] += speedNorm * Math.sin(i * 0.25) * 0.4;
  }
  for (let i = 25; i < 50; i++) {
    embedding[statusStart + i] += maxSpeedNorm * Math.sin((i - 25) * 0.25) * 0.4;
  }
  
  // Re-normalize after enhancements
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
}

/**
 * Format embedding array for PostgreSQL vector type
 */
export function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Calculate cosine similarity between two embeddings
 * Useful for client-side similarity checks
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}
