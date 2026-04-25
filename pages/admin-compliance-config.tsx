import React, { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import {
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { Switch } from "../components/Switch";
import { Slider } from "../components/Slider";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import {
  useComplianceConfigs,
  useUpdateComplianceConfigs,
} from "../helpers/useComplianceConfig";
import {
  useSystemSettings,
  useUpdateSystemSettings,
} from "../helpers/useSystemSettings";
import { usePostalRevenue } from "../helpers/usePostalRevenue";
import {
  ComplianceConfig,
  ViolationCategory,
  ViolationCategoryArrayValues,
} from "../helpers/schema";
import * as Collapsible from "@radix-ui/react-collapsible";
import styles from "./admin-compliance-config.module.css";

// Helper to get user-friendly labels for violation categories
const getCategoryLabel = (category: ViolationCategory): string => {
  return category
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

// Helper to get description for violation categories
const getCategoryDescription = (category: ViolationCategory): string => {
  switch (category) {
    case "ACCOUNT_STATUS_INCONSISTENCY":
      return "Detects conflicting account statuses across bureaus or over time.";
    case "BALANCE_CALCULATION_VIOLATION":
      return "Identifies errors in balance calculations or history.";
    case "BANKRUPTCY_DISCHARGE_VIOLATION":
      return "Flags accounts not properly updated after bankruptcy discharge.";
    case "CREDIT_LIMIT_MANIPULATION":
      return "Detects suspicious changes to credit limits.";
    case "CROSS_BUREAU_INCONSISTENCY":
      return "Finds discrepancies for the same account across different bureaus.";
    case "CROSS_ENTITY_DISCREPANCY":
      return "Identifies mismatches between creditor and bureau data.";
    case "DOCUMENTATION_CHAIN_FAILURE":
      return "Flags missing or incomplete documentation trails.";
    case "FURNISHER_RESPONSE_QUALITY":
      return "Evaluates the quality and completeness of creditor responses.";
    case "IDENTITY_THEFT_VIOLATION":
      return "Detects potential identity theft indicators or mishandling.";
    case "MULTIPLE_COLLECTOR_VIOLATION":
      return "Flags multiple collectors reporting the same debt simultaneously.";
    case "PAYMENT_HISTORY_MANIPULATION":
      return "Identifies suspicious alterations to payment history strings.";
    case "PROCEDURAL_TIMING_VIOLATION":
      return "Detects violations of statutory timing requirements.";
    case "STATUTE_OF_LIMITATIONS":
      return "Flags reporting of debts past the statute of limitations.";
    case "TEMPORAL_MANIPULATION":
      return "Identifies manipulation of dates (DOFD, DOLA) to re-age debt.";
    default:
      return "General compliance violation detector.";
  }
};

// Type for local state management
type ConfigState = {
  [key in ViolationCategory]: {
    enabled: boolean;
    confidenceThreshold: number;
    userExplanationTemplate: string;
    recommendedActionTemplate: string;
    isDirty: boolean;
  };
};

export default function AdminComplianceConfigPage() {
  const { data: serverConfigs, isLoading, refetch } = useComplianceConfigs();
  const updateMutation = useUpdateComplianceConfigs();

  const { data: systemSettings, isLoading: isLoadingSettings, refetch: refetchSettings } = useSystemSettings();
  const updateSettingsMutation = useUpdateSystemSettings();

  const { data: revenueData, isLoading: isLoadingRevenue } = usePostalRevenue();

  const [localConfigs, setLocalConfigs] = useState<ConfigState | null>(null);
  const [activeTab, setActiveTab] = useState("thresholds");

  const [baseCost, setBaseCost] = useState("4.99");
  const [surchargePct, setSurchargePct] = useState("10");
  const [firstClassBaseCost, setFirstClassBaseCost] = useState("2.90");
  const [pricingDirty, setPricingDirty] = useState(false);

  const [productionMode, setProductionMode] = useState(false);
  const [productionModeDirty, setProductionModeDirty] = useState(false);

  // Initialize local state from server data
  useEffect(() => {
    if (serverConfigs) {
      const initialState: ConfigState = {} as ConfigState;

      // Initialize all categories, even if not in DB yet (use defaults)
      ViolationCategoryArrayValues.forEach((category) => {
        const existing = serverConfigs.find(
          (c) => c.violationCategory === category
        );
        initialState[category] = {
          enabled: existing?.enabled ?? true,
          confidenceThreshold: existing?.confidenceThreshold ?? 50,
          userExplanationTemplate: existing?.userExplanationTemplate ?? "",
          recommendedActionTemplate: existing?.recommendedActionTemplate ?? "",
          isDirty: false,
        };
      });

      setLocalConfigs(initialState);
    }
  }, [serverConfigs]);

  useEffect(() => {
    if (systemSettings) {
      const bc = systemSettings.find(s => s.key === "postgrid_base_cost")?.value ?? "4.99";
      const sr = systemSettings.find(s => s.key === "postgrid_surcharge_rate")?.value ?? "0.10";
      const fc = systemSettings.find(s => s.key === "postgrid_first_class_base_cost")?.value ?? "2.90";
      setBaseCost(bc);
      setSurchargePct((parseFloat(sr) * 100).toString());
      setFirstClassBaseCost(fc);
      setPricingDirty(false);

      const pm = systemSettings.find(s => s.key === "production_mode")?.value === "true";
      setProductionMode(pm);
      setProductionModeDirty(false);
    }
  }, [systemSettings]);

  const hasUnsavedChanges = useMemo(() => {
    if (!localConfigs) return false;
    return Object.values(localConfigs).some((config) => config.isDirty);
  }, [localConfigs]);

  const handleThresholdChange = (
    category: ViolationCategory,
    value: number[]
  ) => {
    if (!localConfigs) return;
    setLocalConfigs((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [category]: {
          ...prev[category],
          confidenceThreshold: value[0],
          isDirty: true,
        },
      };
    });
  };

  const handleToggleChange = (category: ViolationCategory, checked: boolean) => {
    if (!localConfigs) return;
    setLocalConfigs((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [category]: {
          ...prev[category],
          enabled: checked,
          isDirty: true,
        },
      };
    });
  };

  const handleTemplateChange = (
    category: ViolationCategory,
    field: "userExplanationTemplate" | "recommendedActionTemplate",
    value: string
  ) => {
    if (!localConfigs) return;
    setLocalConfigs((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [category]: {
          ...prev[category],
          [field]: value,
          isDirty: true,
        },
      };
    });
  };

  const handleSave = async () => {
    if (!localConfigs) return;

    const dirtyConfigs = Object.entries(localConfigs).filter(([, config]) => config.isDirty);
    
    if (dirtyConfigs.length === 0) {
      toast.info("No changes to save.");
      return;
    }

    const configsToSave = dirtyConfigs.map(
      ([category, config]) => ({
        violationCategory: category as ViolationCategory,
        enabled: config.enabled,
        confidenceThreshold: config.confidenceThreshold,
        userExplanationTemplate: config.userExplanationTemplate || null,
        recommendedActionTemplate: config.recommendedActionTemplate || null,
      })
    );

    try {
      await updateMutation.mutateAsync({ configs: configsToSave });
      // Refetch is handled by the mutation hook invalidation, but we need to reset dirty state
      // We can just wait for the new data to come in via the useEffect, but to be smoother:
      setLocalConfigs((prev) => {
        if (!prev) return null;
        const cleanState = { ...prev };
        Object.keys(cleanState).forEach((key) => {
          cleanState[key as ViolationCategory].isDirty = false;
        });
        return cleanState;
      });
    } catch (error) {
      // Error handling is done in the mutation hook
    }
  };

  const handlePricingSave = async () => {
    try {
      await updateSettingsMutation.mutateAsync({
        settings: [
          { key: "postgrid_base_cost", value: baseCost },
          { key: "postgrid_surcharge_rate", value: (parseFloat(surchargePct) / 100).toString() },
          { key: "postgrid_first_class_base_cost", value: firstClassBaseCost }
        ]
      });
      setPricingDirty(false);
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleProductionModeSave = async () => {
    try {
      await updateSettingsMutation.mutateAsync({
        settings: [
          { key: "production_mode", value: productionMode ? "true" : "false" }
        ]
      });
      setProductionModeDirty(false);
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleReset = () => {
    if (
      window.confirm(
        "Are you sure you want to discard all unsaved changes and reset to the last saved configuration?"
      )
    ) {
      refetch(); // This will trigger the useEffect to re-initialize local state
      refetchSettings();
    }
  };

  const parsedBase = parseFloat(baseCost) || 0;
  const parsedRatePct = parseFloat(surchargePct) || 0;
  const computedTotal = parsedBase + (parsedBase * (parsedRatePct / 100));

  const parsedFirstClassBase = parseFloat(firstClassBaseCost) || 0;
  const computedFirstClassTotal = parsedFirstClassBase * 1.15;

  if (isLoading || isLoadingSettings || !localConfigs) {
    return (
      <div className={styles.container}>
        <div className={styles.headerSkeleton}>
          <Skeleton style={{ width: "300px", height: "40px" }} />
          <Skeleton style={{ width: "500px", height: "20px" }} />
        </div>
        <div className={styles.gridSkeleton}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className={styles.cardSkeleton} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Compliance Configuration | Credit Regulator Pro Admin</title>
      </Helmet>

      <PageHeader
        title="Compliance Detection Configuration"
        subtitle="Configure detection thresholds and customize alert messaging for all violation categories"
        
      >
        <div className={styles.actions}>
          {hasUnsavedChanges && (
            <span className={styles.unsavedIndicator}>
              <AlertTriangle size={16} />
              Unsaved Changes
            </span>
          )}
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw size={16} />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              "Saving..."
            ) : (
              <>
                <Save size={16} />
                Save All Changes
              </>
            )}
          </Button>
        </div>
      </PageHeader>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className={styles.tabs}
      >
        <TabsList>
          <TabsTrigger value="thresholds">Detection Thresholds</TabsTrigger>
          <TabsTrigger value="messaging">Alert Messaging</TabsTrigger>
          <TabsTrigger value="pricing">Postal Pricing</TabsTrigger>
          <TabsTrigger value="app_settings">App Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className={styles.tabContent}>
          <div className={styles.grid}>
            {ViolationCategoryArrayValues.map((category) => {
              const config = localConfigs[category];
              return (
                <div
                  key={category}
                  className={`${styles.card} ${!config.enabled ? styles.cardDisabled : ""} ${config.isDirty ? styles.cardDirty : ""}`}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>
                      {getCategoryLabel(category)}
                    </h3>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(checked) =>
                        handleToggleChange(category, checked)
                      }
                    />
                  </div>
                  <p className={styles.cardDescription}>
                    {getCategoryDescription(category)}
                  </p>

                  <div className={styles.sliderContainer}>
                    <div className={styles.sliderLabel}>
                      <span>Confidence Threshold</span>
                      <span className={styles.sliderValue}>
                        {config.confidenceThreshold}%
                      </span>
                    </div>
                    <Slider
                      value={[config.confidenceThreshold]}
                      min={0}
                      max={100}
                      step={1}
                      disabled={!config.enabled}
                      onValueChange={(val) =>
                        handleThresholdChange(category, val)
                      }
                    />
                    <div className={styles.sliderMeta}>
                      <span>Lenient (0%)</span>
                      <span>Strict (100%)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="messaging" className={styles.tabContent}>
          <div className={styles.messagingList}>
            <div className={styles.infoBox}>
              <Info size={18} className={styles.infoIcon} />
              <p>
                Customize the explanations and recommended actions shown to users
                when a violation is detected. You can use variables like{" "}
                <code>{"{{accountNumber}}"}</code>,{" "}
                <code>{"{{creditorName}}"}</code>, <code>{"{{dateDrift}}"}</code>{" "}
                to insert dynamic data.
              </p>
            </div>

            {ViolationCategoryArrayValues.map((category) => {
              const config = localConfigs[category];
              return (
                <Collapsible.Root
                  key={category}
                  className={`${styles.accordionItem} ${config.isDirty ? styles.accordionItemDirty : ""}`}
                >
                  <Collapsible.Trigger className={styles.accordionTrigger}>
                    <div className={styles.accordionHeader}>
                      <span className={styles.accordionTitle}>
                        {getCategoryLabel(category)}
                      </span>
                      {config.isDirty && (
                        <span className={styles.dirtyBadge}>Modified</span>
                      )}
                    </div>
                    <ChevronDown className={styles.accordionChevron} />
                  </Collapsible.Trigger>
                  <Collapsible.Content className={styles.accordionContent}>
                    <div className={styles.accordionBody}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          User Explanation Template
                        </label>
                        <Textarea
                          value={config.userExplanationTemplate}
                          onChange={(e) =>
                            handleTemplateChange(
                              category,
                              "userExplanationTemplate",
                              e.target.value
                            )
                          }
                          placeholder="Explain why this is a violation..."
                          rows={3}
                        />
                        <p className={styles.fieldHelp}>
                          Shown to the user to explain the nature of the
                          detected issue.
                        </p>
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          Recommended Action Template
                        </label>
                        <Textarea
                          value={config.recommendedActionTemplate}
                          onChange={(e) =>
                            handleTemplateChange(
                              category,
                              "recommendedActionTemplate",
                              e.target.value
                            )
                          }
                          placeholder="Suggest what the user should do..."
                          rows={3}
                        />
                        <p className={styles.fieldHelp}>
                          Actionable advice for the user to resolve or challenge
                          this violation.
                        </p>
                      </div>
                    </div>
                  </Collapsible.Content>
                </Collapsible.Root>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="pricing" className={styles.tabContent}>
          <div className={styles.messagingList}>
            <div className={styles.infoBox}>
              <Info size={18} className={styles.infoIcon} />
              <p>
                These values determine the amount charged to users when sending packets via PostGrid registered or first class mail.
              </p>
            </div>
            
            <div className={`${styles.card} ${pricingDirty ? styles.cardDirty : ""}`}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Registered Mail Pricing</h3>
              </div>
              <p className={styles.cardDescription}>
                Configure the base cost and surcharge percentage applied to postal transactions.
              </p>

              <div className={styles.pricingGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Base Cost (CAD)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={baseCost} 
                    onChange={e => { setBaseCost(e.target.value); setPricingDirty(true); }} 
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Surcharge Rate (%)</label>
                  <Input 
                    type="number" 
                    step="1" 
                    value={surchargePct} 
                    onChange={e => { setSurchargePct(e.target.value); setPricingDirty(true); }} 
                  />
                </div>
              </div>

              <div className={styles.totalCostContainer}>
                <span className={styles.totalCostLabel}>Computed Total Cost:</span>
                <span className={styles.totalCostValue}>${computedTotal.toFixed(2)} CAD</span>
              </div>
            </div>

            <div className={`${styles.card} ${pricingDirty ? styles.cardDirty : ""}`}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>First Class Mail Pricing</h3>
              </div>
              <p className={styles.cardDescription}>
                Configure the base cost for first class mail. A 15% markup is automatically applied. Users will be charged the marked-up price.
              </p>

              <div className={styles.pricingGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>PostGrid Base Cost (CAD)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={firstClassBaseCost} 
                    onChange={e => { setFirstClassBaseCost(e.target.value); setPricingDirty(true); }} 
                  />
                </div>
              </div>

              <div className={styles.totalCostContainer}>
                <span className={styles.totalCostLabel}>Users will be charged:</span>
                <span className={styles.totalCostValue}>
                  ${computedFirstClassTotal.toFixed(2)} CAD <span style={{fontSize: "0.875rem", fontWeight: "normal", color: "var(--muted-foreground)"}}>(15% markup applied)</span>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--spacing-2)' }}>
              <Button 
                onClick={handlePricingSave} 
                disabled={!pricingDirty || updateSettingsMutation.isPending}
              >
                {updateSettingsMutation.isPending ? "Saving..." : "Save Pricing"}
              </Button>
            </div>

            <div className={styles.sectionHeader}>
              Revenue Summary
              <Badge variant="info">Read-only</Badge>
            </div>
            
            {isLoadingRevenue ? (
              <div className={styles.statGrid}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className={styles.statCard} style={{ height: "100px" }} />
                ))}
              </div>
            ) : revenueData ? (
              <>
                <div className={styles.statGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Total Markup Revenue</span>
                    <span className={styles.statValue}>${revenueData.totals.totalMarkup.toFixed(2)} CAD</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Total PostGrid Costs</span>
                    <span className={styles.statValue}>${revenueData.totals.totalPostGridCost.toFixed(2)} CAD</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Total Charged to Users</span>
                    <span className={styles.statValue}>${revenueData.totals.totalRevenue.toFixed(2)} CAD</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Transactions</span>
                    <span className={styles.statValue}>{revenueData.totals.transactionCount}</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Refunds</span>
                    <span className={styles.statValue}>${revenueData.totals.refundTotal.toFixed(2)} CAD</span>
                    <span className={styles.statSubValue}>{revenueData.totals.refundCount} refunded</span>
                  </div>
                </div>

                <h4 className={styles.cardTitle} style={{ marginTop: 'var(--spacing-6)', marginBottom: 'var(--spacing-4)' }}>Breakdown by Mail Type</h4>
                <div className={styles.statGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                  <div className={styles.card}>
                    <div className={styles.cardHeader}>
                      <h5 className={styles.cardTitle}>First Class</h5>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Count</span>
                        <span style={{ fontWeight: 500 }}>{revenueData.byMailType.firstClass.count}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Revenue</span>
                        <span style={{ fontWeight: 500 }}>${revenueData.byMailType.firstClass.revenue.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Cost</span>
                        <span style={{ fontWeight: 500 }}>${revenueData.byMailType.firstClass.cost.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Markup</span>
                        <span style={{ fontWeight: 500, color: 'var(--primary)' }}>${revenueData.byMailType.firstClass.markup.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.cardHeader}>
                      <h5 className={styles.cardTitle}>Registered</h5>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Count</span>
                        <span style={{ fontWeight: 500 }}>{revenueData.byMailType.registered.count}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Revenue</span>
                        <span style={{ fontWeight: 500 }}>${revenueData.byMailType.registered.revenue.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Cost</span>
                        <span style={{ fontWeight: 500 }}>${revenueData.byMailType.registered.cost.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className={styles.statLabel}>Markup</span>
                        <span style={{ fontWeight: 500, color: 'var(--primary)' }}>${revenueData.byMailType.registered.markup.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="app_settings" className={styles.tabContent}>
          <div className={styles.messagingList}>
            <div className={`${styles.card} ${productionModeDirty ? styles.cardDirty : ""}`}>
              <div className={styles.cardHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
                  <h3 className={styles.cardTitle}>Production Mode</h3>
                  {productionMode ? (
                    <Badge variant="success">Enabled</Badge>
                  ) : (
                    <Badge variant="default">Disabled</Badge>
                  )}
                </div>
                <Switch 
                  checked={productionMode} 
                  onCheckedChange={(checked) => { setProductionMode(checked); setProductionModeDirty(true); }} 
                />
              </div>
              <p className={styles.cardDescription}>
                When enabled, users can purchase paid subscription plans via Stripe.
              </p>

              {productionMode && (
                <div className={styles.infoBox} style={{ marginTop: "var(--spacing-4)", backgroundColor: "color-mix(in srgb, var(--warning) 10%, var(--background))", borderColor: "color-mix(in srgb, var(--warning) 30%, transparent)" }}>
                  <AlertTriangle size={18} className={styles.infoIcon} style={{ color: "var(--warning)" }} />
                  <p>Production mode is active. Users can upgrade to paid plans.</p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--spacing-4)' }}>
                <Button 
                  onClick={handleProductionModeSave} 
                  disabled={!productionModeDirty || updateSettingsMutation.isPending}
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save App Settings"}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}