import type { CaseRoute } from "./models";

export interface SlaMetrics {
  first_response_seconds: number | null;
  sla_minutes: number | null;
  sla_status: "⏳ Waiting" | "🟢 Fast (<5m)" | "🔴 Overdue SLA";
  resolution_seconds: number | null;
}

export function calculateSla(route: Pick<CaseRoute, "opened_at" | "first_response_at" | "closed_at">): SlaMetrics {
  const firstResponseSeconds = route.first_response_at === null
    ? null
    : Math.max(0, Math.round((route.first_response_at - route.opened_at) / 1000));
  const slaMinutes = firstResponseSeconds === null ? null : Math.round((firstResponseSeconds / 60) * 10) / 10;
  const resolutionSeconds = route.closed_at === null
    ? null
    : Math.max(0, Math.round((route.closed_at - route.opened_at) / 1000));
  return {
    first_response_seconds: firstResponseSeconds,
    sla_minutes: slaMinutes,
    sla_status: firstResponseSeconds === null ? "⏳ Waiting" : firstResponseSeconds <= 300 ? "🟢 Fast (<5m)" : "🔴 Overdue SLA",
    resolution_seconds: resolutionSeconds,
  };
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  if (seconds < 60) return `${seconds} วินาที`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} นาที ${remainder} วินาที` : `${minutes} นาที`;
}
