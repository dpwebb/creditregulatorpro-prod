import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { LandingFooter } from "../components/LandingFooter";
import { LandingHeader } from "../components/LandingHeader";
import styles from "./privacy-policy.module.css";

export default function PrivacyPolicyPage() {
  return (
    <div className={styles.page}>
      <Helmet>
        <title>Privacy Policy | Credit Regulator Pro</title>
        <meta
          name="description"
          content="Learn how Credit Regulator Pro collects, uses, and protects your information."
        />
      </Helmet>

      <LandingHeader />

      <main className={styles.main}>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.lastUpdated}>Last Updated: October 24, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <p className={styles.paragraph}>
              At Credit Regulator Pro, we know your privacy is important. This page explains what information we collect, how we use it, and how we keep it safe. We use simple language so it is easy to understand.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. What Information We Collect</h2>
            <p className={styles.paragraph}>
              When you use our app, we collect the details needed to help you check your credit report and fix errors. This includes:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}><strong>Contact details:</strong> Your name, email address, and phone number.</li>
              <li className={styles.listItem}><strong>Credit reports:</strong> The files you upload to our system.</li>
              <li className={styles.listItem}><strong>Account details:</strong> Address history, birth date, and account numbers found in your reports.</li>
              <li className={styles.listItem}><strong>Payment details:</strong> Used for your subscription.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Canadian-Only Storage</h2>
            <p className={styles.paragraph}>
              We are a Canadian company serving Canadian consumers. All of your data stays in Canada. We do not store or move your information across the border.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. How We Use Your Data</h2>
            <p className={styles.paragraph}>
              We only use your data to provide our service. We use it to:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Scan your credit reports for rule-breaking errors.</li>
              <li className={styles.listItem}>Generate dispute letters for you to send to bureaus and creditors.</li>
              <li className={styles.listItem}>Track your deadlines and responses.</li>
              <li className={styles.listItem}>Help you log in safely and manage your subscription.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Services We Work With</h2>
            <p className={styles.paragraph}>
              To make our app work, we use trusted partners. We only share the exact data they need to do their job:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}><strong>Google Cloud Storage:</strong> To safely hold your uploaded files (stored in Canada).</li>
              <li className={styles.listItem}><strong>DocStrange & Nanonets:</strong> To read the text in your credit reports.</li>
              <li className={styles.listItem}><strong>Stripe:</strong> To safely process your subscription payments.</li>
              <li className={styles.listItem}><strong>PostGrid:</strong> To mail your physical dispute letters.</li>
              <li className={styles.listItem}><strong>SendGrid:</strong> To send you important emails and alerts.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. How Long We Keep Your Data</h2>
            <p className={styles.paragraph}>
              We keep your credit reports and dispute records for exactly <strong>1 year</strong>. After 1 year, our system automatically deletes them. You can always upload new reports when you need to check your credit again.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Your Rights</h2>
            <p className={styles.paragraph}>
              You are in control of your data. You have the right to:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Ask us for a copy of the data we have about you.</li>
              <li className={styles.listItem}>Ask us to fix any wrong details in your account.</li>
              <li className={styles.listItem}>Ask us to delete your account and all your files at any time.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. How We Keep You Safe</h2>
            <p className={styles.paragraph}>
              Your information is locked up tight. We scramble (encrypt) your files so no one else can read them. We use safe logins to make sure only you and our support team can see your account.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Contact Us</h2>
            <p className={styles.paragraph}>
              If you have any questions about this privacy policy, please email us at:{" "}
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