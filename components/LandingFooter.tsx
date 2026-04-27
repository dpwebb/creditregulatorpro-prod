import React from "react";
import { Link } from "react-router-dom";
import styles from "./LandingFooter.module.css";

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.brandInfo}>
          <img 
            src="https://assets.floot.app/e11b9956-edbd-4f31-b22c-500fa8dbcb00/66d4938f-4adf-4d8c-ada1-ab0b511a2dce.png" 
            alt="Credit Regulator Pro" 
            className={styles.logo}
          />
        </div>
        
        <div className={styles.content}>
          <div className={styles.links}>
                        <Link to="/privacy-policy" className={styles.link}>Privacy Policy</Link>
            <Link to="/terms-of-service" className={styles.link}>Terms of Service</Link>
            <Link to="/contact" className={styles.link}>Contact</Link>
          </div>
          
          <p className={styles.copyright}>
            © 2026 Credit Regulator Pro. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}