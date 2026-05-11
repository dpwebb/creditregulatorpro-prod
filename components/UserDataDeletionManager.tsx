import { useMemo, useState } from "react";
import { Database, Loader2, Trash2, UserX } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { useAuth } from "../helpers/useAuth";
import {
  useUserDataDeletion,
} from "../helpers/useUserDataDeletion";
import {
  ACCOUNT_DELETE_CONFIRM_PHRASE,
} from "../endpoints/user/delete-account_POST.schema";
import type { UserDataDeletionCategory } from "../helpers/userDataDeletionTypes";
import styles from "./UserDataDeletionManager.module.css";

function formatCount(count: number): string {
  return count === 1 ? "1 record" : `${count} records`;
}

export function UserDataDeletionManager() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  const {
    summary,
    isLoadingSummary,
    deleteUserData,
    isDeletingData,
    deleteUserAccount,
    isDeletingAccount,
  } = useUserDataDeletion();
  const [selectedCategories, setSelectedCategories] = useState<UserDataDeletionCategory[]>([]);
  const [confirmSelectedData, setConfirmSelectedData] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");

  const currentUser = authState.type === "authenticated" ? authState.user : null;
  const accountEmail = currentUser?.email ?? "";

  const selectedCount = useMemo(() => {
    if (!summary) return 0;
    const selected = new Set(selectedCategories);
    return summary.categories
      .filter((category) => selected.has(category.key))
      .reduce((total, category) => total + category.count, 0);
  }, [selectedCategories, summary]);

  if (currentUser && currentUser.role !== "user") {
    return null;
  }

  const toggleCategory = (category: UserDataDeletionCategory) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  };

  const handleDeleteSelected = async () => {
    await deleteUserData({
      categories: selectedCategories,
      confirm: true,
    });
    setSelectedCategories([]);
    setConfirmSelectedData(false);
  };

  const handleDeleteAccount = async () => {
    if (!accountDeleteEnabled) return;

    await deleteUserAccount({
      confirmEmail,
      confirmPhrase: ACCOUNT_DELETE_CONFIRM_PHRASE,
    });
    navigate("/login", { replace: true });
  };

  const accountDeleteEnabled =
    confirmEmail.trim().toLowerCase() === accountEmail.trim().toLowerCase() &&
    confirmPhrase === ACCOUNT_DELETE_CONFIRM_PHRASE &&
    !isDeletingAccount;

  return (
    <section className={styles.container} aria-labelledby="data-deletion-title">
      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <Database size={22} />
        </div>
        <div>
          <h3 id="data-deletion-title" className={styles.title}>
            Data deletion
          </h3>
          <p className={styles.subtitle}>
            Remove selected account data or permanently delete your consumer account.
          </p>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h4 className={styles.panelTitle}>Delete selected data</h4>
            <p className={styles.panelSubtitle}>
              {summary ? formatCount(summary.totalCount) : "Checking saved records"}
            </p>
          </div>
        </div>

        {isLoadingSummary ? (
          <div className={styles.loadingList}>
            <Skeleton className={styles.skeletonRow} />
            <Skeleton className={styles.skeletonRow} />
            <Skeleton className={styles.skeletonRow} />
          </div>
        ) : (
          <div className={styles.categoryList}>
            {summary?.categories.map((category) => (
              <label key={category.key} className={styles.categoryRow}>
                <Checkbox
                  checked={selectedCategories.includes(category.key)}
                  onChange={() => toggleCategory(category.key)}
                  disabled={isDeletingData || category.count === 0}
                />
                <span className={styles.categoryText}>
                  <span className={styles.categoryLabel}>{category.label}</span>
                  <span className={styles.categoryDescription}>{category.description}</span>
                </span>
                <span className={styles.categoryCount}>{formatCount(category.count)}</span>
              </label>
            ))}
          </div>
        )}

        <label className={styles.confirmRow}>
          <Checkbox
            checked={confirmSelectedData}
            onChange={(event) => setConfirmSelectedData(event.currentTarget.checked)}
            disabled={isDeletingData || selectedCategories.length === 0}
          />
          <span>I understand selected data will be permanently deleted.</span>
        </label>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="destructive"
            disabled={selectedCategories.length === 0 || !confirmSelectedData || isDeletingData}
            onClick={handleDeleteSelected}
          >
            {isDeletingData ? (
              <>
                <Loader2 className={styles.spin} size={16} />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 size={16} />
                Delete selected
              </>
            )}
          </Button>
          {selectedCategories.length > 0 && (
            <span className={styles.selectionNote}>{formatCount(selectedCount)} selected</span>
          )}
        </div>
      </div>

      <div className={styles.dangerPanel}>
        <div className={styles.panelHeader}>
          <div>
            <h4 className={styles.panelTitle}>Delete account</h4>
            <p className={styles.panelSubtitle}>
              This removes your consumer account, login access, saved files, and account records.
            </p>
          </div>
          <UserX size={20} />
        </div>

        <div className={styles.accountDeleteGrid}>
          <label className={styles.field}>
            <span>Account email</span>
            <Input
              type="email"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.currentTarget.value)}
              placeholder={accountEmail}
              disabled={isDeletingAccount}
            />
          </label>
          <label className={styles.field}>
            <span>Confirmation phrase</span>
            <Input
              value={confirmPhrase}
              onChange={(event) => setConfirmPhrase(event.currentTarget.value)}
              placeholder={ACCOUNT_DELETE_CONFIRM_PHRASE}
              disabled={isDeletingAccount}
            />
          </label>
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="destructive"
            disabled={!accountDeleteEnabled}
            onClick={handleDeleteAccount}
          >
            {isDeletingAccount ? (
              <>
                <Loader2 className={styles.spin} size={16} />
                Deleting account...
              </>
            ) : (
              <>
                <UserX size={16} />
                Delete my account
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
