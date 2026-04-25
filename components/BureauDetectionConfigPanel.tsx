import React, { useState } from "react";
import { Selectable } from "kysely";
import { ParserBureauDetectionConfig } from "../helpers/schema";
import {
  useBureauDetectionConfigs,
  useUpdateBureauDetectionConfig,
  useUpsertBureauDetectionConfig,
} from "../helpers/bureauDetectionConfigQueries";
import { useToast } from "../helpers/useToast";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import { Switch } from "./Switch";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import styles from "./BureauDetectionConfigPanel.module.css";

export const BureauDetectionConfigPanel = () => {
  const { data, isLoading } = useBureauDetectionConfigs();
  const updateMutation = useUpdateBureauDetectionConfig();
  const upsertMutation = useUpsertBureauDetectionConfig();
  const { showSuccess, showError } = useToast();

  const [newTuMarker, setNewTuMarker] = useState("");
  const [newTuWeight, setNewTuWeight] = useState("10");

  const [newEqMarker, setNewEqMarker] = useState("");
  const [newEqWeight, setNewEqWeight] = useState("10");

  const [testHtml, setTestHtml] = useState("");
  const [testResult, setTestResult] = useState<{
    tu: number;
    eq: number;
    detected: string;
  } | null>(null);

  const handleToggle = async (id: number, currentActive: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, isActive: !currentActive });
      showSuccess("Marker updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleUpdateWeight = async (id: number, val: string) => {
    const weight = parseInt(val, 10);
    if (isNaN(weight)) return;
    try {
      await updateMutation.mutateAsync({ id, weight });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleAddMarker = async (bureau: string, marker: string, weightStr: string) => {
    const weight = parseInt(weightStr, 10);
    if (!marker.trim() || isNaN(weight)) {
      showError("Please provide a valid marker and weight.");
      return;
    }
    
    try {
      await upsertMutation.mutateAsync({
        bureau,
        marker: marker.trim(),
        weight,
        isActive: true,
      });
      showSuccess("Marker added");
      if (bureau === "TransUnion") {
        setNewTuMarker("");
        setNewTuWeight("10");
      } else {
        setNewEqMarker("");
        setNewEqWeight("10");
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add marker");
    }
  };

  const handleTestDetection = () => {
    if (!testHtml.trim() || !data?.markers) return;

    let tuScore = 0;
    let eqScore = 0;

    data.markers.forEach((m) => {
      if (m.isActive && testHtml.includes(m.marker)) {
        if (m.bureau === "TransUnion") tuScore += m.weight;
        if (m.bureau === "Equifax") eqScore += m.weight;
      }
    });

    let detected = "Unknown";
    if (tuScore > eqScore && tuScore > 0) detected = "TransUnion";
    if (eqScore > tuScore && eqScore > 0) detected = "Equifax";

    setTestResult({ tu: tuScore, eq: eqScore, detected });
  };

  const renderTable = (bureau: string, markers: Selectable<ParserBureauDetectionConfig>[]) => (
    <div className={styles.bureauSection}>
      <h3 className={styles.bureauTitle}>{bureau} Markers</h3>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marker String</TableHead>
              <TableHead className={styles.weightHead}>Weight</TableHead>
              <TableHead className={styles.switchHead}>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {markers.map((m) => (
              <TableRow key={m.id}>
                <TableCell className={styles.monoCell}>{m.marker}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={m.weight}
                    className={styles.weightInput}
                    onBlur={(e) => handleUpdateWeight(m.id, e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={m.isActive}
                    onCheckedChange={() => handleToggle(m.id, m.isActive)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {/* Add new row */}
            <TableRow className={styles.addRow}>
              <TableCell>
                <Input
                  placeholder="New exact HTML string marker..."
                  value={bureau === "TransUnion" ? newTuMarker : newEqMarker}
                  onChange={(e) =>
                    bureau === "TransUnion"
                      ? setNewTuMarker(e.target.value)
                      : setNewEqMarker(e.target.value)
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className={styles.weightInput}
                  value={bureau === "TransUnion" ? newTuWeight : newEqWeight}
                  onChange={(e) =>
                    bureau === "TransUnion"
                      ? setNewTuWeight(e.target.value)
                      : setNewEqWeight(e.target.value)
                  }
                />
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  onClick={() =>
                    handleAddMarker(
                      bureau,
                      bureau === "TransUnion" ? newTuMarker : newEqMarker,
                      bureau === "TransUnion" ? newTuWeight : newEqWeight
                    )
                  }
                >
                  Add
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Skeleton style={{ height: "400px" }} />
      </div>
    );
  }

  const tuMarkers = data?.markers.filter((m) => m.bureau === "TransUnion") || [];
  const eqMarkers = data?.markers.filter((m) => m.bureau === "Equifax") || [];

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        <div className={styles.col}>
          {renderTable("TransUnion", tuMarkers)}
          {renderTable("Equifax", eqMarkers)}
        </div>

        <div className={styles.col}>
          <div className={styles.testSection}>
            <div className={styles.testHeader}>
              <h3 className={styles.bureauTitle}>Test Detection</h3>
              <Button onClick={handleTestDetection} disabled={!testHtml.trim()}>
                Evaluate HTML
              </Button>
            </div>
            <Textarea
              className={styles.testTextarea}
              placeholder="Paste raw HTML credit report to simulate routing logic..."
              value={testHtml}
              onChange={(e) => setTestHtml(e.target.value)}
            />

            {testResult && (
              <div className={styles.testResultCard}>
                <div className={styles.resultMain}>
                  <span className={styles.resultLabel}>Routed To:</span>
                  <Badge
                    variant={testResult.detected !== "Unknown" ? "primary" : "warning"}
                    className={styles.resultBadge}
                  >
                    {testResult.detected}
                  </Badge>
                </div>
                <div className={styles.scoreBars}>
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreLabel}>TransUnion Score</span>
                    <span className={styles.scoreValue}>{testResult.tu}</span>
                  </div>
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreLabel}>Equifax Score</span>
                    <span className={styles.scoreValue}>{testResult.eq}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};