import type { StatsData, ChartData } from "@coldjot/types";

export const DEMO_STATS: StatsData = {
  totalEmails: 22453,
  sentEmails: 22453,
  openedEmails: 17234,
  uniqueOpens: 11560,
  clickedEmails: 8231,
  repliedEmails: 974,
  bouncedEmails: 0,
  unsubscribed: 3,
  interested: 105,
  peopleContacted: 8560,
  openRate: 67.85,
  replyRate: 7.87,
  bounceRate: 0,
};

export function generateDemoChartData(days: number = 30): ChartData[] {
  return Array.from({ length: days }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().split("T")[0];

    // Create more natural variations in the data
    const baseValue = 500;
    const randomFactor = Math.random() * 0.4 + 0.8; // Random between 0.8 and 1.2
    const sent = Math.round(baseValue * randomFactor);
    const openRate = 0.67 * (Math.random() * 0.2 + 0.9); // Random between 0.9 and 1.1 of base rate
    const replyRate = 0.08 * (Math.random() * 0.3 + 0.85); // Random between 0.85 and 1.15 of base rate
    const uniqueOpenRate = 0.45 * (Math.random() * 0.2 + 0.9); // Random between 0.9 and 1.1 of base rate

    return {
      date: dateStr,
      sent,
      opened: Math.round(sent * openRate),
      replied: Math.round(sent * replyRate),
      uniqueOpens: Math.round(sent * uniqueOpenRate),
    };
  });
}
