// Text cleaning utility (enhanced for precise word and sentence counting)
export const cleanText = (text: string | undefined | null): string => {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\u2028/g, " ") // Normalize Unicode line separator
    .replace(/[\n\r\t]+/g, " ") // Normalize line breaks and tabs to single spaces
    .replace(/https?:\/\/[^\s]+/g, " URL ") // Replace URLs with "URL" and ensure spaces around it
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, " EMAIL ") // Replace emails with "EMAIL"
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "") // Remove phone numbers
    .replace(/[^\w\s.!?'-]/g, "") // Keep letters, numbers, dots, exclamation, question marks, hyphens, and apostrophes
    .replace(/\s+/g, " ") // Collapse multiple spaces into one
    .trim();
};

// 0-20 Very Confusing
// 20-40 Confusing

// Simple space-based word counter (splits contractions)
export const countWordsBySpaces = (text: string | undefined | null): number => {
  if (!text || typeof text !== "string") return 0;
  const cleanedText = cleanText(text);

  // Split by any whitespace and filter out empty strings
  const words = cleanedText.split(/\s+/).filter((word) => {
    // Keep URLs, emails, and words with letters
    return (
      word.length > 0 &&
      (word === "URL" || word === "EMAIL" || /[a-zA-Z]/.test(word))
    );
  });

  console.log("Space-based word count:", {
    cleanedText,
    wordCount: words.length,
    words,
  });

  return words.length;
};

// Accurate word counter (preserves contractions and possessives)
export const countWordsAccurate = (text: string | undefined | null): number => {
  console.log("Counting words accurately:", {
    text,
  });
  if (!text || typeof text !== "string") return 0;
  const cleanedText = cleanText(text);

  // Split and preserve contractions/possessives as single words
  const words = cleanedText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => {
      if (!word || word.length === 0) return false;
      // Keep URLs, emails, and valid words
      if (word === "URL" || word === "EMAIL") return true;
      return !/^[.!?,;:-]+$/.test(word) && /[a-zA-Z]/.test(word);
    });

  // console.log("Accurate word count:", {
  //   cleanedText,
  //   wordCount: words.length,
  //   words,
  // });

  return words.length;
};

export interface ReadabilityResult {
  score: number;
  level: {
    text: string;
    color: string;
    section: string;
  };
  readTimeSeconds: number; // Added read time in seconds for completeness
}

// Syllable counting utility (unchanged, but verified for accuracy)
const countSyllables = (word: string): number => {
  if (!word || typeof word !== "string") return 0;
  word = word.toLowerCase().trim();
  if (word.length <= 2) return 1;

  // Handle common exceptions like "le" endings (e.g., "table" = 2 syllables)
  if (
    word.endsWith("le") &&
    word.length > 2 &&
    !/[aeiouy]/.test(word.slice(-3, -2))
  ) {
    return 2;
  }

  // Remove silent 'e' at the end and 'es', 'ed'
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");

  // Count vowel groups
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? Math.min(syllables.length, 5) : 1;
};

// Get text statistics (now using accurate word counting)
export const getTextStats = (text: string | undefined | null) => {
  const cleanedText = cleanText(text);
  if (!cleanedText) {
    return {
      words: [],
      sentences: [],
      totalWords: 0,
      totalSentences: 0,
      totalSyllables: 0,
    };
  }

  // Use accurate word counting
  const words = cleanedText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => {
      if (!word || word.length === 0) return false;
      return !/^[.!?,;:-]+$/.test(word) && /[a-zA-Z]/.test(word);
    });

  const totalWords = words.length;

  // Log both counting methods for comparison
  // console.log("Word Count Comparison:", {
  //   accurateCount: countWordsAccurate(text),
  //   spaceBasedCount: countWordsBySpaces(text),
  //   difference: countWordsBySpaces(text) - countWordsAccurate(text),
  // });

  // Improved sentence detection: handle hyphens and abbreviations
  const sentences = cleanedText
    .split(/([.!?]+(?![a-zA-Z0-9-])|\n)(?=\s+)/)
    .map((s) => (s && typeof s === "string" ? s.trim() : ""))
    .filter((s) => s && s.length > 0 && /[a-zA-Z]/.test(s));

  // Enhanced debug logging for word and sentence verification
  if (process.env.NODE_ENV !== "production") {
    // console.log("Text Stats Debug:", {
    //   inputText:
    //     text?.slice(0, 100) + (text?.length && text.length > 100 ? "..." : ""),
    //   cleanedText:
    //     cleanedText.slice(0, 100) + (cleanedText.length > 100 ? "..." : ""),
    //   totalWords,
    //   totalSentences: sentences.length,
    //   wordsList: words,
    //   sentencesList: sentences,
    // });
  }

  return {
    words,
    sentences,
    totalWords,
    totalSentences: Math.max(sentences.length, 1),
    totalSyllables: words.reduce((sum, word) => sum + countSyllables(word), 0),
  };
};

