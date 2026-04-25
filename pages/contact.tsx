import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ArrowLeft, Mail, MapPin, Clock, Send } from "lucide-react";
import { LandingFooter } from "../components/LandingFooter";
import { LandingHeader } from "../components/LandingHeader";
import styles from "./contact.module.css";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct the mailto link
    const subject = encodeURIComponent(`Contact Form Submission from ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
    
    // Open default email client
    window.location.href = `mailto:support@creditregulatorpro.com?subject=${subject}&body=${body}`;
  };

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Contact Us | Credit Regulator Pro</title>
        <meta
          name="description"
          content="Get in touch with Credit Regulator Pro. We are here to help you with your credit report questions."
        />
      </Helmet>

      <LandingHeader />

      <main className={styles.main}>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>Contact Us</h1>
          <p className={styles.intro}>
            We are here to help. If you have any questions or need support using our app, please reach out. We try to reply to all messages within one business day.
          </p>
        </header>

        <div className={styles.content}>
          <div className={styles.grid}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Mail size={20} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                Email Us
              </h2>
              <p className={styles.paragraph}>
                The best way to reach us is by email.
              </p>
              <a href="mailto:support@creditregulatorpro.com" className={styles.contactLink}>
                support@creditregulatorpro.com
              </a>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Clock size={20} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                Business Hours
              </h2>
              <p className={styles.paragraph}>
                Monday to Friday<br />
                9:00 AM – 5:00 PM (Eastern Time)
              </p>
            </section>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Send a Message</h2>
            <p className={styles.paragraph}>
              Fill out the form below to send us an email directly from your computer or phone.
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="name" className={styles.label}>Your Name</label>
                <input
                  id="name"
                  type="text"
                  required
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="email" className={styles.label}>Your Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="message" className={styles.label}>How can we help?</label>
                <textarea
                  id="message"
                  required
                  className={styles.textarea}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message here..."
                />
              </div>

              <button type="submit" className={styles.submitBtn}>
                <Send size={18} />
                Open Email App to Send
              </button>
            </form>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <MapPin size={20} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
              Mailing Address
            </h2>
            <p className={styles.paragraph}>
              Credit Regulator Pro<br />
              123 Compliance Way, Suite 400<br />
              Toronto, ON M5V 3K2<br />
              Canada
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}