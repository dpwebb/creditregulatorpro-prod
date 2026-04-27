import React from "react";
import { Link } from "react-router-dom";
import { Button } from "./Button";
import { LogIn } from "lucide-react";
import styles from "./LandingHeader.module.css";

export function LandingHeader() {
  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = `/#${id}`;
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logoLink}>
          <img 
            src="/brand/logo-horizontal.png"
            alt="Credit Regulator Pro" 
            className={styles.logoImg} 
          />
        </Link>
        
        <nav className={styles.nav}>
          <a href="#hero" onClick={(e) => scrollTo(e, "hero")} className={styles.navLink}>
            Home
          </a>
          <a href="#how-it-works" onClick={(e) => scrollTo(e, "how-it-works")} className={styles.navLink}>
            How It Works
          </a>
          <a href="#pricing" onClick={(e) => scrollTo(e, "pricing")} className={styles.navLink}>
            Pricing
          </a>
          <Link to="/login" className={styles.navLink}>
            Login
          </Link>
        </nav>
        
        <div className={styles.mobileCta}>
          <Button asChild variant="primary" size="sm">
            <Link to="/login">
              <LogIn size={16} />
              Sign In
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
