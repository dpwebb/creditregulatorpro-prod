import React from "react";
import styles from "./IdentityTheftProtectionLayout.module.css";

interface IdentityTheftProtectionLayoutProps {
  main: React.ReactNode;
  aside: React.ReactNode;
  className?: string;
}

export const IdentityTheftProtectionLayout: React.FC<IdentityTheftProtectionLayoutProps> = ({
  main,
  aside,
  className = "",
}) => {
  return (
    <div className={`${styles.grid} ${className}`}>
      <div className={styles.main}>
        {main}
      </div>
      <aside className={styles.aside}>
        {aside}
      </aside>
    </div>
  );
};