// Calculate read time in seconds (configurable for flexibility)
const calculateReadTime = (
  wordCount: number,
  wordsPerMinute: number = 200
): number => {
  const minutes = wordCount / wordsPerMinute;
  return Math.round(minutes * 60); // Convert to seconds and round
};

// Flesch-Kincaid Reading Ease calculation (with refined adjustments)
export const calculateReadability = (
  text: string | undefined | null
): ReadabilityResult => {
  if (!text || typeof text !== "string" || !text.trim()) {
    return {
      score: 0,
      level: { text: "Difficult", color: "#ef4444", section: "red" },
      readTimeSeconds: 0,
    };
  }

  const stats = getTextStats(text);

  if (stats.totalWords === 0) {
    return {
      score: 0,
      level: { text: "Difficult", color: "#ef4444", section: "red" },
      readTimeSeconds: 0,
    };
  }

  // Calculate base Flesch-Kincaid Reading Ease score
  let score =
    206.835 -
    1.015 * (stats.totalWords / stats.totalSentences) -
    84.6 * (stats.totalSyllables / stats.totalWords);

  // Refined adjustments for better accuracy
  const adjustments = {
    // Gradual penalty for short content (less than 50 words)
    shortContent:
      stats.totalWords < 50 ? 1 - (50 - stats.totalWords) * 0.01 : 1,
    // Penalty for very long sentences (avg > 30 words)
    longSentences: stats.totalWords / stats.totalSentences > 30 ? 0.95 : 1,
    // Penalty for high syllable complexity (avg > 1.5 syllables/word)
    complexity: stats.totalSyllables / stats.totalWords > 1.5 ? 0.98 : 1,
    // Bonus for optimal sentence length (10-20 words)
    optimalLength:
      stats.totalWords / stats.totalSentences >= 10 &&
      stats.totalWords / stats.totalSentences <= 20
        ? 1.05
        : 1,
  };

  // Apply adjustments
  Object.values(adjustments).forEach((adjustment) => {
    score *= adjustment;
  });

  // Ensure score is between 0 and 100
  const finalScore = Number(Math.min(Math.max(score, 0), 100).toFixed(1));

  // Calculate read time
  const readTimeSeconds = calculateReadTime(stats.totalWords);

  return {
    score: finalScore,
    level: getReadingEaseLevel(finalScore),
    readTimeSeconds,
  };
};
// Helper function to determine reading ease level
const getReadingEaseLevel = (score: number) => {
  if (score >= 100) {
    return { text: "Perfect", color: "#22c55e", section: "green" };
  }
  if (score >= 90) {
    return { text: "Conversational", color: "#22c55e", section: "green" };
  }
  if (score >= 80) {
    return { text: "Clear", color: "#f97316", section: "yellow" };
  }
  if (score >= 70) {
    return { text: "Fairly Easy", color: "#eab308", section: "yellow" };
  }
  if (score >= 60) {
    return { text: "Challenging", color: "#f97316", section: "orange" };
  }
  if (score >= 50) {
    return { text: "Difficult", color: "#f97316", section: "orange" };
  }
  if (score >= 30) {
    return { text: "Graduate", color: "#ef4444", section: "red" };
  }
  return { text: "Complex", color: "#ef4444", section: "red" };
};

// 0-30 Very Confusing
// 30-50 Difficult
// 50-60 Fairly Difficult
// 60-70 Standard
// 70-80 Fairly Easy
// 80-90 Easy
// 90-100 Perfect
