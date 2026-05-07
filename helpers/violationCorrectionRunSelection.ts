export type ViolationReviewRunCandidate = {
  id: number;
  reportArtifactId: number;
  pass: string;
  status: string;
  completedAt: Date | string | null;
  createdAt: Date | string | null;
};

function passPriority(pass: string): number {
  if (pass === "A_FULL") return 3;
  if (pass === "A") return 2;
  return 1;
}

function completedPriority(status: string): number {
  return status === "completed" ? 1 : 0;
}

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function primaryTimestamp(run: ViolationReviewRunCandidate): number {
  return Math.max(timestamp(run.completedAt), timestamp(run.createdAt));
}

function isPreferredReviewRun(
  candidate: ViolationReviewRunCandidate,
  current: ViolationReviewRunCandidate,
): boolean {
  const passDelta = passPriority(candidate.pass) - passPriority(current.pass);
  if (passDelta !== 0) return passDelta > 0;

  const statusDelta = completedPriority(candidate.status) - completedPriority(current.status);
  if (statusDelta !== 0) return statusDelta > 0;

  const timeDelta = primaryTimestamp(candidate) - primaryTimestamp(current);
  if (timeDelta !== 0) return timeDelta > 0;

  return candidate.id > current.id;
}

export function selectCanonicalViolationReviewRuns<T extends ViolationReviewRunCandidate>(runs: T[]): T[] {
  const selectedByArtifact = new Map<number, T>();

  for (const run of runs) {
    const current = selectedByArtifact.get(run.reportArtifactId);
    if (!current || isPreferredReviewRun(run, current)) {
      selectedByArtifact.set(run.reportArtifactId, run);
    }
  }

  return [...selectedByArtifact.values()].sort((left, right) => {
    const timeDelta = primaryTimestamp(right) - primaryTimestamp(left);
    if (timeDelta !== 0) return timeDelta;
    return right.id - left.id;
  });
}

