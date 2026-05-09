import { Link, useNavigate } from "react-router-dom";
import { Users, ArrowRight } from "lucide-react";
import { useAdminUsers } from "../helpers/adminQueries";
import { Skeleton } from "./Skeleton";
import { Badge } from "./Badge";
import styles from "./DashboardUsersTable.module.css";

export const DashboardUsersTable = () => {
  const navigate = useNavigate();
  const { data: usersData, isFetching } = useAdminUsers({ limit: 5, offset: 0 });
  const displayUsers = usersData?.users ?? [];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <Users className={styles.sectionIcon} />
          <h2 className={styles.sectionTitle}>Users</h2>
        </div>
        <Link to="/admin-user-management" className={styles.viewAllLink}>
          View All
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Subscription</th>
              <th>Tradelines</th>
            </tr>
          </thead>
          <tbody>
            {isFetching ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton className={styles.skeletonCell} /></td>
                  <td><Skeleton className={styles.skeletonCell} style={{ width: "60px" }} /></td>
                  <td><Skeleton className={styles.skeletonCell} style={{ width: "100px" }} /></td>
                  <td><Skeleton className={styles.skeletonCell} style={{ width: "40px" }} /></td>
                </tr>
              ))
            ) : displayUsers.length > 0 ? (
              displayUsers.map((user) => (
                <tr 
                  key={user.id} 
                  className={styles.clickableRow}
                  onClick={() => navigate(`/admin-user-management/${user.id}`)}
                >
                  <td>
                    <div className={styles.userCell}>
                      <span className={styles.displayName}>{user.fullName || user.displayName || "Unknown"}</span>
                      <span className={styles.email}>{user.email}</span>
                    </div>
                  </td>
                  <td>
                    <Badge 
                      variant={user.role === "admin" ? "primary" : user.role === "support" ? "info" : "default"}
                      className={styles.badge}
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td>
                    {user.subscriptionPlan ? (
                      <Badge variant="success" className={styles.badge}>
                        {user.subscriptionPlan} / {user.subscriptionStatus}
                      </Badge>
                    ) : (
                      <span className={styles.emptyValue}>-</span>
                    )}
                  </td>
                  <td className={styles.countCell}>
                    {user.tradelinesCount}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>
                  <div className={styles.emptyState}>No users found.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
