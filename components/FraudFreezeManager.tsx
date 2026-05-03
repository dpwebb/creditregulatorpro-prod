import { useState, useMemo } from "react";
import { useFreezeList, useCancelFreeze, useUpdateFreeze } from "../helpers/freezeQueries";
import { FreezeWithDetails } from "../endpoints/fraud-freeze/list_GET.schema";
import { FreezeStatus, FreezeType } from "../helpers/schema";
import { format } from "../helpers/dateUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "./Table";
import { Button } from "./Button";
import { Input } from "./Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./DropdownMenu";
import { Skeleton } from "./Skeleton";
import { FreezeStatusBadge, FreezeTypeBadge } from "./FreezeStatusBadge";
import { ThawRequestDialog } from "./ThawRequestDialog";
import { CreateFreezeDialog } from "./CreateFreezeDialog";
import { MoreHorizontal, Search, Plus, ShieldAlert, ShieldCheck, Lock, Clock } from "lucide-react";
import { toast } from "sonner";
import styles from "./FraudFreezeManager.module.css";

interface FraudFreezeManagerProps {
  userId?: number;
}

export const FraudFreezeManager = ({ userId }: FraudFreezeManagerProps) => {
  const { data, isLoading, error } = useFreezeList({ userId });
  const cancelFreezeMutation = useCancelFreeze();
  const updateFreezeMutation = useUpdateFreeze();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  const [thawDialogOpen, setThawDialogOpen] = useState(false);
  const [selectedFreeze, setSelectedFreeze] = useState<FreezeWithDetails | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const freezes = data?.freezes || [];

  const filteredFreezes = useMemo(() => {
    return freezes.filter((freeze) => {
      const matchesSearch = freeze.bureauName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || freeze.status === statusFilter;
      const matchesType = typeFilter === "all" || freeze.freezeType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [freezes, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    return {
      active: freezes.filter(f => f.status === "active").length,
      requested: freezes.filter(f => f.status === "requested").length,
      thawed: freezes.filter(f => f.status === "thawed").length,
      expired: freezes.filter(f => f.status === "expired").length,
    };
  }, [freezes]);

  const handleThawRequest = (freeze: FreezeWithDetails) => {
    setSelectedFreeze(freeze);
    setThawDialogOpen(true);
  };

  const handleCancel = (freeze: FreezeWithDetails) => {
    if (confirm("Are you sure you want to remove this protection?")) {
      cancelFreezeMutation.mutate(
        { freezeId: freeze.id },
        {
          onSuccess: () => toast.success("Protection removed"),
          onError: (err) => toast.error(`Failed to cancel: ${err.message}`),
        }
      );
    }
  };

  const handleExtend = (freeze: FreezeWithDetails) => {
    // For fraud alerts, extending usually means creating a new one or updating the date.
    // We'll use the update endpoint to refresh the effective date.
    updateFreezeMutation.mutate(
      {
        freezeId: freeze.id,
        status: "active",
        effectiveDate: new Date(), // Reset effective date to now
        notes: "Extended by user",
      },
      {
        onSuccess: () => toast.success("Alert renewed"),
        onError: (err) => toast.error(`Failed to extend: ${err.message}`),
      }
    );
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton className={styles.skeletonRow} />
        <Skeleton className={styles.skeletonRow} />
        <Skeleton className={styles.skeletonRow} />
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Error loading freezes: {error.message}</div>;
  }

  return (
    <div className={styles.container}>
      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} data-type="active"><ShieldCheck size={20} /></div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Active Protection</span>
            <span className={styles.statValue}>{stats.active}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} data-type="requested"><Clock size={20} /></div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Waiting</span>
            <span className={styles.statValue}>{stats.requested}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} data-type="thawed"><Lock size={20} /></div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Temporarily Unfrozen</span>
            <span className={styles.statValue}>{stats.thawed}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} data-type="expired"><ShieldAlert size={20} /></div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Expired</span>
            <span className={styles.statValue}>{stats.expired}</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} size={16} />
            <Input
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={styles.filterSelect}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="requested">Requested</SelectItem>
              <SelectItem value="thawed">Thawed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className={styles.filterSelect}>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="fraud_alert">Fraud Alert</SelectItem>
              <SelectItem value="extended_fraud_alert">Extended Alert</SelectItem>
              <SelectItem value="security_freeze">Security Freeze</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus size={16} /> Add Protection
        </Button>
      </div>

      {/* Table */}
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bureau</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Expires / Thaws</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFreezes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className={styles.emptyState}>
                  <div className={styles.emptyContent}>
                    <ShieldAlert size={32} className={styles.emptyIcon} />
                    <p>No protections found. Try different filters.</p>
                    <Button variant="link" onClick={() => setCreateDialogOpen(true)}>
                      Set up your first protection
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredFreezes.map((freeze) => (
                <TableRow key={freeze.id}>
                  <TableCell className="font-medium">{freeze.bureauName}</TableCell>
                  <TableCell>
                    <FreezeTypeBadge type={freeze.freezeType} />
                  </TableCell>
                  <TableCell>
                    <FreezeStatusBadge status={freeze.status} />
                  </TableCell>
                  <TableCell>
                    {format(new Date(freeze.requestDate), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    {freeze.effectiveDate ? format(new Date(freeze.effectiveDate), "MMM d, yyyy") : "-"}
                  </TableCell>
                  <TableCell>
                    {freeze.status === "thawed" && freeze.thawDate ? (
                      <span className={styles.thawDate}>
                        Resumes {format(new Date(freeze.thawDate), "MMM d")}
                      </span>
                    ) : freeze.expirationDate ? (
                      format(new Date(freeze.expirationDate), "MMM d, yyyy")
                    ) : (
                      <span className="text-muted-foreground">Indefinite</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        
                        {freeze.freezeType === "security_freeze" && freeze.status === "active" && (
                          <DropdownMenuItem onClick={() => handleThawRequest(freeze)}>
                            <Lock size={14} className="mr-2" /> Unfreeze Temporarily
                          </DropdownMenuItem>
                        )}
                        
                        {freeze.status === "expired" && (
                          <DropdownMenuItem onClick={() => handleExtend(freeze)}>
                            <Clock size={14} className="mr-2" /> Renew This Alert
                          </DropdownMenuItem>
                        )}

                        {(freeze.status === "active" || freeze.status === "requested") && (
                          <DropdownMenuItem 
                            onClick={() => handleCancel(freeze)}
                            className="text-destructive focus:text-destructive"
                          >
                            <ShieldAlert size={14} className="mr-2" /> Remove Protection
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <CreateFreezeDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />
      
      <ThawRequestDialog 
        freeze={selectedFreeze} 
        open={thawDialogOpen} 
        onOpenChange={setThawDialogOpen} 
      />
    </div>
  );
};