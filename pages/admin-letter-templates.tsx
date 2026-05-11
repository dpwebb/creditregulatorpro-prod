import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Selectable } from "kysely";
import { LetterTemplate, LetterTemplateCategory } from "../helpers/schema";
import {
  useLetterTemplateHistory,
  useLetterTemplates,
  useHumanizeLetterTemplate,
  useRollbackLetterTemplate,
  useSeedLetterTemplates,
  useUpsertLetterTemplate,
} from "../helpers/useLetterTemplates";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Tabs, TabsList, TabsTrigger } from "../components/Tabs";
import { Badge } from "../components/Badge";
import { Switch } from "../components/Switch";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import { AlertTriangle, ChevronDown, ChevronUp, Download, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import {
  buildTemplateSnapshot,
  renderTemplatePreview,
  validateTemplateSnapshot,
} from "../helpers/letterTemplateLifecycle";

import styles from "./admin-letter-templates.module.css";

const TemplateEditor = ({
  template,
  onCancel,
}: {
  template: Selectable<LetterTemplate>;
  onCancel: () => void;
}) => {
  const [formData, setFormData] = useState<Partial<Selectable<LetterTemplate>>>(template);
  const [useFullBody, setUseFullBody] = useState(!!template.fullBodyOverride);
  const upsertMutation = useUpsertLetterTemplate();
  const humanizeMutation = useHumanizeLetterTemplate();
  const rollbackMutation = useRollbackLetterTemplate();
  const { data: historyData, isLoading: historyLoading } = useLetterTemplateHistory(template.id);

  const isViolationNarrative = template.category === "violation_narrative";
  const workingSnapshot = useMemo(
    () =>
      buildTemplateSnapshot({
        id: template.id,
        category: template.category,
        templateKey: template.templateKey,
        label: template.label,
        isActive: true,
        subject: formData.subject ?? null,
        introduction: formData.introduction ?? null,
        statutoryGrounds: formData.statutoryGrounds ?? null,
        requestedAction: formData.requestedAction ?? null,
        statutoryTimeframe: formData.statutoryTimeframe ?? null,
        consumerStatementRight: formData.consumerStatementRight ?? null,
        certification: formData.certification ?? null,
        closing: formData.closing ?? null,
        fullBodyOverride: useFullBody ? formData.fullBodyOverride ?? null : null,
        statutoryReference: formData.statutoryReference ?? null,
        sourceUrl: formData.sourceUrl ?? null,
      }),
    [formData, template, useFullBody]
  );

  const publishValidation = useMemo(
    () => validateTemplateSnapshot(workingSnapshot, "PUBLISH"),
    [workingSnapshot]
  );
  const preview = useMemo(() => renderTemplatePreview(workingSnapshot), [workingSnapshot]);

  const canPublish =
    publishValidation.errors.length === 0 &&
    publishValidation.unknownPlaceholders.length === 0 &&
    preview.unresolvedPlaceholders.length === 0;

  const buildTemplatePayload = (mode: "DRAFT" | "PUBLISH") => ({
    id: template.id,
    category: template.category,
    templateKey: template.templateKey,
    label: template.label,
    mode,
    isActive: mode === "PUBLISH",
    subject: formData.subject || null,
    introduction: formData.introduction || null,
    statutoryGrounds: formData.statutoryGrounds || null,
    requestedAction: formData.requestedAction || null,
    statutoryTimeframe: formData.statutoryTimeframe || null,
    consumerStatementRight: formData.consumerStatementRight || null,
    certification: formData.certification || null,
    closing: formData.closing || null,
    fullBodyOverride: useFullBody ? formData.fullBodyOverride || null : null,
    statutoryReference: formData.statutoryReference || null,
    sourceUrl: formData.sourceUrl || null,
  });

  const handleSave = (mode: "DRAFT" | "PUBLISH") => {
    upsertMutation.mutate(
      buildTemplatePayload(mode),
      {
        onSuccess: () => {
          onCancel();
        },
      }
    );
  };

  const handleHumanize = () => {
    humanizeMutation.mutate(buildTemplatePayload("DRAFT"), {
      onSuccess: (result) => {
        const next = result.template;
        setFormData((prev) => ({
          ...prev,
          subject: next.subject,
          introduction: next.introduction,
          statutoryGrounds: next.statutoryGrounds,
          requestedAction: next.requestedAction,
          statutoryTimeframe: next.statutoryTimeframe,
          consumerStatementRight: next.consumerStatementRight,
          certification: next.certification,
          closing: next.closing,
          fullBodyOverride: next.fullBodyOverride,
          statutoryReference: next.statutoryReference,
          sourceUrl: next.sourceUrl,
        }));
        setUseFullBody(Boolean(next.fullBodyOverride));
      },
    });
  };

  const handleReset = () => {
    setFormData((prev) => ({
      ...prev,
      subject: null,
      introduction: null,
      statutoryGrounds: null,
      requestedAction: null,
      statutoryTimeframe: null,
      consumerStatementRight: null,
      certification: null,
      closing: null,
      fullBodyOverride: null,
      statutoryReference: null,
      sourceUrl: null,
    }));
    setUseFullBody(false);
  };

  const handleChange = (field: keyof Selectable<LetterTemplate>, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRollback = (auditLogId: number) => {
    if (!window.confirm("Rollback to this revision? This will overwrite the current template content.")) {
      return;
    }
    rollbackMutation.mutate(
      {
        templateId: template.id,
        auditLogId,
      },
      {
        onSuccess: () => {
          onCancel();
        },
      }
    );
  };

  return (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <div className={styles.editorTitle}>Editing: {template.label}</div>
        <div className={styles.editorToggles}>
          <Badge variant={template.isActive ? "success" : "default"}>
            {template.isActive ? "Published" : "Draft"}
          </Badge>
          <div className={styles.toggleGroup}>
            <label htmlFor={`fullbody-${template.id}`}>Full Body Override</label>
            <Switch id={`fullbody-${template.id}`} checked={useFullBody} onCheckedChange={(c) => setUseFullBody(c)} />
          </div>
        </div>
      </div>

      {(publishValidation.errors.length > 0 ||
        publishValidation.warnings.length > 0 ||
        preview.unresolvedPlaceholders.length > 0) && (
        <div className={styles.validationPanel}>
          <div className={styles.validationHeader}>
            <AlertTriangle size={16} />
            <span>Validation Checks</span>
          </div>
          {publishValidation.errors.map((err) => (
            <div key={err} className={styles.validationError}>
              {err}
            </div>
          ))}
          {publishValidation.warnings.map((warn) => (
            <div key={warn} className={styles.validationWarning}>
              {warn}
            </div>
          ))}
          {preview.unresolvedPlaceholders.length > 0 && (
            <div className={styles.validationError}>
              Unresolved preview placeholders: {preview.unresolvedPlaceholders.join(", ")}
            </div>
          )}
        </div>
      )}

      <div className={styles.editorBody}>
        <div className={styles.fieldGroup}>
          <label>Subject</label>
          <Textarea
            value={formData.subject || ""}
            onChange={(e) => handleChange("subject", e.target.value)}
            placeholder="Enter subject override..."
            rows={2}
          />
        </div>

        {useFullBody ? (
          <div className={styles.fieldGroup}>
            <label>Full Body Override</label>
            <Textarea
              value={formData.fullBodyOverride || ""}
              onChange={(e) => handleChange("fullBodyOverride", e.target.value)}
              placeholder="Enter full body text..."
              rows={10}
            />
          </div>
        ) : (
          <>
            <div className={styles.fieldGroup}>
              <label>Introduction</label>
              <Textarea
                value={formData.introduction || ""}
                onChange={(e) => handleChange("introduction", e.target.value)}
                placeholder="Enter introduction override..."
                rows={4}
              />
            </div>

            {!isViolationNarrative && (
              <div className={styles.fieldGroup}>
                <label>Statutory Grounds</label>
                <Textarea
                  value={formData.statutoryGrounds || ""}
                  onChange={(e) => handleChange("statutoryGrounds", e.target.value)}
                  placeholder="Enter statutory grounds override..."
                  rows={4}
                />
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label>Requested Action</label>
              <Textarea
                value={formData.requestedAction || ""}
                onChange={(e) => handleChange("requestedAction", e.target.value)}
                placeholder="Enter requested action override..."
                rows={4}
              />
            </div>

            {!isViolationNarrative && (
              <>
                <div className={styles.fieldGroup}>
                  <label>Statutory Timeframe</label>
                  <Textarea
                    value={formData.statutoryTimeframe || ""}
                    onChange={(e) => handleChange("statutoryTimeframe", e.target.value)}
                    placeholder="Enter statutory timeframe override..."
                    rows={2}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Consumer Statement Right</label>
                  <Textarea
                    value={formData.consumerStatementRight || ""}
                    onChange={(e) => handleChange("consumerStatementRight", e.target.value)}
                    placeholder="Enter consumer statement right override..."
                    rows={2}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Certification</label>
                  <Textarea
                    value={formData.certification || ""}
                    onChange={(e) => handleChange("certification", e.target.value)}
                    placeholder="Enter certification override..."
                    rows={2}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Closing</label>
                  <Textarea
                    value={formData.closing || ""}
                    onChange={(e) => handleChange("closing", e.target.value)}
                    placeholder="Enter closing override..."
                    rows={2}
                  />
                </div>
              </>
            )}
          </>
        )}

        {!isViolationNarrative && (
          <>
            <div className={styles.fieldGroup}>
              <label>Statutory Reference</label>
              <Textarea
                value={formData.statutoryReference || ""}
                onChange={(e) => handleChange("statutoryReference", e.target.value)}
                placeholder="Enter statutory reference override..."
                rows={2}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label>Source URL</label>
              <Textarea
                value={formData.sourceUrl || ""}
                onChange={(e) => handleChange("sourceUrl", e.target.value)}
                placeholder="Enter source URL..."
                rows={1}
              />
            </div>
          </>
        )}

        <div className={styles.fieldGroup}>
          <label>Preview (Sample Data)</label>
          <Textarea readOnly value={preview.previewText} rows={8} />
        </div>

        <div className={styles.fieldGroup}>
          <label>Revision History</label>
          <div className={styles.historyPanel}>
            {historyLoading ? (
              <Skeleton className={styles.historySkeleton} />
            ) : !historyData?.history || historyData.history.length === 0 ? (
              <div className={styles.historyEmpty}>No history entries yet.</div>
            ) : (
              historyData.history.map((entry) => (
                <div key={entry.auditLogId} className={styles.historyRow}>
                  <div className={styles.historyMeta}>
                    <Badge variant="info">{entry.mode || entry.actionType}</Badge>
                    <span>
                      {new Intl.DateTimeFormat("en-CA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric",
                      }).format(new Date(entry.timestamp))}
                    </span>
                    <span>
                      {entry.userDisplayName || entry.userEmail || "System"}
                    </span>
                  </div>
                  <div className={styles.historyFields}>
                    {entry.changedFields.length > 0
                      ? `Changed: ${entry.changedFields.join(", ")}`
                      : "No field diff recorded"}
                  </div>
                  {entry.after && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRollback(entry.auditLogId)}
                      disabled={rollbackMutation.isPending}
                    >
                      <Undo2 size={14} />
                      Rollback
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className={styles.editorActions}>
        <div className={styles.leftActions}>
          <Button variant="outline" onClick={handleReset} type="button">
            <RotateCcw size={16} />
            Reset Fields
          </Button>
          <Button
            variant="outline"
            onClick={handleHumanize}
            disabled={humanizeMutation.isPending}
            type="button"
          >
            <Sparkles size={16} />
            {humanizeMutation.isPending ? "Drafting..." : "AI Human Draft"}
          </Button>
        </div>
        <div className={styles.actionGroup}>
          <Button variant="ghost" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave("DRAFT")}
            disabled={upsertMutation.isPending}
            type="button"
          >
            Save Draft
          </Button>
          <Button
            onClick={() => handleSave("PUBLISH")}
            disabled={upsertMutation.isPending || !canPublish}
            type="button"
          >
            Publish Template
          </Button>
        </div>
      </div>
    </div>
  );
};

const TemplateRow = ({
  template,
  isExpanded,
  onToggle,
}: {
  template: Selectable<LetterTemplate>;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  const formattedDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(new Date(template.updatedAt));

  return (
    <div className={styles.rowWrapper}>
      <div className={styles.row} onClick={onToggle}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>{template.label}</span>
          <span className={styles.rowDate}>Last updated: {formattedDate}</span>
        </div>
        <div className={styles.rowStatus}>
          {template.isActive ? <Badge variant="success">Published</Badge> : <Badge variant="default">Draft</Badge>}
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>
      {isExpanded && <TemplateEditor template={template} onCancel={onToggle} />}
    </div>
  );
};

export default function AdminLetterTemplates() {
  const { data: templates, isLoading } = useLetterTemplates();
  const seedMutation = useSeedLetterTemplates();
  const [activeTab, setActiveTab] = useState<LetterTemplateCategory>("bureau");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleSeed = () => {
    seedMutation.mutate();
  };

  const filteredTemplates = templates?.filter((t) => t.category === activeTab) || [];

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Letter Templates | Credit Regulator Pro Admin</title>
      </Helmet>

      <PageHeader
        title="Letter Templates"
        subtitle="Manage template drafts, publish validated revisions, and rollback from revision history."
      >
        <Button onClick={handleSeed} disabled={seedMutation.isPending}>
          <Download size={16} />
          {seedMutation.isPending ? "Seeding..." : "Seed Defaults"}
        </Button>
      </PageHeader>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as LetterTemplateCategory);
          setExpandedId(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="bureau">Bureau</TabsTrigger>
          <TabsTrigger value="provincial">Provincial</TabsTrigger>
          <TabsTrigger value="violation_narrative">Violation Narrative</TabsTrigger>
        </TabsList>

        <div className={styles.tabContent}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <Skeleton className={styles.skeletonRow} />
              <Skeleton className={styles.skeletonRow} />
              <Skeleton className={styles.skeletonRow} />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className={styles.emptyState}>
              No templates found for this category. Click "Seed Defaults" to populate standard templates.
            </div>
          ) : (
            <div className={styles.list}>
              {filteredTemplates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  isExpanded={expandedId === template.id}
                  onToggle={() => setExpandedId((prev) => (prev === template.id ? null : template.id))}
                />
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
