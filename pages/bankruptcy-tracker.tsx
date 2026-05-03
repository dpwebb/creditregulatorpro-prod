import { useState, useMemo } from "react";
import { Helmet } from "react-helmet";
import { useBankruptcyList } from "../helpers/bankruptcyQueries";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Plus, AlertCircle, CheckCircle2, Clock } from "lucide-react";

import { CreateBankruptcyDialog } from "../components/CreateBankruptcyDialog";
import { EditBankruptcyDialog } from "../components/EditBankruptcyDialog";
import { BankruptcyTable } from "../components/BankruptcyTable";
import { BankruptcyRecordEnhanced } from "../helpers/bankruptcyQueries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/Select";
import {
  BankruptcyStatusArrayValues,
  BankruptcyTypeArrayValues,
  CanadianProvinceArrayValues,
} from "../helpers/schema";
import { getProvinceLabel, getBankruptcyTypeLabel } from "../helpers/bankruptcyRules";
import { Skeleton } from "../components/Skeleton";
import styles from "./bankruptcy-tracker.module.css";

export default function BankruptcyTrackerPage() {
  
  const { data, isFetching, error } = useBankruptcyList();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BankruptcyRecordEnhanced | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [provinceFilter, setProvinceFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredData = useMemo(() => {
    if (!data?.records) return [];

    return data.records.filter((record) => {
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (provinceFilter !== "all" && record.province !== provinceFilter) return false;
      if (typeFilter !== "all" && record.bankruptcyType !== typeFilter) return false;
      return true;
    });
  }, [data, statusFilter, provinceFilter, typeFilter]);

  const stats = useMemo(() => {
    if (!data?.records) return { total: 0, active: 0, pendingRemoval: 0 };
    return {
      total: data.records.length,
      active: data.records.filter((r) => r.status === "ACTIVE").length,
      pendingRemoval: data.records.filter((r) => r.status === "PENDING_REMOVAL").length,
    };
  }, [data]);

  if (error) {
    return (
      <div className={styles.error}>
        Error loading bankruptcy records. Please try again.
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Bankruptcy Tracker | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Bankruptcy Info"
        subtitle="Track your bankruptcy records and when they can be removed."
        
      >
        <Button
          onClick={() => setIsCreateOpen(true)}
          className={styles.createButton}
        >
          <Plus size={16} /> Add Record
        </Button>
      </PageHeader>

      <div className={styles.content}>
        {/* Stats Cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} data-type="total">
              <Clock size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Records</span>
              {isFetching ? (
                <Skeleton className={styles.statSkeleton} />
              ) : (
                <span className={styles.statValue}>{stats.total}</span>
              )}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon} data-type="active">
              <AlertCircle size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Active</span>
              {isFetching ? (
                <Skeleton className={styles.statSkeleton} />
              ) : (
                <span className={styles.statValue}>{stats.active}</span>
              )}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon} data-type="pending">
              <CheckCircle2 size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Ready to Remove</span>
              {isFetching ? (
                <Skeleton className={styles.statSkeleton} />
              ) : (
                <span className={styles.statValue}>{stats.pendingRemoval}</span>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className={styles.filterSelect}>
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {BankruptcyStatusArrayValues.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={provinceFilter} onValueChange={setProvinceFilter}>
              <SelectTrigger className={styles.filterSelect}>
                <SelectValue placeholder="Filter by Province" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Provinces</SelectItem>
                {CanadianProvinceArrayValues.map((prov) => (
                  <SelectItem key={prov} value={prov}>
                    {getProvinceLabel(prov)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className={styles.filterSelect}>
                <SelectValue placeholder="Filter by Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {BankruptcyTypeArrayValues.map((type) => (
                  <SelectItem key={type} value={type}>
                    {getBankruptcyTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            variant="ghost" 
            onClick={() => {
              setStatusFilter("all");
              setProvinceFilter("all");
              setTypeFilter("all");
            }}
            disabled={statusFilter === "all" && provinceFilter === "all" && typeFilter === "all"}
          >
            Reset Filters
          </Button>
        </div>

        <BankruptcyTable
          data={filteredData}
          isLoading={isFetching}
          onEdit={(record) => setEditingRecord(record)}
        />
      </div>

      <CreateBankruptcyDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {editingRecord && (
        <EditBankruptcyDialog
          open={!!editingRecord}
          onOpenChange={(open) => !open && setEditingRecord(null)}
          record={editingRecord}
        />
      )}
    </>
  );
}