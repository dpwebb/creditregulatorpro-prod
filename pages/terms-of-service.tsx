import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { LandingFooter } from "../components/LandingFooter";
import { LandingHeader } from "../components/LandingHeader";
import styles from "./terms-of-service.module.css";

export default function TermsOfServicePage() {
  return (
    <div className={styles.page}>
      <Helmet>
        <title>Terms of Service | Credit Regulator Pro</title>
        <meta
          name="description"
          content="Read the terms and conditions for using Credit Regulator Pro."
        />
      </Helmet>

      <LandingHeader />

      <main className={styles.main}>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>Terms of Service</h1>
          <p className={styles.lastUpdated}>Last Updated: October 24, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <p className={styles.paragraph}>
              Welcome to Credit Regulator Pro. By using our app, you agree to these simple rules. Please read them carefully.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. What We Do</h2>
            <p className={styles.paragraph}>
              Credit Regulator Pro scans your Canadian credit reports. We look for errors and help you build dispute letters to send to credit bureaus and collection agencies. Our tool makes it easier to track your deadlines and protect your rights.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Your Responsibilities</h2>
            <p className={styles.paragraph}>
              When you use our app, you must:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Only upload your own credit reports, or reports you have legal permission to handle.</li>
              <li className={styles.listItem}>Give us true and accurate information.</li>
              <li className={styles.listItem}>Keep your password safe. Do not share your account.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Subscriptions and Payments</h2>
            <p className={styles.paragraph}>
              We offer different plans for our service:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}><strong>Trial User:</strong> New users get a 7-day free trial. This gives you full access to all features.</li>
              <li className={styles.listItem}><strong>Monthly Plan:</strong> $19.95 CAD per month.</li>
              <li className={styles.listItem}><strong>Annual Plan:</strong> $49.95 CAD per year.</li>
            </ul>
            <p className={styles.paragraph}>
              After your 7-day trial ends, you must pick the Monthly or Annual plan to keep using the app. If you do not subscribe, your account will be locked.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Acceptable Use</h2>
            <p className={styles.paragraph}>
              You agree to use Credit Regulator Pro honestly. You will not use our system to create fake disputes, trick credit bureaus, or break any laws. If you misuse the system, we may close your account.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. We Are Not Lawyers</h2>
            <p className={styles.paragraph}>
              <strong>We do not give legal advice or represent you.</strong> Credit Regulator Pro is a software and service business, not a law firm. You stay the person making the dispute. If you choose to have us print and mail a letter, we act only as a mailing service at your direction. That does not mean we represent you or speak for you.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Your Data</h2>
            <p className={styles.paragraph}>
              We care about your data. Please read our <Link to="/privacy-policy" className={styles.contactLink}>Privacy Policy</Link> to learn exactly how we collect, store, and delete your information. 
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Cancelling Your Account</h2>
            <p className={styles.paragraph}>
              You can cancel your subscription at any time. If you cancel, you will still have access until the end of your billing cycle. We do not offer refunds for months or years you have already paid for.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Governing Law</h2>
            <p className={styles.paragraph}>
              These rules are governed by the laws of Canada and your specific province. 
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>9. Contact Us</h2>
            <p className={styles.paragraph}>
              If you have questions about these Terms of Service, email us at:{" "}
              <a href="mailto:support@creditregulatorpro.com" className={styles.contactLink}>
                support@creditregulatorpro.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
