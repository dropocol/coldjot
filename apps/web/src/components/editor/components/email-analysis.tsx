"use client";

import { checkEmailSpam } from "@/utils";

import { arc } from "d3-shape";
import { getTextStats, calculateReadability } from "@/utils";

interface EmailAnalysisProps {
  content: string;
}

interface ArcDatum {
  startAngle: number;
  endAngle: number;
}

// Gauge chart configuration
const GAUGE_CONFIG = {
  width: 400,
  height: 240,
  scale: 1,
  radius: 180,
  thickness: 0.09,
  margin: {
    top: 0,
    bottom: 80,
  },
} as const;

export function EmailAnalysis({ content }: EmailAnalysisProps) {
  // console.log("Content:", content);

  // Get readability score and text statistics
  const { score: readabilityScore, level: readingEase } =
    calculateReadability(content);
  const stats = getTextStats(content);

  // Get spam analysis
  const {
    score: spamScore,
    status: spamStatus,
    reasons: spamReasons,
  } = checkEmailSpam(content);

  // Calculate read time (minimum 15 seconds, based on 210 WPM)
  const readTime = Math.max(Math.ceil((stats.totalWords / 210) * 60), 15);

  // Debug logging
  console.log("Analysis Debug:", {
    readabilityScore,
    readingEase,
    stats,
    spamScore,
    spamStatus,
    readTime,
  });

  // Define color constants for the gauge
  const colors = {
    tomato: "#ff6b6b",
    orange: "#ff922b",
    amber: "#fcc419",
    green: "#51cf66",
    gray: "#dee2e6",
  };

  // Create arc generator
  const createArc = arc<ArcDatum>()
    .innerRadius(GAUGE_CONFIG.radius * (1 - GAUGE_CONFIG.thickness))
    .outerRadius(GAUGE_CONFIG.radius)
    .cornerRadius(8)
    .padAngle(0.03)
    .startAngle((d) => d.startAngle)
    .endAngle((d) => d.endAngle);

  // Generate arc paths with adjusted angles for better rounding
  const redArc = createArc({
    startAngle: -Math.PI / 1.9,
    endAngle: -Math.PI / 4 - 0.02,
  });

  const orangeArc = createArc({
    startAngle: -Math.PI / 4 + 0.02,
    endAngle: -0.02,
  });

  const yellowArc = createArc({
    startAngle: 0.02,
    endAngle: Math.PI / 4 - 0.02,
  });

  const greenArc = createArc({
    startAngle: Math.PI / 4 + 0.02,
    endAngle: Math.PI / 1.9,
  });

  // Calculate marker location based on score
  const calculateMarkerLocation = (score: number) => {
    // Map score (0-100) to angle range (-90° to 90°)
    // 0 score = -90° (9 o'clock)
    // 50 score = 0° (12 o'clock)
    // 100 score = 90° (3 o'clock)
    const normalizedScore = Math.min(Math.max(score, 0), 100);
    const angleInDegrees = -180 + (normalizedScore / 100) * 180;
    const angleInRadians = (angleInDegrees * Math.PI) / 180;

    // Calculate position on the arc
    const radius = GAUGE_CONFIG.radius - 8;
    return [
      Math.cos(angleInRadians) * radius,
      Math.sin(angleInRadians) * radius,
    ];
  };

  const markerLocation = calculateMarkerLocation(readabilityScore);

  return (
    <div className="space-y-8">
      {/* Gauge Chart */}
      <div className="flex w-full items-center justify-center pt-12">
        <div className="relative">
          <svg
            width={GAUGE_CONFIG.width}
            height={GAUGE_CONFIG.height}
            style={{ overflow: "visible" }}
          >
            <g
              transform={`translate(${GAUGE_CONFIG.width / 2}, ${GAUGE_CONFIG.height - GAUGE_CONFIG.margin.bottom})`}
            >
              {/* Colored sections */}
              <path d={redArc || ""} fill={colors.tomato} />
              <path d={orangeArc || ""} fill={colors.orange} />
              <path d={yellowArc || ""} fill={colors.amber} />
              <path d={greenArc || ""} fill={colors.green} />
              {/* Indicator blob */}
              <circle
                cx={markerLocation[0]}
                cy={markerLocation[1]}
                r="8"
                fill="white"
                stroke={readingEase.color}
                strokeWidth="3"
                filter="drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))"
              />
            </g>
          </svg>
          <div className="absolute top-24 left-1/2 -translate-x-1/2 transform text-center">
            <div className="text-5xl font-semibold">{readabilityScore}</div>
            <div className="text-sm font-medium text-gray-500">
              Readability Score
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Your readability score is calculated using the Flesch-Kincaid formula,
        which considers the number of words, sentences, and reading time for
        your email.
      </p>

      <div className="h-px bg-gray-200" />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-medium">{stats.totalWords}</span>
          </div>
          <span className="pb-2 text-sm text-gray-500">Word Count</span>
          <div className="h-px bg-gray-200" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-medium">{stats.totalSentences}</span>
          </div>
          <span className="pb-2 text-sm text-gray-500">Sentence Count</span>
          <div className="h-px bg-gray-200" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-medium">{readingEase.text}</span>
            <svg
              width="1em"
              height="1em"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              style={{ color: readingEase.color }}
            >
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M1.25 12C1.25 6.06 6.06 1.25 12 1.25c5.93 0 10.75 4.81 10.75 10.75 0 5.93-4.82 10.75-10.75 10.75-5.94 0-10.75-4.82-10.75-10.75Zm15.78-1.97c.29-.3.29-.77 0-1.07-.3-.3-.77-.3-1.07 0l-4.97 4.96-1.97-1.97c-.3-.3-.77-.3-1.07 0-.3.29-.3.76 0 1.06l2.5 2.5c.14.14.33.21.53.21.19 0 .38-.08.53-.22l5.5-5.5Z"
              />
            </svg>
          </div>
          <span className="pb-2 text-sm text-gray-500">Reading Ease</span>
          <div className="h-px bg-gray-200" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-medium">{readTime} sec</span>
          </div>
          <span className="pb-2 text-sm text-gray-500">Read Time</span>
          <div className="h-px bg-gray-200" />
        </div>
      </div>

      {/* Delivery Score */}
      <div className="flex flex-col gap-3">
        <span className="text-base font-medium">Delivery Score</span>
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="flex h-6 w-full items-center justify-between gap-1">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="h-full flex-1 shrink-0 rounded-full transition-all duration-300"
                style={{
                  backgroundColor:
                    i < (spamScore / 100) * 40 ? colors.green : colors.gray,
                }}
              />
            ))}
          </div>
        </div>
        <span className="mt-2 text-sm text-gray-500">
          {spamStatus}
          {spamReasons.length > 0 && (
            <>
              <br />
              <span className="text-red-500">
                Issues found: {spamReasons.join(", ")}
              </span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
