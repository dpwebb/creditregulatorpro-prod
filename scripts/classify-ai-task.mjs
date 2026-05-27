#!/usr/bin/env node

const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const task = args.filter((arg) => arg !== "--self-test").join(" ").trim();

const TIERS = {
  1: {
    name: "LOW RISK",
    setting: "Medium/Fast",
    validation: "documentation review; lint/typecheck if code touched",
    approvalGate: "commit allowed after validation",
  },
  2: {
    name: "MEDIUM RISK",
    setting: "High",
    validation: "lint, typecheck, and relevant changed-area tests",
    approvalGate: "summarize behavior impact before commit",
  },
  3: {
    name: "HIGH RISK",
    setting: "Extra High",
    validation: "lint, typecheck, relevant tests, regression validation",
    approvalGate: "human review required before production push",
  },
  4: {
    name: "CRITICAL / ARCHITECTURE",
    setting: "ChatGPT architecture review first; Codex Extra High only after approved plan",
    validation: "approved staged plan, full relevant validation, release gates as applicable",
    approvalGate: "explicit approval required before coding and before production push",
  },
};

const RULES = [
  {
    tier: 4,
    reason: "architecture or redesign request",
    patterns: [
      /\barchitect(?:ure|ural)?\b/i,
      /\bredesign\b/i,
      /\bre-?architect\b/i,
      /\breplace(?:ment)?\b/i,
      /\brewrite\b/i,
      /\blarge\b.*\brefactor\b/i,
      /\bcross[- ]cutting\b/i,
      /\bmicroservice/i,
      /\bkubernetes\b/i,
      /\bdestructive\b/i,
      /\bdrop\s+(?:table|column|database)\b/i,
      /\bschema\b.*\b(redesign|replacement|rewrite|architecture)\b/i,
      /\bauth\b.*\b(architecture|redesign|rewrite|replacement)\b/i,
      /\bdeployment\b.*\b(architecture|redesign|rewrite|replacement)\b/i,
      /\brule engine\b.*\b(redesign|rewrite|replacement|architecture)\b/i,
      /\bcompliance rule engine\b.*\b(redesign|rewrite|replacement)\b/i,
      /\bparser\b.*\b(architecture|redesign|rewrite|replacement)\b/i,
    ],
  },
  {
    tier: 3,
    reason: "high-risk CRP protected workflow",
    patterns: [
      /\bingest(?:ion)?\b/i,
      /\bparser\b|\bparsing\b|\bparse\b/i,
      /\bcredit report\b/i,
      /\bocr\b/i,
      /\bcanonical\b/i,
      /\btradeline\b/i,
      /\bbureau\b|\bbureaus\b/i,
      /\bcreditor\b|\bcreditors\b/i,
      /\bcollector\b|\bcollectors\b|\bcollection\b/i,
      /\bcompliance\b/i,
      /\bcompliance scanner\b|\bscanner\b/i,
      /\bviolation\b/i,
      /\bevidence(?:\s+(?:location|link|binding|ledger))?\b/i,
      /\bdispute\b/i,
      /\bpacket\b/i,
      /\bpdf\b/i,
      /\breadiness\b/i,
      /\bdatabase\s+(?:write|writes|mutation|mutations)\b/i,
      /\bmigration\b|\bschema\b/i,
      /\bauth\b|\bauthentication\b|\bauthorization\b|\bsession\b/i,
      /\badmin\s+access\b|\badmin\s+permission\b|\badmin\s+role\b/i,
      /\buser\s+(?:delete|deletion|reset|purge|remove|removal)\b/i,
      /\b(?:delete|deletion|reset|purge|remove|removal)\s+user\b/i,
      /\bpayment\b|\bbilling\b|\bstripe\b/i,
      /\bproduction\b|\bdeploy(?:ment)?\b|\bstaging\b/i,
    ],
  },
  {
    tier: 2,
    reason: "bounded implementation or normal feature work",
    patterns: [
      /\bcomponent\b/i,
      /\bapi\b|\bendpoint\b/i,
      /\bhelper\b|\bservice\b/i,
      /\btest\b|\bspec\b/i,
      /\badmin\s+(?:page|ui|screen|dashboard|panel)\b/i,
      /\bform\b|\bquery\b|\bvalidation\b/i,
      /\bbutton\b|\bmodal\b|\bdialog\b|\btable\b/i,
      /\bstate\b|\bhook\b/i,
    ],
  },
  {
    tier: 1,
    reason: "small non-behavioral change",
    patterns: [
      /\bcopy\b|\bwording\b|\btext\b|\blabel\b/i,
      /\bcomment\b|\bcomments\b/i,
      /\bdocumentation\b|\bdocs?\b|\breadme\b/i,
      /\bstyle\b|\bstyling\b|\bcss\b|\blayout\b|\bspacing\b/i,
      /\bunused\s+lint\b|\blint\s+disable\b/i,
      /\btypo\b|\bgrammar\b/i,
    ],
  },
];

