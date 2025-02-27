// utils/fleschKincaid.ts

// Import cleanText if needed from your existing file
import { cleanText } from "./index";

// Interface for the readability result
interface ReadabilityResult {
  score: number;
  level: {
    text: string;
    color: string;
    section: string;
  };
}

// Syllable counting utility (inspired by GitHub implementations)
const countSyllables = (word: string): number => {
  word = word.toLowerCase().trim();
  if (word.length <= 2) return 1;

  // Remove silent endings and handle common patterns
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");

  // Count vowel groups (aeiouy), handling diphthongs
  const vowelGroups = word.match(/[aeiouy]{1,2}/g) || [];
  return Math.min(vowelGroups.length, 5); // Cap at 5 syllables
};

// Improved sentence detection function
const detectSentences = (text: string): string[] => {
  // Clean text to normalize whitespace and remove noise, but preserve structure
  let cleaned = text
    .replace(/\u2028/g, "\n") // Normalize Unicode line separator to newline
    .replace(/[\r\t]+/g, " ") // Normalize carriage returns and tabs to spaces
    .trim();

  // Split into potential sentence candidates (handle periods, exclamation, question marks, colons, and newlines)
  let candidates = cleaned.split(/([.!?:\n](?:\s+|$))/).map((s) => s.trim());

  // Filter and refine sentences
  const sentences = [];
  for (let i = 0; i < candidates.length; i++) {
    let candidate = candidates[i].trim();
    if (!candidate) continue;

    // Skip empty or very short fragments
    if (candidate.length <= 2) continue;

    // Handle greetings, signatures, and URLs
    if (
      /Hi|Hello|Dear|Best|Regards|Sincerely/i.test(candidate) &&
      !/[.!?]$/.test(candidate)
    ) {
      // Treat greetings or closings without ending punctuation as part of the next sentence or skip if standalone
      if (i + 1 < candidates.length && /[.!?]$/.test(candidates[i + 1])) {
        continue; // Skip and merge with next if applicable
      } else if (/Best|Regards|Sincerely/i.test(candidate)) {
        continue; // Skip signatures without ending punctuation
      }
    }

    // Remove URLs and signatures to prevent false positives
    candidate = candidate
      .replace(/https?:\/\/[^\s]+/g, "") // Remove URLs
      .replace(
        /Best,?\s*[A-Za-z]+\s*[A-Za-z]+\s*(Currently Building\s*[A-Za-z]+)/i,
        ""
      ) // Remove signatures
      .trim();

    // Only keep if it’s a complete sentence (ends with . ! ? or :)
    if (candidate && /[.!?:]$/.test(candidate) && candidate.length > 2) {
      sentences.push(candidate);
    }
  }

  return sentences;
};

// Flesch-Kincaid Reading Ease calculation
export const calculateReadability = (text: string): ReadabilityResult => {
  const cleanedText = cleanText(text);
  if (!cleanedText) {
    return {
      score: 0,
      level: { text: "Difficult", color: "#ef4444", section: "red" },
    };
  }

  // Split into words
  const words = cleanedText.split(/\s+/).filter((w) => w.length > 0);

  // Use improved sentence detection
  const sentences = detectSentences(cleanedText);

  if (words.length === 0 || sentences.length === 0) {
    return {
      score: 0,
      level: { text: "Difficult", color: "#ef4444", section: "red" },
    };
  }

  // Core metrics
  const totalWords = words.length;
  const totalSentences = sentences.length;
  const totalSyllables = words.reduce(
    (sum, word) => sum + countSyllables(word),
    0
  );

  // Calculate Flesch-Kincaid Reading Ease (standard formula from GitHub libraries)
  const score =
    206.835 -
    1.015 * (totalWords / totalSentences) -
    84.6 * (totalSyllables / totalWords);

  // Bound score between 0 and 100
  const finalScore = Number(Math.min(Math.max(score, 0), 100).toFixed(1));

  // Determine reading ease level
  const level = getReadingEaseLevel(finalScore);

  // Debug logging for the sample email (optional, for your testing)
  const SAMPLE_EMAIL = `Hi Oren,

I recently came across a job posting for a product design role at your company, and it caught my attention as I specialize in bridging the gap between design and development.

I’m Zeeshan Khan, a full-stack product designer with over a decade of experience helping startups craft seamless digital experiences. My expertise spans industries like HealthTech, FinTech, Transportation, and social media, where I’ve designed and built products that balance aesthetics with functionality.

While my primary focus is design, I also have deep development experience, working with React, Next.js, Node.js, TypeScript, and Postgres—allowing me to take ideas from concept to production efficiently.

You can check out my portfolio here: 
zeeshankhan.me

Beyond client work, I’m currently building ColdJot, an open-source email automation platform. Feel free to check it out on my Github.

If your team is looking for someone who not only designs but also engineers solutions with a founder’s mindset, I’d love to connect and explore how I can add value. Let me know if a quick chat sounds interesting.

Best,
Zeeshan Khan
Currently Building ColdJot`;

  if (
    process.env.NODE_ENV !== "production" &&
    cleanText(text) === cleanText(SAMPLE_EMAIL)
  ) {
    console.log("Readability Debug for Sample Email:", {
      text,
      totalWords: words.length,
      totalSentences: sentences.length,
      totalSyllables,
      avgWordsPerSentence: totalWords / totalSentences,
      avgSyllablesPerWord: totalSyllables / totalWords,
      baseScore: score,
      finalScore,
      readingEase: level,
    });
  }

  return {
    score: finalScore,
    level,
  };
};

// Helper function to determine reading ease level
const getReadingEaseLevel = (score: number) => {
  if (score >= 90)
    return { text: "Very Easy", color: "#22c55e", section: "green" };
  if (score >= 80) return { text: "Easy", color: "#22c55e", section: "green" };
  if (score >= 70)
    return { text: "Fairly Easy", color: "#f97316", section: "yellow" };
  if (score >= 60)
    return { text: "Standard", color: "#eab308", section: "yellow" };
  if (score >= 50)
    return { text: "Fairly Difficult", color: "#f97316", section: "orange" };
  return { text: "Difficult", color: "#ef4444", section: "red" };
};
