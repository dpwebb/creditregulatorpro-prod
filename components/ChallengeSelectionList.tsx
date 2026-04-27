import React, { useState } from "react";
import { Search, X } from "lucide-react";
import { format } from "../helpers/dateUtils";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { ObligationInstanceListItem } from "../endpoints/obligation-instance/list_GET.schema";
import styles from "./ChallengeSelectionList.module.css";

interface Props {
  challenges: ObligationInstanceListItem[];
  onSelect: (challengeId: number | undefined) => void;
  onCancel: () => void;
}

export function ChallengeSelectionList({ challenges, onSelect, onCancel }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredChallenges = challenges.filter(c => 
    c.accountNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.disputeVector?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (c.creditorName?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Select Challenge Context</h3>
          <p className={styles.subtitle}>
            Choose a challenge to link the uploaded evidence to, or upload without linking.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X size={20} />
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={16} />
          <input
            type="text"
            placeholder="Search by account, vector, or creditor..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>
        <Button variant="outline" onClick={() => onSelect(undefined)}>
          Skip / Upload Unlinked
        </Button>
      </div>

      <div className={styles.list}>
        {filteredChallenges.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No matching challenges found.</p>
          </div>
        ) : (
          filteredChallenges.map(challenge => (
            <div 
              key={challenge.id} 
              className={styles.item}
              onClick={() => onSelect(challenge.id)}
            >
              <div className={styles.itemMain}>
                <div className={styles.itemHeader}>
                  <span className={styles.accountNumber}>
                    {challenge.accountNumber}
                  </span>
                  <Badge variant="default" className={styles.badge}>
                    {challenge.disputeVector || "General"}
                  </Badge>
                </div>
                <div className={styles.itemMeta}>
                  <span>{challenge.creditorName} {challenge.bureauName ? `• ${challenge.bureauName}` : ''}</span>
                  <span className={styles.dot}>•</span>
                  <span>{challenge.createdAt ? format(new Date(challenge.createdAt), "MMM d, yyyy") : "-"}</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" className={styles.selectBtn}>
                Select
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}