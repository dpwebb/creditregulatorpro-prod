import { Helmet } from "react-helmet";
import { FileText } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import styles from "./admin-letter-templates.module.css";

export default function AdminLetterTemplatesPage() {
  return (
    <div className={styles.container}>
      <Helmet>
        <title>Letter Templates Reset | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Letter Templates Reset"
        subtitle="The old dispute-letter template editor has been retired while the dispute packet workflow is redesigned."
      />

      <section className={styles.resetPanel}>
        <FileText size={24} />
        <div>
          <h2>Legacy template tooling is disabled</h2>
          <p>
            Historical packets can still be viewed, downloaded, and mailed. New dispute-letter creation will be rebuilt around the redesigned dispute process.
          </p>
        </div>
      </section>
    </div>
  );
}
