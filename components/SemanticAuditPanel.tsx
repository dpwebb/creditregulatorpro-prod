import { useState } from "react";
import { useSemanticAudit } from "../helpers/useSemanticAudit";
import { Button } from "./Button";
import { Input } from "./Input";
import { Spinner } from "./Spinner";
import { Badge } from "./Badge";
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "./Select";
import { Download } from "lucide-react";
import styles from "./SemanticAuditPanel.module.css";

export const SemanticAuditPanel = () => {
  const [userId, setUserId] = useState<string>("");
  const { mutate, isPending, data } = useSemanticAudit();
  const [selectedCategory, setSelectedCategory] = useState<string>("_all");

  const handleRunFull = () => mutate({});
  const handleRunUser = () => {
    const id = parseInt(userId, 10);
    if (!isNaN(id)) {
      mutate({ userId: id });
    }
  };

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "semantic-audit-report.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Typecasting assuming standard AuditReport shape with findings array
  const auditData = data as any;
  const findings: any[] = auditData?.findings || [];
  const categories = Array.from(new Set(findings.map(f => f.category))).filter(Boolean) as string[];

  const filteredFindings = selectedCategory === "_all" 
    ? findings 
    : findings.filter(f => f.category === selectedCategory);

  const renderValue = (val: unknown) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.controls}>
          <Button onClick={handleRunFull} disabled={isPending}>Run Full Audit</Button>
          <div className={styles.userAuditGroup}>
            <Input 
              type="number" 
              placeholder="User ID" 
              value={userId} 
              onChange={e => setUserId(e.target.value)} 
              disabled={isPending}
              className={styles.userIdInput}
            />
            <Button variant="secondary" onClick={handleRunUser} disabled={isPending || !userId}>
              Audit Specific User
            </Button>
          </div>
        </div>
        {data && (
          <Button variant="outline" onClick={handleExport}>
            <Download size={16} /> Export JSON
          </Button>
        )}
      </div>

      {isPending && (
        <div className={styles.loadingContainer}>
          <Spinner size="lg" />
          <p>Running semantic audit...</p>
        </div>
      )}

      {data && !isPending && (
        <>
          <div className={styles.summaryCards}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Total Checks</div>
              <div className={styles.cardValue}>{(auditData.passed || 0) + (auditData.failed || 0)}</div>
            </div>
            <div className={`${styles.card} ${styles.cardSuccess}`}>
              <div className={styles.cardTitle}>Passed</div>
              <div className={styles.cardValue}>{auditData.passed || 0}</div>
            </div>
            <div className={`${styles.card} ${styles.cardError}`}>
              <div className={styles.cardTitle}>Failed</div>
              <div className={styles.cardValue}>{auditData.failed || 0}</div>
            </div>
          </div>

          <div className={styles.tableSection}>
            <div className={styles.tableHeader}>
              <h3 className={styles.tableTitle}>Findings</h3>
              <div className={styles.filterContainer}>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="_all">All Categories</SelectItem>
                      {categories.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Category</th>
                    <th>Endpoint</th>
                    <th>Field</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Description</th>
                    <th>User ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFindings.map((finding, idx) => (
                    <tr key={idx}>
                      <td>
                        <Badge 
                          variant={
                            finding.severity?.toLowerCase() === 'error' ? 'error' : 
                            finding.severity?.toLowerCase() === 'warning' ? 'warning' : 'info'
                          }
                        >
                          {finding.severity || 'Info'}
                        </Badge>
                      </td>
                      <td>{finding.category || '-'}</td>
                      <td>{finding.endpoint || '-'}</td>
                      <td>{finding.field || '-'}</td>
                      <td className={styles.codeCell}>{renderValue(finding.expected)}</td>
                      <td className={styles.codeCell}>{renderValue(finding.actual)}</td>
                      <td>{finding.description || '-'}</td>
                      <td>{finding.userId || '-'}</td>
                    </tr>
                  ))}
                  {filteredFindings.length === 0 && (
                    <tr>
                      <td colSpan={8} className={styles.emptyCell}>No findings match the current filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
