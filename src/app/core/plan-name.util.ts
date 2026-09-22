const LOWERCASED_CONNECTOR_WORDS = new Set(['to', 'of', 'and', 'for', 'with']);

function titleCasedPlanKey(planKey: string): string {
  return planKey
    .split(/[_\-\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      const lower = word.toLowerCase();
      if (LOWERCASED_CONNECTOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function fallbackLabelFromPlanKey(planKey: string | null | undefined): string {
  if (!planKey) return '';
  return titleCasedPlanKey(planKey);
}

export interface PlanWithNames {
  planName?: string | null;
  displayName?: string | null;
}

export function planDisplayNameOrFallback(plan: PlanWithNames | null | undefined, fallback = ''): string {
  const displayName = plan?.displayName?.trim();
  if (displayName) return displayName;
  return fallbackLabelFromPlanKey(plan?.planName) || fallback;
}
