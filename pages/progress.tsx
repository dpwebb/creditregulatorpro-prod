import { Helmet } from "react-helmet";

import AnalyticsDashboardPage from "./analytics-dashboard";

import styles from "./progress.module.css";

export default function ProgressPage() {
  return (
    <div className={styles.container}>
      <Helmet>
        <title>Your Progress | Credit Regulator Pro</title>
      </Helmet>
      
      <AnalyticsDashboardPage />
    </div>
  );
}
