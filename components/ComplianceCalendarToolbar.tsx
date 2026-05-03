import { format } from "../helpers/dateUtils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import styles from "./ComplianceCalendarToolbar.module.css";

interface Props {
  date: Date;
  view: string;
  onNavigate: (action: 'PREV' | 'NEXT' | 'TODAY') => void;
  onView: (view: any) => void;
}

export const ComplianceCalendarToolbar = ({ date, view, onNavigate, onView }: Props) => {
  const goToBack = () => onNavigate('PREV');
  const goToNext = () => onNavigate('NEXT');
  const goToCurrent = () => onNavigate('TODAY');

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <Button variant="outline" size="icon-sm" onClick={goToBack}>
          <ChevronLeft size={16} />
        </Button>
        <Button variant="outline" size="sm" onClick={goToCurrent}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" onClick={goToNext}>
          <ChevronRight size={16} />
        </Button>
        <span className={styles.toolbarLabel}>
          {format(date, 'MMMM yyyy')}
        </span>
      </div>

      <div className={styles.toolbarGroup}>
        <div className={styles.viewButtons}>
          {(['month', 'week', 'day', 'agenda'] as const).map((v) => (
            <button
              key={v}
              className={`${styles.viewButton} ${view === v ? styles.active : ''}`}
              onClick={() => onView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};