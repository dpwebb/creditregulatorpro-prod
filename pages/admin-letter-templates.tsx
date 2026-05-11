import { Helmet } from "react-helmet";
import { FileText } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import styles from "./admin-letter-templates.module.css";

export default function AdminLetterTemplatesPage() {
  return (
    <div className={styles.container}>
      <Helmet>
        <title>Letter Templates | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Letter Templates"
        subtitle="Packet generation is active through the readiness-gated packet workflow."
      />

      <section className={styles.resetPanel}>
        <FileText size={24} />
        <div>
          <h2>Legacy template tooling is disabled</h2>
          <p>
            Historical packets can still be viewed, downloaded, and mailed. New packet creation runs from packet-ready findings with verified evidence.
          </p>
        </div>
      </section>
    </div>
  );
}
