"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { ChartData } from "@/types/stats";
import { format } from "date-fns";

interface StatsChartProps {
  data: ChartData[];
}

// Define color constants for better consistency
const COLORS = {
  sent: {
    stroke: "#60a5fa", // blue-400
    fill: "#3b82f6", // blue-500
  },
  opened: {
    stroke: "#4ade80", // green-400
    fill: "#22c55e", // green-500
  },
  replied: {
    stroke: "#a78bfa", // violet-400
    fill: "#8b5cf6", // violet-500
  },
  // uniqueOpens: {
  //   stroke: "#fb923c", // orange-400
  //   fill: "#f97316", // orange-500
  // },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-none">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col">
            <span className="text-[0.70rem] uppercase text-muted-foreground">
              Date
            </span>
            <span className="font-bold text-muted-foreground">
              {format(new Date(label), "MMM d, yyyy")}
            </span>
          </div>
          {payload.map((entry: any) => (
            <div key={entry.name} className="flex flex-col">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                {entry.name}
              </span>
              <span className="font-bold" style={{ color: entry.color }}>
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export function StatsChart({ data }: StatsChartProps) {
  return (
    <Card className="pb-6 shadow-none">
      <div className="space-y-4">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Email Activity</h2>
          <p className="text-sm text-muted-foreground">
            Overview of email campaign performance over time
          </p>
        </div>
        <div className="h-[300px] w-full pr-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="sent" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={COLORS.sent.fill}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={COLORS.sent.fill}
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="opened" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={COLORS.opened.fill}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={COLORS.opened.fill}
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="replied" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={COLORS.replied.fill}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={COLORS.replied.fill}
                    stopOpacity={0}
                  />
                </linearGradient>
                {/* <linearGradient id="uniqueOpens" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={COLORS.uniqueOpens.fill}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={COLORS.uniqueOpens.fill}
                    stopOpacity={0}
                  />
                </linearGradient> */}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
                opacity={0.4}
              />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => format(new Date(value), "MMM d")}
                minTickGap={30}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.toLocaleString()}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="basis"
                dataKey="sent"
                name="Sent"
                stroke={COLORS.sent.stroke}
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#sent)"
              />
              <Area
                type="basis"
                dataKey="opened"
                name="Opened"
                stroke={COLORS.opened.stroke}
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#opened)"
              />
              <Area
                type="basis"
                dataKey="replied"
                name="Replied"
                stroke={COLORS.replied.stroke}
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#replied)"
              />
              {/* <Area
                type="basis"
                dataKey="uniqueOpens"
                name="Unique Opens"
                stroke={COLORS.uniqueOpens.stroke}
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#uniqueOpens)"
              /> */}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 py-2">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: COLORS.sent.fill }}
            />
            <span className="text-sm text-muted-foreground">Sent</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: COLORS.opened.fill }}
            />
            <span className="text-sm text-muted-foreground">Opened</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: COLORS.replied.fill }}
            />
            <span className="text-sm text-muted-foreground">Replied</span>
          </div>
          {/* <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: COLORS.uniqueOpens.fill }}
            />
            <span className="text-sm text-muted-foreground">Unique Opens</span>
          </div> */}
        </div>
      </div>
    </Card>
  );
}
