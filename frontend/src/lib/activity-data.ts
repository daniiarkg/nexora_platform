export type AutomationActivityRange = "7d" | "30d";

export type AutomationActivityPoint = {
  date: string;
  runs: number;
  successfulRuns: number;
  failedRuns: number;
  avgDurationMs: number;
};

export type AutomationActivitySummary = {
  totalRuns: number;
  successRate: number;
  failedRuns: number;
  avgDurationMs: number;
};

export type AutomationActivitySeries = {
  automationId: string;
  range: AutomationActivityRange;
  points: AutomationActivityPoint[];
  summary: AutomationActivitySummary;
};

export interface AutomationActivityDataExtractPort {
  extractActivity(automationId: string, range: AutomationActivityRange): AutomationActivitySeries;
}

const mockActivitySeeds: Record<string, number[]> = {
  "sales-demo": [
    14, 18, 21, 19, 26, 31, 28, 33, 37, 35, 40, 44, 41, 46, 51, 48, 54, 58, 55, 61, 63, 59, 66, 71, 68, 74, 79, 76,
    83, 88,
  ],
  "customer-support": [
    9, 12, 11, 16, 18, 17, 21, 25, 22, 27, 29, 31, 28, 34, 37, 36, 41, 39, 44, 47, 45, 49, 53, 51, 56, 59, 57, 62,
    64, 67,
  ],
};

export const mockAutomationActivityDataExtractPort: AutomationActivityDataExtractPort = {
  extractActivity(automationId, range) {
    const days = range === "7d" ? 7 : 30;
    const seed = mockActivitySeeds[automationId] ?? mockActivitySeeds["sales-demo"];
    const selected = seed.slice(-days);
    const points = selected.map((runs, index) => {
      const failedRuns = Math.max(0, Math.round(runs * (index % 5 === 0 ? 0.08 : 0.035)));
      const successfulRuns = runs - failedRuns;
      const date = dateForIndex(days, index);
      return {
        date,
        runs,
        successfulRuns,
        failedRuns,
        avgDurationMs: 820 + ((index * 73 + runs * 11) % 460),
      };
    });
    return {
      automationId,
      range,
      points,
      summary: summarize(points),
    };
  },
};

function dateForIndex(days: number, index: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - index - 1));
  return date.toISOString().slice(0, 10);
}

function summarize(points: AutomationActivityPoint[]): AutomationActivitySummary {
  const totalRuns = points.reduce((sum, point) => sum + point.runs, 0);
  const failedRuns = points.reduce((sum, point) => sum + point.failedRuns, 0);
  const totalDuration = points.reduce((sum, point) => sum + point.avgDurationMs * point.runs, 0);
  return {
    totalRuns,
    failedRuns,
    successRate: totalRuns === 0 ? 0 : Math.round(((totalRuns - failedRuns) / totalRuns) * 1000) / 10,
    avgDurationMs: totalRuns === 0 ? 0 : Math.round(totalDuration / totalRuns),
  };
}
