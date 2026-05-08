export type TradelineArtifactLink = {
  tradelineId: number;
  reportArtifactId: number;
};

type LinkInput = {
  tradelineId: number | string | null | undefined;
  reportArtifactId: number | string | null | undefined;
};

type ViolationInput = {
  tradelineId: number | string | null | undefined;
  technicalDetails?: unknown;
};

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function technicalDetailsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getViolationArtifactScopeIds(violation: { technicalDetails?: unknown }): number[] {
  const details = technicalDetailsRecord(violation.technicalDetails);
  if (!details) return [];

  const candidates = [
    details.sourceReportArtifactId,
    details.reportArtifactId,
    details.artifactId,
  ];
  const ids = candidates.flatMap((candidate) => {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => toFiniteNumber(item as any)).filter((id): id is number => id != null);
    }
    const id = toFiniteNumber(candidate as any);
    return id == null ? [] : [id];
  });

  return Array.from(new Set(ids));
}

export function violationBelongsToArtifact(
  violation: { technicalDetails?: unknown },
  reportArtifactId: number,
): boolean {
  const scopeIds = getViolationArtifactScopeIds(violation);
  return scopeIds.length === 0 || scopeIds.includes(reportArtifactId);
}

export function mergeTradelineArtifactLinks(
  presenceRows: LinkInput[],
  directRows: LinkInput[],
): TradelineArtifactLink[] {
  const links = new Map<string, TradelineArtifactLink>();
  const addLink = (row: LinkInput) => {
    const tradelineId = toFiniteNumber(row.tradelineId);
    const reportArtifactId = toFiniteNumber(row.reportArtifactId);
    if (tradelineId == null || reportArtifactId == null) return;

    links.set(`${reportArtifactId}:${tradelineId}`, {
      tradelineId,
      reportArtifactId,
    });
  };

  for (const row of presenceRows) addLink(row);
  for (const row of directRows) addLink(row);

  return Array.from(links.values());
}

export function listTradelineIdsFromArtifactLinks(
  links: TradelineArtifactLink[],
  reportArtifactId: number,
): number[] {
  return Array.from(
    new Set(
      links
        .filter((link) => link.reportArtifactId === reportArtifactId)
        .map((link) => link.tradelineId),
    ),
  );
}

export function countTradelinesByArtifact(links: TradelineArtifactLink[]): Map<string, number> {
  const tradelinesByArtifact = new Map<string, Set<string>>();

  for (const link of links) {
    const artifactKey = String(link.reportArtifactId);
    const tradelineKey = String(link.tradelineId);
    const artifactTradelines = tradelinesByArtifact.get(artifactKey) ?? new Set<string>();
    artifactTradelines.add(tradelineKey);
    tradelinesByArtifact.set(artifactKey, artifactTradelines);
  }

  return new Map(
    Array.from(tradelinesByArtifact, ([artifactKey, tradelineIds]) => [
      artifactKey,
      tradelineIds.size,
    ]),
  );
}

export function countViolationsByArtifact(
  links: TradelineArtifactLink[],
  violations: ViolationInput[],
): Map<string, number> {
  const artifactIdsByTradelineId = new Map<string, Set<string>>();

  for (const link of links) {
    const tradelineKey = String(link.tradelineId);
    const artifactKey = String(link.reportArtifactId);
    const tradelineArtifacts = artifactIdsByTradelineId.get(tradelineKey) ?? new Set<string>();
    tradelineArtifacts.add(artifactKey);
    artifactIdsByTradelineId.set(tradelineKey, tradelineArtifacts);
  }

  const violationsByArtifact = new Map<string, number>();
  for (const violation of violations) {
    const tradelineId = toFiniteNumber(violation.tradelineId);
    if (tradelineId == null) continue;

    const scopedArtifactIds = getViolationArtifactScopeIds(violation);
    const artifactKeys = scopedArtifactIds.length > 0
      ? new Set(scopedArtifactIds.map((id) => String(id)))
      : artifactIdsByTradelineId.get(String(tradelineId));
    if (!artifactKeys) continue;

    for (const artifactKey of artifactKeys) {
      violationsByArtifact.set(artifactKey, (violationsByArtifact.get(artifactKey) ?? 0) + 1);
    }
  }

  return violationsByArtifact;
}
