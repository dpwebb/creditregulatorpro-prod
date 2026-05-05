import React from "react";
import { format } from "../helpers/dateUtils";
import { Play, Edit, Trash2, Search, XCircle, Clock } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Badge } from "./Badge";
import { Spinner } from "./Spinner";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableContainer } from "./Table";
import { ParserTestResultsPanel } from "./ParserTestResultsPanel";
import { ParserTestSavedOutputPanel } from "./ParserTestSavedOutputPanel";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./ParserTestCasesList.module.css";

interface ParserTestCasesListProps {
  testCases: any[];
  isLoading: boolean;
  runResults: Record<number, any>;
  onRun: (id: number) => void;
  onEdit: (testCase: any) => void;
  onDelete: (id: number) => void;
  onAcceptResults: (id: number) => void;
  onApproveField?: (testCaseId: number, fieldType: 'consumerInfo' | 'tradeline', id: string, value: any) => void;
  onAdjudicate?: (data: any) => Promise<void>;
  isAdjudicating?: boolean;
}

export function ParserTestCasesList({
  testCases,
  isLoading,
  runResults,
  onRun,
  onEdit,
  onDelete,
  onAcceptResults,
  onApproveField,
  onAdjudicate,
  isAdjudicating = false
}: ParserTestCasesListProps) {
  const [search, setSearch] = React.useState("");
  const [selectedTestCase, setSelectedTestCase] = React.useState<any>(null);
  const debouncedSearch = useDebounce(search, 300);

  const filteredTestCases = testCases.filter(tc =>
    tc.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const listPanel = (
    <div className={styles.listPanel}>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Search size={16} className={styles.searchIcon} />
            <Input
              placeholder="Search test cases..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        <TableContainer className={styles.tableContainer}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <Spinner />
                  </TableCell>
                </TableRow>
              ) : filteredTestCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No test cases found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTestCases.map(tc => (
                  <TableRow
                    key={tc.id}
                    className={selectedTestCase?.id === tc.id ? styles.selectedRow : ''}
                    onClick={() => setSelectedTestCase(tc)}
                  >
                    <TableCell>
                      <div className="font-medium">{tc.name}</div>
                      {tc.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {tc.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {runResults[tc.id]?.summary?.needsReview &&
                      runResults[tc.id]?.summary?.passed ? (
                        <Badge variant="warning">Review</Badge>
                      ) : (
                        <>
                          {tc.lastRunPassed === true && <Badge variant="success">Pass</Badge>}
                          {tc.lastRunPassed === false && <Badge variant="error">Fail</Badge>}
                          {tc.lastRunPassed === null && <Badge variant="default">New</Badge>}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tc.lastRunAt ? format(new Date(tc.lastRunAt), "MMM d, HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onRun(tc.id)}
                          title="Run Test"
                        >
                          <Play size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit(tc)}
                          title="Edit"
                        >
                          <Edit size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDelete(tc.id)}
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
    </div>
  );

  const detailPanel = selectedTestCase ? (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <h3 className={styles.detailTitle}>{selectedTestCase.name}</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelectedTestCase(null)}>
            <XCircle size={14} /> Test Cases
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdit(selectedTestCase)}>
            <Edit size={14} /> Edit
          </Button>
          <Button size="sm" onClick={() => onRun(selectedTestCase.id)}>
            <Play size={14} /> Run
          </Button>
        </div>
      </div>

      <div className={styles.detailContent}>
        {runResults[selectedTestCase.id] ? (
          <ParserTestResultsPanel
            summary={{
              ...runResults[selectedTestCase.id].summary,
              actualConsumerInfo: runResults[selectedTestCase.id].actualConsumerInfo,
              actualTradelines: runResults[selectedTestCase.id].actualTradelines
            }}
            lastRunAt={new Date()}
            onAcceptResults={() => onAcceptResults(selectedTestCase.id)}
            onApproveField={(fieldType, id, value) => {
              onApproveField?.(selectedTestCase.id, fieldType, id, value);
            }}
          />
        ) : (
          <ParserTestSavedOutputPanel
            testCase={selectedTestCase}
            emptyIcon={<Clock size={48} className="text-muted-foreground mb-4" />}
            onAdjudicate={onAdjudicate}
            isAdjudicating={isAdjudicating}
          />
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={styles.layout}>
      {selectedTestCase ? detailPanel : listPanel}
    </div>
  );
}
