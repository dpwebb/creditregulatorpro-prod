import { Helmet } from "react-helmet";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import styles from "./dispute-rotation-analytics.module.css";

export default function DisputeRotationAnalyticsPage() {
  return (
    <div className={styles.container}>
      <Helmet>
        <title>Strategy Analysis Reset | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Strategy Analysis Reset"
        subtitle="Legacy dispute-vector rotation analytics are disabled while the dispute process is redesigned."
      />

      <section className={styles.resetPanel}>
        <BarChart3 size={24} />
        <div>
          <h2>Legacy vector analytics are disabled</h2>
          <p>
            The next dispute architecture will define its own case, issue, packet, and delivery events before analytics are rebuilt.
          </p>
        </div>
      </section>
    </div>
  );
}
