import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { Selectable } from "kysely";
import { LetterTemplate, LetterTemplateCategory } from "../helpers/schema";
import {
  useLetterTemplates,
  useUpsertLetterTemplate,
  useSeedLetterTemplates,
} from "../helpers/useLetterTemplates";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Tabs, TabsList, TabsTrigger } from "../components/Tabs";
import { Badge } from "../components/Badge";
import { Switch } from "../components/Switch";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import {
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
} from "lucide-react";

import styles from "./admin-letter-templates.module.css";

const TemplateEditor = ({
  template,
  onCancel,
}: {
  template: Selectable<LetterTemplate>;
  onCancel: () => void;
}) => {
  const [formData, setFormData] = useState<Partial<Selectable<LetterTemplate>>>(
    template
  );
  const upsertMutation = useUpsertLetterTemplate();
  const [useFullBody, setUseFullBody] = useState(!!template.fullBodyOverride);

  const handleSave = () => {
    upsertMutation.mutate(
      {
        id: template.id,
        category: template.category,
        templateKey: template.templateKey,
        label: template.label,
        isActive: formData.isActive ?? true,
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
      },
      {
        onSuccess: () => {
          onCancel();
        },
      }
    );
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

  const isViolationNarrative = template.category === "violation_narrative";

  return (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <div className={styles.editorTitle}>Editing: {template.label}</div>
        <div className={styles.editorToggles}>
          <div className={styles.toggleGroup}>
            <label htmlFor={`active-${template.id}`}>Active</label>
            <Switch
              id={`active-${template.id}`}
              checked={formData.isActive ?? true}
              onCheckedChange={(c) =>
                setFormData((prev) => ({ ...prev, isActive: c }))
              }
            />
          </div>
          <div className={styles.toggleGroup}>
            <label htmlFor={`fullbody-${template.id}`}>
              Full Body Override
            </label>
            <Switch
              id={`fullbody-${template.id}`}
              checked={useFullBody}
              onCheckedChange={(c) => setUseFullBody(c)}
            />
          </div>
        </div>
      </div>

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
                  onChange={(e) =>
                    handleChange("statutoryGrounds", e.target.value)
                  }
                  placeholder="Enter statutory grounds override..."
                  rows={4}
                />
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label>Requested Action</label>
              <Textarea
                value={formData.requestedAction || ""}
                onChange={(e) =>
                  handleChange("requestedAction", e.target.value)
                }
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
                    onChange={(e) =>
                      handleChange("statutoryTimeframe", e.target.value)
                    }
                    placeholder="Enter statutory timeframe override..."
                    rows={2}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Consumer Statement Right</label>
                  <Textarea
                    value={formData.consumerStatementRight || ""}
                    onChange={(e) =>
                      handleChange("consumerStatementRight", e.target.value)
                    }
                    placeholder="Enter consumer statement right override..."
                    rows={2}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Certification</label>
                  <Textarea
                    value={formData.certification || ""}
                    onChange={(e) =>
                      handleChange("certification", e.target.value)
                    }
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
                onChange={(e) =>
                  handleChange("statutoryReference", e.target.value)
                }
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
      </div>

      <div className={styles.editorActions}>
        <Button variant="outline" onClick={handleReset} type="button">
          <RotateCcw size={16} />
          Reset to Defaults
        </Button>
        <div className={styles.actionGroup}>
          <Button variant="ghost" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={upsertMutation.isPending}
            type="button"
          >
            {upsertMutation.isPending ? "Saving..." : "Save Template"}
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
          {template.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="default">Inactive</Badge>
          )}
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
        subtitle="Manage text blocks and overrides for different letter types."
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
          <TabsTrigger value="violation_narrative">
            Violation Narrative
          </TabsTrigger>
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
                  onToggle={() =>
                    setExpandedId((prev) =>
                      prev === template.id ? null : template.id
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}