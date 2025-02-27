import { cleanText, calculateReadability } from "./index";

// ------------------------------------------------------------
// Spam Detection Utility
// ------------------------------------------------------------

interface SpamCheckResult {
  score: number;
  status: string;
  reasons: string[];
}

// Expanded list of spam trigger words and phrases
const spamTriggerWords = [
  "free",
  "guaranteed",
  "money",
  "win",
  "urgent",
  "click here",
  "limited time",
  "act now",
  "discount",
  "offer",
  "exclusive",
  "cash",
  "prize",
  "credit",
  "loan",
  "investment",
  "opportunity",
  "earn",
  "income",
  "debt",
  "save",
  "buy",
  "order",
  "shop",
  "sale",
  "cheap",
  "best price",
  "no cost",
  "risk-free",
  "trial",
  "bonus",
  "gift",
  "winner",
  "selected",
  "congratulations",
  "you’ve won",
  "claim",
  "verify",
  "confirm",
  "password",
  "account",
  "security",
  "update",
  "login",
  "sign in",
  "click below",
  "unsubscribe",
  "opt-out",
  "viagra",
  "cialis",
  "pharmacy",
  "meds",
  "pills",
  "drugs",
  "weight loss",
  "diet",
  "fitness",
  "health",
  "insurance",
  "mortgage",
  "refinance",
  "forex",
  "trading",
  "crypto",
  "bitcoin",
  "earn money",
  "make money",
  "work from home",
  "home business",
  "online business",
  "get rich",
  "millionaire",
  "luxury",
  "casino",
  "gambling",
  "bet",
  "lottery",
  "sweepstakes",
  "raffle",
  "prize draw",
  "win big",
  "jackpot",
  "lucky",
  "fortune",
  "exclusive offer",
  "special deal",
  "limited offer",
  "time-sensitive",
  "urgent response",
  "immediate action",
  "don’t miss",
  "last chance",
  "final notice",
  "alert",
  "warning",
  "important",
  "attention",
  "confidential",
  "private",
  "personal",
  "sensitive",
  "secure",
  "encrypted",
  "safe",
  "trusted",
  "verified",
  "certified",
  "official",
  "authentic",
  "genuine",
  "real",
  "legitimate",
  "approved",
  "authorized",
  "endorsed",
  "recommended",
  "best",
  "top",
  "number one",
  "leading",
  "premier",
  "elite",
  "superior",
  "ultimate",
  "unbeatable",
  "unmatched",
  "extraordinary",
  "amazing",
  "incredible",
  "fantastic",
  "awesome",
  "fabulous",
  "terrific",
  "wonderful",
  "marvelous",
  "phenomenal",
  "sensational",
  "spectacular",
  "stunning",
  "breathtaking",
  "astonishing",
  "astounding",
  "mind-blowing",
  "jaw-dropping",
];

// List of common URL shorteners
const urlShorteners = ["bit.ly", "tinyurl", "goo.gl", "t.co"];

// Comprehensive spam detection function
export const checkEmailSpam = (email: string): SpamCheckResult => {
  const cleanedEmail = cleanText(email);
  const words = cleanedEmail.split(/\s+/).filter((w) => w.length > 0);
  const sentences = cleanedEmail
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0);
  const hasURL = email.match(/https?:\/\/[^\s]+/g) !== null;

  let spamScore = 100;
  const detectedReasons: string[] = [];

  // Spam checks with conditions and penalties
  const spamChecks = [
    // Formatting Checks
    {
      condition:
        words.filter((w) => w.match(/^[A-Z]{3,}$/) && w.length > 3).length > 0,
      penalty: 15,
      reason: "Excessive capitalization detected (e.g., all caps words)",
    },
    {
      condition: (() => {
        const uppercaseCount = (cleanedEmail.match(/[A-Z]/g) || []).length;
        const totalLetters = (cleanedEmail.match(/[a-zA-Z]/g) || []).length;
        const uppercaseRatio =
          totalLetters > 0 ? uppercaseCount / totalLetters : 0;
        return uppercaseRatio > 0.3;
      })(),
      penalty: 10,
      reason: "High ratio of uppercase letters (>30%)",
    },
    {
      condition: (email.match(/!/g) || []).length > 3,
      penalty: 8,
      reason: "Excessive exclamation points (>3)",
    },
    {
      condition: (cleanedEmail.match(/[@#$%]/g) || []).length > 5,
      penalty: 10,
      reason: "Excessive special characters (@, #, $, % > 5)",
    },

    // Content Analysis
    {
      condition: spamTriggerWords.some((phrase) =>
        cleanedEmail.toLowerCase().includes(phrase)
      ),
      penalty: 10,
      reason: "Spam trigger phrases detected",
    },
    {
      condition:
        sentences.length > 0 &&
        sentences.every((s) => s.split(/\s+/).length < 5),
      penalty: 10,
      reason: "Excessively short sentences (all < 5 words)",
    },
    {
      condition: words.length > 200 && sentences.length < 5,
      penalty: 15,
      reason: "Unstructured long text (>200 words, <5 sentences)",
    },

    // Link Analysis
    {
      condition: (email.match(/https?:\/\/[^\s]+/g) || []).length > 2,
      penalty: 12,
      reason: "Too many links (>2)",
    },
    {
      condition: (email.match(/https?:\/\/[^\s]+/g) || []).some((link) =>
        urlShorteners.some((shortener) => link.includes(shortener))
      ),
      penalty: 15,
      reason: "Use of URL shorteners (e.g., bit.ly, tinyurl)",
    },

    // HTML Content Checks
    {
      condition: email.match(/<[^>]+>/g) !== null,
      penalty: 5,
      reason: "Presence of HTML tags",
    },
    {
      condition: email.includes("<script>"),
      penalty: 20,
      reason: "Contains <script> tags (potential malware)",
    },
    {
      condition: (email.match(/<a[^>]*>/g) || []).length > 5,
      penalty: 12,
      reason: "Excessive <a> tags (>5 links)",
    },
    {
      condition: (email.match(/<img[^>]*>/g) || []).length > 3,
      penalty: 8,
      reason: "Too many <img> tags (>3 images)",
    },

    // Readability Check
    {
      condition: calculateReadability(cleanedEmail).score < 30,
      penalty: 5,
      reason: "Low readability score (<30, difficult to read)",
    },
  ];

  // Apply penalties and collect reasons
  spamChecks.forEach((check) => {
    if (check.condition) {
      spamScore = Math.max(spamScore - check.penalty, 0);
      detectedReasons.push(check.reason);
    }
  });

  // Bonus for professional formatting
  if (words.length > 50 && sentences.length >= 5 && !hasURL) {
    spamScore = Math.min(spamScore + 5, 100);
    detectedReasons.push(
      "Bonus: Professional formatting (no URLs, well-structured)"
    );
  }

  // Determine status
  let status: string;
  if (spamScore >= 80) status = "Excellent (Highly Likely to Reach Inbox)";
  else if (spamScore >= 60) status = "Good (Likely to Reach Inbox)";
  else if (spamScore >= 40) status = "Fair (May Reach Inbox)";
  else status = "Poor (Likely to Be Marked as Spam)";

  return { score: spamScore, status, reasons: detectedReasons };
};
