import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./Chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "./Table";
import styles from "./SuccessMetricsListView.module.css";

interface SuccessMetricsListViewProps {
  data: any[];
  scope: 'vector' | 'creditor' | 'bureau' | 'violation';
  title: string;
}

export const SuccessMetricsListView: React.FC<SuccessMetricsListViewProps> = ({ data, scope, title }) => {
  const chartConfig = {
    successRate: {
      label: "Success Rate (%)",
      color: "var(--success)",
    },
    totalChallenges: {
      label: "Total Challenges",
      color: "var(--primary)",
    }
  };

  const xKey = scope === 'vector' ? 'vector' 
    : scope === 'creditor' ? 'creditorName'
    : scope === 'bureau' ? 'bureauName'
    : 'violationCategory';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
      </div>

      <div className={styles.chartSection}>
        <ChartContainer config={chartConfig} className={styles.chartContainer}>
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis 
              dataKey={xKey} 
              type="category" 
              width={120} 
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            />
            <ChartTooltip 
              content={<ChartTooltipContent formatter={(value) => [`${value}%`, "Success Rate"]} />} 
            />
            <Bar 
              dataKey="successRate" 
              fill="var(--color-successRate)" 
              radius={[0, 4, 4, 0]} 
              barSize={20}
              name="Success Rate"
            />
          </BarChart>
        </ChartContainer>
      </div>

      <TableContainer className={styles.tableContainer}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className={styles.alignRight}>Challenges</TableHead>
              <TableHead className={styles.alignRight}>Successes</TableHead>
              <TableHead className={styles.alignRight}>Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item: any, idx: number) => (
              <TableRow key={idx}>
                <TableCell className={styles.categoryCell}>{item[xKey]}</TableCell>
                <TableCell className={styles.alignRight}>{item.totalChallenges.toLocaleString()}</TableCell>
                <TableCell className={styles.alignRight}>{item.successCount.toLocaleString()}</TableCell>
                <TableCell className={styles.alignRight}>
                  <span className={
                    item.successRate > 50 ? styles.textSuccess : 
                    item.successRate > 20 ? styles.textWarning : styles.textError
                  }>
                    {item.successRate}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};