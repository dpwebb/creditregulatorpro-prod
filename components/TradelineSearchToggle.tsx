import React, { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./Input";
import styles from "./TradelineSearchToggle.module.css";

interface TradelineSearchToggleProps {
  search: string;
  onSearchChange: (value: string) => void;
  className?: string;
}

export const TradelineSearchToggle = ({
  search,
  onSearchChange,
  className,
}: TradelineSearchToggleProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleToggle = () => {
    if (isExpanded) {
      onSearchChange("");
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  };

  const handleClear = () => {
    onSearchChange("");
    setIsExpanded(false);
  };

  if (isExpanded) {
    return (
      <div className={`${styles.expandedWrapper} ${className || ""}`}>
        <div className={styles.inputWrapper}>
          <Search className={styles.searchIcon} size={14} />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search account # or creditor..."
            className={styles.searchInput}
          />
          <button
            onClick={handleClear}
            className={styles.clearButton}
            aria-label="Close search"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className={`${styles.searchButton} ${className || ""}`}
      type="button"
      aria-label="Open search"
    >
      <Search size={13} />
      <span>Search account # or creditor...</span>
    </button>
  );
};