function usage() {
  console.error('Usage: node scripts/classify-ai-task.mjs "<task description>"');
}

function matchedRules(description) {
  return RULES.flatMap((rule) => {
    const matches = rule.patterns
      .filter((pattern) => pattern.test(description))
      .map((pattern) => pattern.source);
    if (matches.length === 0) return [];
    return [{ ...rule, matches }];
  });
}

function classify(description) {
  const matches = matchedRules(description);
  if (matches.length === 0) {
    return {
      tier: 2,
      matchedReasons: ["default bounded implementation risk when no low-risk marker is present"],
      matchedPatterns: [],
    };
  }

  const tier = Math.max(...matches.map((match) => match.tier));
  return {
    tier,
    matchedReasons: matches
      .filter((match) => match.tier === tier)
      .map((match) => match.reason),
    matchedPatterns: matches
      .filter((match) => match.tier === tier)
      .flatMap((match) => match.matches),
  };
}

function filesLikelyAffected(tier, description) {
  const lower = description.toLowerCase();
  const files = new Set();

  if (/\bdocs?\b|\bdocumentation\b|\breadme\b/.test(lower)) files.add("docs/");
  if (/\bcopy\b|\btext\b|\blabel\b|\bstyle\b|\bcss\b|\bcomponent\b|\bui\b|\bpage\b/.test(lower)) {
    files.add("components/");
    files.add("pages/");
  }
  if (/\bapi\b|\bendpoint\b|\bauth\b|\badmin\b/.test(lower)) files.add("endpoints/");
  if (/\bhelper\b|\bparser\b|\bingest\b|\bcompliance\b|\bviolation\b|\bevidence\b|\bpacket\b|\breadiness\b|\bdispute\b|\bbureau\b|\bcreditor\b|\bcollector\b|\btradeline\b/.test(lower)) {
    files.add("helpers/");
  }
  if (/\bmigration\b|\bschema\b|\bdatabase\b/.test(lower)) files.add("migrations/");
  if (/\btest\b|\bspec\b|\bvalidation\b|\bregression\b/.test(lower) || tier >= 2) files.add("tests/");
  if (/\bdeploy\b|\bproduction\b|\bstaging\b|\bscript\b/.test(lower)) {
    files.add("scripts/");
    files.add(".github/workflows/");
  }

  if (files.size === 0) files.add(tier === 1 ? "docs/ or isolated source file" : "inspect relevant files first");
  return Array.from(files).join(", ");
}

function assertClassification(description, expectedTier) {
  const actual = classify(description).tier;
  if (actual !== expectedTier) {
    throw new Error(`Expected Tier ${expectedTier} for "${description}", got Tier ${actual}`);
  }
}

function runSelfTest() {
  const cases = [
    ["minor copy update", 1],
    ["normal UI component edit with tests", 2],
    ["fix parser findings not rendering", 3],
    ["adjust ingestion replay", 3],
    ["repair OCR fallback", 3],
    ["fix canonical tradeline mapping", 3],
    ["update violation detection", 3],
    ["repair evidence location links", 3],
    ["fix packet readiness", 3],
    ["dispute packet creation bug", 3],
    ["delete user endpoint hardening", 3],
    ["reset user admin flow", 3],
    ["auth session regression", 3],
    ["admin access role boundary", 3],
    ["migration gate update", 3],
    ["production deployment check", 3],
    ["compliance scanner false positive", 3],
    ["bureau parser mismatch", 3],
    ["creditor matching rule", 3],
    ["collector account display", 3],
    ["schema redesign", 4],
    ["architecture rewrite", 4],
    ["rule engine redesign", 4],
    ["parser replacement", 4],
    ["destructive migration", 4],
    ["auth architecture", 4],
    ["large refactor", 4],
    ["cross-cutting refactor", 4],
  ];

  for (const [description, expectedTier] of cases) {
    assertClassification(description, expectedTier);
  }

  console.log(`AI task risk classifier self-test passed (${cases.length} cases).`);
}

if (selfTest) {
  runSelfTest();
  process.exit(0);
}

if (!task) {
  usage();
  process.exit(1);
}

const result = classify(task);
const tier = TIERS[result.tier];
const reason = result.matchedReasons.join("; ");

console.log("AI TASK RISK ROUTING");
console.log(`Tier: ${result.tier}`);
console.log(`Tier name: ${tier.name}`);
console.log(`Recommended Codex setting: ${tier.setting}`);
console.log(`Reason: ${reason}`);
console.log(`Required validation: ${tier.validation}`);
console.log(`Approval gate: ${tier.approvalGate}`);
console.log(`Files likely affected: ${filesLikelyAffected(result.tier, task)}`);
if (result.tier >= 3) {
  console.log("Scope rule: do not broaden scope; preserve existing behavior unless explicitly scoped.");
}
if (result.tier === 4) {
  console.log("Plan rule: do not code immediately; produce an implementation plan first.");
}
if (result.matchedPatterns.length > 0) {
  console.log(`Matched rules: ${result.matchedPatterns.join(", ")}`);
}
