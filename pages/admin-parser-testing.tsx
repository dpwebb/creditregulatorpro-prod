import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "../helpers/dateUtils";

import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { ParserTestCaseEditor } from "../components/ParserTestCaseEditor";
import { ParserTestCasesList } from "../components/ParserTestCasesList";
import { ParserTestRunAllTab } from "../components/ParserTestRunAllTab";
import { ParserTestImportExportTab } from "../components/ParserTestImportExportTab";

import {
  useParserKnownEntities,
  useCreateParserKnownEntity,
} from "../helpers/parserKnownEntityQueries";

import {
  useParserTestCases,
  useCreateParserTestCase,
  useUpdateParserTestCase,
  useDeleteParserTestCase,
  useRunParserTest,
  useRunAllParserTests,
  useExportParserTestCases,
  useImportParserTestCases
} from "../helpers/parserTestQueries";

import styles from "./admin-parser-testing.module.css";

export default function AdminParserTestingPage() {
  const [activeTab, setActiveTab] = useState("test-cases");

  // Queries
  const { data: testCasesData, isLoading: isLoadingList } = useParserTestCases();

  // Mutations
  const createMutation = useCreateParserTestCase();
  const updateMutation = useUpdateParserTestCase();
  const deleteMutation = useDeleteParserTestCase();
  const runMutation = useRunParserTest();
  const runAllMutation = useRunAllParserTests();
  const exportMutation = useExportParserTestCases();
  const importMutation = useImportParserTestCases();
  const createKnownEntityMutation = useCreateParserKnownEntity();

  // State
  const [selectedTestCase, setSelectedTestCase] = useState<any>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [runResults, setRunResults] = useState<Record<number, any>>({});
  // Track locally approved fields because the list query doesn't return full details
  const [approvedFields, setApprovedFields] = useState<Record<number, { consumerInfo: any; tradelines: any[] }>>({});
  const [runAllSummary, setRunAllSummary] = useState<any>(null);
  const [selectedForExport, setSelectedForExport] = useState<number[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);

  const testCases = testCasesData?.testCases || [];

  // Handlers
  const handleCreate = async (data: any) => {
    try {
      await createMutation.mutateAsync(data);
      toast.success("Test case created successfully");
      setIsEditorOpen(false);
    } catch (error) {
      toast.error("Failed to create test case");
    }
  };

  const handleUpdate = async (data: any) => {
    try {
      await updateMutation.mutateAsync(data);
      toast.success("Test case updated successfully");
      setIsEditorOpen(false);
      if (selectedTestCase?.id === data.id) {
        const updated = testCases.find(tc => tc.id === data.id);
        if (updated) setSelectedTestCase(updated);
      }
    } catch (error) {
      toast.error("Failed to update test case");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this test case?")) {
      try {
        await deleteMutation.mutateAsync({ id });
        toast.success("Test case deleted");
        if (selectedTestCase?.id === id) setSelectedTestCase(null);
      } catch (error) {
        toast.error("Failed to delete test case");
      }
    }
  };

  const handleRun = async (id: number) => {
    try {
      const result = await runMutation.mutateAsync({ testCaseId: id });
      setRunResults(prev => ({ ...prev, [id]: result }));
      toast.success(result.passed ? "Test Passed" : "Test Failed");
    } catch (error) {
      toast.error("Failed to run test");
    }
  };

  const handleAcceptResults = async (id: number) => {
    const results = runResults[id];
    if (!results) return;

    try {
      await updateMutation.mutateAsync({
        id,
        expectedConsumerInfo: results.actualConsumerInfo,
        expectedTradelines: results.actualTradelines
      });
      toast.success("Results accepted as expected values");
      setRunResults(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      toast.error("Failed to update expected values");
    }
  };

  const handleApproveField = async (
    testCaseId: number,
    fieldType: 'consumerInfo' | 'tradeline',
    id: string,
    expectation: any
  ) => {
    // Check if we need to add to known entities
    if (expectation.addToKnownEntities && expectation.value) {
      // Determine entity type based on field name
      // id is the field name for consumer info. For tradelines, we check the field being approved but currently id is accountNumber for tradelines.
      // However, the expectation object itself doesn't carry the field name.
      // In ParserTestResultsPanel, onApproveField is called with ("tradeline", accountNumber, expectation)
      // Wait, we need to know WHICH field inside the tradeline was approved if we want to support field-level approval in the future.
      // But currently, for tradelines, we are approving the whole object or just by account number.
      
      // Let's look at Consumer Info fields first where id is the field name
      let entityType: 'creditor_name' | 'status_code' | 'account_type' | 'province' | undefined;
      const fieldName = id.toLowerCase();
      
      if (fieldName.includes('creditorname')) entityType = 'creditor_name';
      else if (fieldName.includes('status')) entityType = 'status_code';
      else if (fieldName.includes('accounttype')) entityType = 'account_type';
      else if (fieldName.includes('province')) entityType = 'province';

      if (entityType) {
        try {
          await createKnownEntityMutation.mutateAsync({
            entityType,
            value: String(expectation.value),
            description: `Auto-added from parser test case #${testCaseId}`
          });
          toast.success(`Added "${expectation.value}" to known ${entityType} dictionary`);
        } catch (err) {
          console.error("Failed to add to dictionary", err);
          toast.error("Failed to add to dictionary, but proceeding with approval");
        }
      }
    }

    // Get existing approved fields from local state, or initialize
    const currentApproved = approvedFields[testCaseId] || { consumerInfo: {}, tradelines: [] };

    try {
      let nextConsumerInfo = { ...currentApproved.consumerInfo };
      let nextTradelines = [...currentApproved.tradelines];

      if (fieldType === 'consumerInfo') {
        // id is the field name, expectation is the FieldExpectation object
        nextConsumerInfo = {
          ...nextConsumerInfo,
          [id]: expectation
        };
      } else if (fieldType === 'tradeline') {
        // id is the account number.
        // expectation in this context might be a full tradeline object OR a single field expectation?
        // But for tradelines, the current UI logic (in ParserTestResultsPanel) passes the entire tradeline object as 'value' currently.
        // Wait, the new logic in ParserTestResultsPanel passes `actualTl` as value to `openApprovalDialog`.
        // Then `FieldApprovalDialog` returns a `FieldExpectation`.
        // BUT `FieldApprovalDialog` is designed for single FIELD approval.
        // For Tradelines, `ParserTestResultsPanel` passes `onApproveField('tradeline', accountNumber, actualTl)`.
        
        // However, if we look at `ParserTestResultsPanel` implementation:
        // It calls `openApprovalDialog("tradeline", tlResult.accountNumber, actualTl)`.
        // `actualTl` is the entire tradeline object.
        // `FieldApprovalDialog` treats `extractedValue` as the value to approve.
        
        // This is tricky because "Approve Tradeline" usually means "Approve this entire object as expectation".
        // But `FieldApprovalDialog` creates an expectation (exact/presence/etc.) for a single value.
        // If we are approving an entire tradeline, we probably want to treat it as "Exact Match" for the whole object structure?
        // Or do we want to approve specific fields inside the tradeline?
        
        // Given the `FieldApprovalDialog` supports "Exact", "Presence", "Format", "Numeric".
        // Applying "Numeric" to a whole object doesn't make sense.
        
        // If the user is clicking "Approve" on the tradeline header, they are likely approving the existence of this tradeline.
        // If they click approve on a specific field row inside the tradeline, they are approving that field.
        
        // In the split components:
        // `TradelineResultCard` has an approve button on the header.
        // `ResultRow` (used inside tradeline card) DOES NOT have an approve button passed to it currently in `TradelineResultCard`.
        
        // Let's look at `TradelineResultCard` in my new file:
        // It maps `result.fieldResults.map((fieldResult, idx) => (<ResultRow ... />))`.
        // It does NOT pass `onApprove` to `ResultRow`.
        
        // So currently we only support approving the ENTIRE tradeline from the header.
        // In this case, `expectation` coming from `FieldApprovalDialog` will be for the whole object.
        // Likely mode="exact" with value={fullTradelineObject}.
        // We should just use the value inside the expectation as the tradeline object.
        
        const tradelineValue = expectation.mode === 'exact' ? expectation.value : expectation;

        // If it's a FieldExpectation for a whole object, that's a bit weird but valid if the backend supports it.
        // Actually, for tradelines, we usually just store the array of expected tradeline objects.
        // We don't really support "Pattern match this tradeline object".
        // So for tradelines, we probably should just take the value if it's exact match.
        
        // If expectation.mode is NOT exact, we can't really apply it to a whole tradeline object easily with current backend structure.
        // Let's assume for tradelines, if we approve from header, we use the value.
        
        // However, looking at `ParserTestResultsPanel`:
        // `openApprovalDialog("tradeline", tlResult.accountNumber, actualTl)`
        // `actualTl` is the whole object.
        
        // If the user selects "Presence" for a tradeline, it means "Expect a tradeline with this account number to exist".
        // Our backend comparison logic `compareTradelines` matches by account number.
        // If we just save `{ accountNumber: "123" }` in expectedTradelines, that works as "Presence".
        
        // So:
        // If mode is exact, we save the full object.
        // If mode is presence, we save just the account number (minimally required to match).
        
        // The `ParserTestResultsPanel` passes `expectation` to `onApproveField`.
        
        const existingIndex = nextTradelines.findIndex((t: any) => t.accountNumber === id);
        
        let tradelineToSave = expectation.value; // For exact
        
        if (expectation.mode !== 'exact') {
             // For non-exact modes on the whole tradeline, we might just fallback to saving what we have
             // or handle 'presence' by just saving the ID.
             // But let's assume 'exact' is the primary use case for whole tradeline approval for now.
             // Or if value is present, use it.
             if (!tradelineToSave && expectation.mode === 'presence') {
                tradelineToSave = { accountNumber: id }; 
             }
        }
        
        // Fallback if something is missing
        if (!tradelineToSave && id) {
             tradelineToSave = { accountNumber: id };
        }

        if (existingIndex >= 0) {
          nextTradelines[existingIndex] = tradelineToSave;
        } else {
          nextTradelines.push(tradelineToSave);
        }
      }

      // We only send the updated part to the backend, but we need to maintain local state of what we've approved so far
      // The update endpoint merges partial JSON? The endpoint schema suggests it replaces the entire field if provided.
      // So we should send the accumulated structure.
      // However, we don't have the *original* expected values here (as list endpoint doesn't return them).
      // This logic assumes we are building up expectations from scratch or that the backend handles merge if we only send partial.
      // Looking at `updateParserTestCase`, it takes `expectedConsumerInfo` and `expectedTradelines` as optional.
      // If we are in a session where we are approving fields, we rely on local state accumulating them.
      
      await updateMutation.mutateAsync({
        id: testCaseId,
        expectedConsumerInfo: Object.keys(nextConsumerInfo).length > 0 ? nextConsumerInfo : undefined,
        expectedTradelines: nextTradelines.length > 0 ? nextTradelines : undefined
      });

      // Update local state on success
      setApprovedFields(prev => ({
        ...prev,
        [testCaseId]: {
          consumerInfo: nextConsumerInfo,
          tradelines: nextTradelines
        }
      }));

      toast.success(`Updated expected ${fieldType === 'consumerInfo' ? 'field' : 'tradeline'}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update expected value");
    }
  };

  const handleRunAll = async () => {
    try {
      const result = await runAllMutation.mutateAsync({});
      setRunAllSummary(result);
      toast.success(`Run complete: ${result.passed} passed, ${result.failed} failed`);
    } catch (error) {
      toast.error("Failed to run all tests");
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({
        testCaseIds: selectedForExport.length > 0 ? selectedForExport : undefined
      });

      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parser-test-cases-${format(new Date(), "yyyy-MM-dd")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Export successful");
    } catch (error) {
      toast.error("Export failed");
    }
  };

  const handleImportFileSelect = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      setImportFile(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          setImportPreview(json);
        } catch (err) {
          toast.error("Invalid JSON file");
          setImportPreview(null);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    if (!importPreview) return;
    try {
      const result = await importMutation.mutateAsync({ testCases: importPreview.testCases });
      toast.success(`Imported ${result.importedCount} test cases`);
      setImportFile(null);
      setImportPreview(null);
      setActiveTab("test-cases");
    } catch (error) {
      toast.error("Import failed");
    }
  };

  const toggleExportSelection = (id: number) => {
    setSelectedForExport(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedForExport(testCases.map(tc => tc.id));
    } else {
      setSelectedForExport([]);
    }
  };

  const handleViewFailure = (id: number) => {
    setActiveTab("test-cases");
    const tc = testCases.find(t => t.id === id);
    if (tc) setSelectedTestCase(tc);
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Parser Testing | Credit Regulator Pro Admin</title>
      </Helmet>

      <PageHeader
        title="Parser Testing Environment"
        subtitle="Manage and run regression tests for the credit report parser."
      >
        <Button onClick={() => { setSelectedTestCase(null); setIsEditorOpen(true); }}>
          <Plus size={16} /> New Test Case
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className={styles.tabs}>
        <TabsList>
          <TabsTrigger value="test-cases">Test Cases</TabsTrigger>
          <TabsTrigger value="run-all">Run All Tests</TabsTrigger>
          <TabsTrigger value="import-export">Import / Export</TabsTrigger>
        </TabsList>

        <TabsContent value="test-cases" className={styles.tabContent}>
          <ParserTestCasesList
            testCases={testCases}
            isLoading={isLoadingList}
            runResults={runResults}
            onRun={handleRun}
            onEdit={(tc) => { setSelectedTestCase(tc); setIsEditorOpen(true); }}
            onDelete={handleDelete}
            onAcceptResults={handleAcceptResults}
            onApproveField={handleApproveField}
          />
        </TabsContent>

        <TabsContent value="run-all" className={styles.tabContent}>
          <ParserTestRunAllTab
            runAllSummary={runAllSummary}
            isRunning={runAllMutation.isPending}
            onRunAll={handleRunAll}
            onViewFailure={handleViewFailure}
          />
        </TabsContent>

        <TabsContent value="import-export" className={styles.tabContent}>
          <ParserTestImportExportTab
            testCases={testCases}
            selectedForExport={selectedForExport}
            importFile={importFile}
            importPreview={importPreview}
            onToggleExportSelection={toggleExportSelection}
            onToggleSelectAll={handleToggleSelectAll}
            onExport={handleExport}
            onImportFileSelect={handleImportFileSelect}
            onImportClear={() => { setImportFile(null); setImportPreview(null); }}
            onImport={handleImport}
          />
        </TabsContent>
      </Tabs>

      <ParserTestCaseEditor
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        testCase={selectedTestCase}
        onSave={selectedTestCase ? handleUpdate : handleCreate}
      />
    </div>
  );
}