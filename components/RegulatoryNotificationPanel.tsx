import React, { useState } from "react";
import { Bell, AlertTriangle, AlertOctagon, Info, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import {
  useRegulatoryNotifications,
  useMarkNotificationRead,
  useDismissAllNotifications,
} from "../helpers/regulatoryNotificationQueries";
import styles from "./RegulatoryNotificationPanel.module.css";

function getTimeAgo(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return "";
  try {
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (diffInSeconds < 60) return "Just now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return rtf.format(-diffInMinutes, "minute");
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return rtf.format(-diffInHours, "hour");
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return rtf.format(-diffInDays, "day");
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return rtf.format(-diffInMonths, "month");
    const diffInYears = Math.floor(diffInDays / 365);
    return rtf.format(-diffInYears, "year");
  } catch {
    return "";
  }
}

const getSeverityIcon = (severity?: string) => {
  const sev = (severity || "INFO").toUpperCase();
  if (sev === "CRITICAL" || sev === "ERROR") {
    return <AlertTriangle className={styles.iconCritical} size={18} />;
  }
  if (sev === "WARNING") {
    return <AlertOctagon className={styles.iconWarning} size={18} />;
  }
  return <Info className={styles.iconInfo} size={18} />;
};

export interface RegulatoryNotificationPanelProps {
  onViewUpdate?: (regulatoryUpdateId: number) => void;
  className?: string;
}

export const RegulatoryNotificationPanel: React.FC<
  RegulatoryNotificationPanelProps
> = ({ onViewUpdate, className }) => {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading } = useRegulatoryNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: dismissAll, isPending: isDismissing } =
    useDismissAllNotifications();

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  const handleNotificationClick = (
    updateId: number | null | undefined,
    isRead: boolean | undefined,
    id: number
  ) => {
    if (!isRead) {
      markRead({ id });
    }
    if (updateId && onViewUpdate) {
      onViewUpdate(updateId);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`${styles.bellWrapper} ${className || ""}`}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className={styles.badge}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        removeBackgroundAndPadding
        className={styles.popoverContainer}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>Notifications</h3>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.dismissAllBtn}
              disabled={isDismissing}
              onClick={() => dismissAll()}
            >
              Dismiss All
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className={styles.emptyState}>
            <Skeleton className={styles.skeletonItem} />
            <Skeleton className={styles.skeletonItem} />
            <Skeleton className={styles.skeletonItem} />
          </div>
        ) : notifications.length === 0 ? (
          <div className={styles.emptyState}>No new notifications</div>
        ) : (
          <div className={styles.list}>
            {notifications.map((notif) => {
              const isClickable = !!notif.regulatoryUpdateId;
              return (
                <div
                  key={notif.id}
                  className={`${styles.item} ${isClickable ? styles.clickable : ""} ${
                    notif.isRead ? styles.read : ""
                  }`}
                  onClick={() =>
                    handleNotificationClick(
                      notif.regulatoryUpdateId,
                      notif.isRead,
                      notif.id
                    )
                  }
                  role={isClickable ? "button" : "listitem"}
                  tabIndex={isClickable ? 0 : undefined}
                >
                  <div className={styles.iconContainer}>
                    {getSeverityIcon(notif.severity)}
                  </div>
                  
                  <div className={styles.content}>
                    <h4 className={styles.itemTitle}>{notif.title}</h4>
                    <p className={styles.itemMessage}>{notif.message}</p>
                    <div className={styles.itemMeta}>
                      <span className={styles.timeAgo}>
                        {getTimeAgo(notif.createdAt)}
                      </span>
                    </div>
                  </div>

                  {!notif.isRead && (
                    <div className={styles.actions}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Mark as read"
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead({ id: notif.id });
                        }}
                      >
                        <Check size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};