import React from "react";
import { LogOut, Wifi } from "lucide-react";
import { User } from "../helpers/User";
import { RoleBadge } from "./RoleBadge";
import { Badge } from "./Badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";
import { TourStartButton } from "./TourStartButton";
import { getSubscriptionPlanLabel } from "../helpers/subscriptionPlanLabels";
import styles from "./AppSidebarUser.module.css";

interface AppSidebarUserProps {
  user: User;
  onLogout: () => void;
  isMinimized: boolean;
}

export const AppSidebarUser: React.FC<AppSidebarUserProps> = ({
  user,
  onLogout,
  isMinimized,
}) => {
  const displayName = user.displayName || user.email;
  const initial = displayName.charAt(0).toUpperCase();

  const avatarContent = (
    <div className={styles.avatar}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={displayName} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );

  return (
    <div className={styles.container} data-minimized={isMinimized}>
      <div className={styles.userCard}>
        {isMinimized ? (
          <Tooltip>
            <TooltipTrigger asChild>
              {avatarContent}
            </TooltipTrigger>
            <TooltipContent side="right">
              <div>{displayName}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
                {user.role}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          avatarContent
        )}
        
        {!isMinimized && (
          <div className={styles.details}>
            <div className={styles.name}>{displayName}</div>
            <div className={styles.badges}>
              <RoleBadge role={user.role} size="sm" />
              {user.role !== "admin" && user.subscriptionPlan && (
                <Badge
                  variant={
                    user.subscriptionPlan.toLowerCase() === "annual" ? "success" :
                    user.subscriptionPlan.toLowerCase() === "monthly" ? "info" : "default"
                  }
                  className={styles.planBadge}
                >
                  {getSubscriptionPlanLabel(user.subscriptionPlan)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {isMinimized ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onLogout}
                className={styles.logoutButton}
                aria-label="Logout"
              >
                <LogOut size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Logout
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onLogout}
            className={styles.logoutButton}
            aria-label="Logout"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>

      {!isMinimized && (
        <div className={styles.statusBar}>
          <div className={styles.statusDot}>
            <span className={styles.pulseRing}></span>
          </div>
          <span className={styles.statusText}>System Online</span>
          <Wifi size={12} className={styles.statusIcon} />
        </div>
      )}

      <div className={styles.actionsRow} data-minimized={isMinimized}>
        {isMinimized ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={styles.minimizedTourWrapper}>
                <TourStartButton
                  variant="ghost"
                  size="sm"
                  showIcon={true}
                  label=""
                  className={styles.minimizedTourButton}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Take a Tour</TooltipContent>
          </Tooltip>
        ) : (
          <TourStartButton
            variant="ghost"
            size="sm"
            className={styles.tourButton}
          />
        )}
      </div>
    </div>
  );
};
