import React from "react";
import { format } from "../helpers/dateUtils";
import { Download, Upload } from "lucide-react";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { FileDropzone } from "./FileDropzone";
import styles from "./ParserTestImportExportTab.module.css";

interface ParserTestImportExportTabProps {
  testCases: any[];
  selectedForExport: number[];
  importFile: File | null;
  importPreview: any;
  onToggleExportSelection: (id: number) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onExport: () => void;
  onImportFileSelect: (files: File[]) => void;
  onImportClear: () => void;
  onImport: () => void;
}

export function ParserTestImportExportTab({
  testCases,
  selectedForExport,
  importFile,
  importPreview,
  onToggleExportSelection,
  onToggleSelectAll,
  onExport,
  onImportFileSelect,
  onImportClear,
  onImport
}: ParserTestImportExportTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className={styles.card}>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Download size={20} /> Export Test Cases
        </h3>
        <p className="text-muted-foreground mb-4">
          Select test cases to export as a JSON file.
        </p>

        <div className={styles.exportList}>
          <div className="flex items-center gap-2 mb-2 pb-2 border-b">
            <Checkbox
              checked={selectedForExport.length === testCases.length && testCases.length > 0}
              onChange={(e) => onToggleSelectAll(e.target.checked)}
            />
            <span className="font-medium">Select All</span>
          </div>
          {testCases.map(tc => (
            <div key={tc.id} className="flex items-center gap-2 py-1">
              <Checkbox
                checked={selectedForExport.includes(tc.id)}
                onChange={() => onToggleExportSelection(tc.id)}
              />
              <span>{tc.name}</span>
            </div>
          ))}
        </div>

        <Button onClick={onExport} className="mt-4 w-full">
          Export Selected ({selectedForExport.length})
        </Button>
      </div>

      <div className={styles.card}>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Upload size={20} /> Import Test Cases
        </h3>
        <p className="text-muted-foreground mb-4">
          Upload a previously exported JSON file.
        </p>

        {!importFile ? (
          <FileDropzone
            accept=".json"
            onFilesSelected={onImportFileSelect}
            title="Upload JSON File"
          />
        ) : (
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <span className="font-medium">{importFile.name}</span>
              <Button variant="ghost" size="sm" onClick={onImportClear}>
                Change
              </Button>
            </div>

            {importPreview && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Found {importPreview.testCases?.length || 0} test cases to import.
                </p>
              </div>
            )}

            <Button onClick={onImport} className="w-full" disabled={!importPreview}>
              Import Test Cases
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}