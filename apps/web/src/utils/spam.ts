import { cleanText } from "./index";
// ------------------------------------------------------------
// Spam detection utility
// ------------------------------------------------------------

interface SpamCheckResult {
  score: number;
  status: string;
  reasons: string[];
}

// Spam detection utility
export const checkEmailSpam = (email: string): SpamCheckResult => {
  const cleanedEmail = cleanText(email);
  const words = cleanedEmail.split(/\s+/).filter((w) => w.length > 0);
  const sentences = cleanedEmail
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0);
  const hasURL = email.match(/https?:\/\/[^\s]+/g) !== null;

  let spamScore = 100;
  const detectedReasons: string[] = [];

  // Spam checks with their conditions and penalties
  const spamChecks = [
    {
      condition:
        words.filter((w) => w.match(/^[A-Z]{3,}$/) && w.length > 3).length > 0,
      penalty: 15,
      reason: "Excessive capitalization detected",
    },
    {
      condition: words.some((w) =>
        ["free", "guaranteed", "money", "win", "urgent"].includes(
          w.toLowerCase()
        )
      ),
      penalty: 10,
      reason: "Spam trigger words detected",
    },
    {
      condition: (email.match(/!/g) || []).length > 3,
      penalty: 8,
      reason: "Excessive exclamation points",
    },
    {
      condition: (email.match(/https?:\/\/[^\s]+/g) || []).length > 2,
      penalty: 12,
      reason: "Too many links",
    },
    {
      condition:
        sentences.length > 0 &&
        sentences.every((s) => s.split(/\s+/).length < 5),
      penalty: 10,
      reason: "Excessively short sentences",
    },
    {
      condition: words.length > 200 && sentences.length < 5,
      penalty: 15,
      reason: "Unstructured long text",
    },
  ];

  // Apply penalties and collect reasons
  spamChecks.forEach((check) => {
    if (check.condition) {
      spamScore = Math.max(spamScore - check.penalty, 0);
      detectedReasons.push(check.reason);
    }
  });

  // Apply bonus for professional formatting
  if (words.length > 50 && sentences.length >= 5 && !hasURL) {
    spamScore = Math.min(spamScore + 5, 100);
  }

  // Determine status
  let status: string;
  if (spamScore >= 80) status = "Excellent (Highly Likely to Reach Inbox)";
  else if (spamScore >= 60) status = "Good (Likely to Reach Inbox)";
  else if (spamScore >= 40) status = "Fair (May Reach Inbox)";
  else status = "Poor (Likely to Be Marked as Spam)";

  return { score: spamScore, status, reasons: detectedReasons };
};
