import React from "react";
import { Copy, Lightbulb } from "lucide-react";
import { Button } from "./Button";
import { toast } from "sonner";
import styles from "./ParserPatternSuggestions.module.css";

interface ParserPatternSuggestionsProps {
  suggestions: Record<string, string[]>; // fieldName -> suggestions[]
}

export function ParserPatternSuggestions({ suggestions }: ParserPatternSuggestionsProps) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Pattern copied to clipboard");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Lightbulb className={styles.icon} size={18} />
        <span>Regex Pattern Suggestions</span>
      </div>
      <div className={styles.list}>
        {Object.entries(suggestions).map(([field, patterns]) => (
          <div key={field} className={styles.item}>
            <div className={styles.fieldLabel}>Field: <strong>{field}</strong></div>
            <div className={styles.patterns}>
              {patterns.map((pattern, idx) => (
                <div key={idx} className={styles.patternRow}>
                  <code className={styles.code}>{pattern}</code>
                  <Button 
                    variant="ghost" 
                    size="icon-sm" 
                    onClick={() => handleCopy(pattern)}
                    title="Copy pattern"
                  >
                    <Copy size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <p>
          These patterns are generated based on the context of the expected value in the raw text. 
          Review and test them carefully before applying to the parser code.
        </p>
      </div>
    </div>
  );
}