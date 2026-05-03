import { Link } from "react-router-dom";
import styles from "./LandingFooter.module.css";

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.brandInfo}>
          <img 
            src="/brand/logo-horizontal.png"
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
