import React, { useState } from "react";
import { format } from "../helpers/dateUtils";
import { 
  CheckCircle2, 
  AlertTriangle, 
  PlusCircle, 
  Calendar, 
  Info, 
  ChevronDown, 
  ChevronUp 
} from "lucide-react";
import { 
  METRO2_VERSION_HISTORY, 
  getVersionFeatures, 
  Metro2VersionInfo as VersionInfoType 
} from "../helpers/metro2VersionMatrix";
import { Badge } from "./Badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow, 
  TableContainer 
} from "./Table";
import * as Collapsible from "@radix-ui/react-collapsible";
import styles from "./Metro2VersionInfo.module.css";

interface Props {
  version?: string;
  className?: string;
}

export const Metro2VersionInfo: React.FC<Props> = ({ version, className }) => {
  if (version) {
    const info = getVersionFeatures(version);
    if (!info) {
      return (
        <div className={`${styles.container} ${styles.notFound} ${className || ""}`}>
          <AlertTriangle className={styles.icon} />
          <p>Version {version} not found in matrix.</p>
        </div>
      );
    }
    return <SingleVersionView info={info} className={className} />;
  }

  return <ComparisonTableView className={className} />;
};

const SingleVersionView: React.FC<{ info: VersionInfoType; className?: string }> = ({ 
  info, 
  className 
}) => {
  return (
    <div className={`${styles.card} ${className || ""}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.versionTitle}>Metro 2 Format {info.version}</h3>
          <Badge 
            variant={
              info.status === "current" ? "success" : 
              info.status === "deprecated" ? "error" : "warning"
            }
          >
            {info.status.toUpperCase()}
          </Badge>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <Calendar size={14} />
            Released: {format(info.releaseDate, "MMMM d, yyyy")}
          </span>
        </div>
        <p className={styles.description}>{info.description}</p>
      </div>

      <div className={styles.sections}>
        <Section 
          title="Major Changes" 
          icon={<Info size={16} />}
          items={info.majorChanges}
          emptyText="No major structural changes recorded."
          itemIcon={<CheckCircle2 size={14} className={styles.checkIcon} />}
        />

        <Section 
          title="New Fields" 
          icon={<PlusCircle size={16} />}
          items={info.newFields}
          emptyText="No new fields introduced."
          renderItem={(item) => <Badge variant="info" className={styles.fieldBadge}>{item}</Badge>}
          isFlex
        />

        <Section 
          title="Deprecated Fields" 
          icon={<AlertTriangle size={16} />}
          items={info.deprecatedFields}
          emptyText="No fields deprecated in this version."
          renderItem={(item) => <Badge variant="error" className={styles.fieldBadge}>{item}</Badge>}
          isFlex
        />
      </div>
    </div>
  );
};

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: string[];
  emptyText: string;
  itemIcon?: React.ReactNode;
  renderItem?: (item: string) => React.ReactNode;
  isFlex?: boolean;
}> = ({ title, icon, items, emptyText, itemIcon, renderItem, isFlex }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen} className={styles.section}>
      <Collapsible.Trigger className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          {icon}
          <span>{title}</span>
          <span className={styles.count}>({items.length})</span>
        </div>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </Collapsible.Trigger>
      
      <Collapsible.Content className={styles.sectionContent}>
        {items.length === 0 ? (
          <p className={styles.emptyText}>{emptyText}</p>
        ) : (
          <div className={isFlex ? styles.flexList : styles.list}>
            {items.map((item, idx) => (
              <div key={idx} className={isFlex ? "" : styles.listItem}>
                {renderItem ? renderItem(item) : (
                  <>
                    {itemIcon}
                    <span>{item}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

const ComparisonTableView: React.FC<{ className?: string }> = ({ className }) => {
  // Sort by date descending
  const sortedHistory = [...METRO2_VERSION_HISTORY].sort((a, b) => 
    b.releaseDate.getTime() - a.releaseDate.getTime()
  );

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <h3 className={styles.tableTitle}>Metro 2 Version Compatibility Matrix</h3>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Release Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Key Features</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHistory.map((v) => (
              <TableRow key={v.version}>
                <TableCell className={styles.versionCell}>{v.version}</TableCell>
                <TableCell>{format(v.releaseDate, "MMM yyyy")}</TableCell>
                <TableCell>
                  <Badge 
                    variant={
                      v.status === "current" ? "success" : 
                      v.status === "deprecated" ? "error" : "default"
                    }
                  >
                    {v.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className={styles.featureList}>
                    {v.majorChanges.slice(0, 2).map((change, i) => (
                      <div key={i} className={styles.featureItem}>• {change}</div>
                    ))}
                    {v.majorChanges.length > 2 && (
                      <span className={styles.moreFeatures}>+{v.majorChanges.length - 2} more</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};