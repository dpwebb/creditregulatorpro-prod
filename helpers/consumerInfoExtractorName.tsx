import { NAME_BLACKLIST } from "./consumerInfoExtractorConstants";

export function extractName(lines: string[]): { name: string | null; confidence: number } {
  let fullName: string | null = null;
  let confidence = 0;

  // Pattern 0: Look for monitoring PDF specific name labels (highest priority)
  const monitoringNameLabels = [
    /^(?:MEMBER\s+NAME|ACCOUNT\s+HOLDER|YOUR\s+NAME|NAME\s+ON\s+FILE)[\s:=]+(.+)$/i,
    /^(?:WELCOME|HI),?\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ.''-]*(?:\s+[A-ZÀ-Ÿ][A-Za-zÀ-ÿ.''-]*){1,3})$/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const pattern of monitoringNameLabels) {
      const match = line.match(pattern);
      if (match && match[1]) {
        let candidateName = match[1].trim();
        
        candidateName = candidateName.replace(/\s+(DISCLOSURE|INFORMATION|REPORT|CREDIT|DATE|FILE).*$/i, "").trim();
        
        const wordCount = candidateName.split(/\s+/).length;
        const hasBlacklisted = NAME_BLACKLIST.some((word) =>
          candidateName.toUpperCase().includes(word)
        );

        // Check if this is a concatenated all-caps name (e.g., "DAVIDPHILIPWEBB")
        const isConcatenatedName =
          /^[A-ZÀ-Ÿ]+$/.test(candidateName) &&
          candidateName.length >= 10 &&
          candidateName.length <= 60 &&
          !hasBlacklisted;
        
        if (
          ((wordCount >= 2 && wordCount <= 4) || (wordCount === 1 && isConcatenatedName)) &&
          !hasBlacklisted &&
          candidateName.length >= 4 &&
          candidateName.length <= 60 &&
          /^[A-Za-zÀ-ÿ\s,.''-]+$/.test(candidateName)
        ) {
          if (candidateName.includes(",")) {
            const parts = candidateName.split(",").map((p) => p.trim());
            if (parts.length === 2 && parts[0] && parts[1]) {
              candidateName = `${parts[1]} ${parts[0]}`;
            }
          }
          
          fullName = candidateName;
          confidence += 45;
          break;
        }
      }
    }
    
    if (fullName) break;
  }

  // Pattern 1: Look for explicit name labels
  const nameLabels = [
    /^(?:FULL\s+LEGAL\s+NAME|CONSUMER\s+NAME\s*\(?\s*S\s*\)?|CONSUMER\s+NAME|SUBJECT\s+FULL\s+NAME|SUBJECT\s+NAME|FULL\s+NAME|NAME|PERSONAL\s+INFO)[\s:=]+(.+)$/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const pattern of nameLabels) {
      const match = line.match(pattern);
      if (match && match[1]) {
        let candidateName = match[1].trim();
        
        candidateName = candidateName.replace(/\s+(DISCLOSURE|INFORMATION|REPORT|CREDIT|DATE|FILE).*$/i, "").trim();
        
        const wordCount = candidateName.split(/\s+/).length;
        const hasBlacklisted = NAME_BLACKLIST.some((word) =>
          candidateName.toUpperCase().includes(word)
        );
        
        if (
          wordCount >= 2 &&
          wordCount <= 4 &&
          !hasBlacklisted &&
          candidateName.length >= 4 &&
          candidateName.length <= 60 &&
          /^[A-Za-zÀ-ÿ\s,.''-]+$/.test(candidateName)
        ) {
          if (candidateName.includes(",")) {
            const parts = candidateName.split(",").map((p) => p.trim());
            if (parts.length === 2 && parts[0] && parts[1]) {
              candidateName = `${parts[1]} ${parts[0]}`;
            }
          }
          
          fullName = candidateName;
          confidence += 40;
          break;
        }
      }
    }
    
    if (fullName) break;
  }

  // Pattern 1b: Multi-line name extraction
  if (!fullName) {
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      
      const nameLabelPattern = /^(?:FULL\s+LEGAL\s+NAME|CONSUMER\s+NAME|SUBJECT\s+FULL\s+NAME|SUBJECT\s+NAME|FULL\s+NAME|NAME)[\s:=]*$/i;
      
      if (nameLabelPattern.test(line) && nextLine && nextLine.trim().length > 0) {
        let candidateName = nextLine.trim();
        
        candidateName = candidateName.replace(/\s+(DISCLOSURE|INFORMATION|REPORT|CREDIT|DATE|FILE).*$/i, "").trim();
        
        const wordCount = candidateName.split(/\s+/).length;
        const hasBlacklisted = NAME_BLACKLIST.some((word) =>
          candidateName.toUpperCase().includes(word)
        );
        
        // Check if this is a concatenated all-caps name (e.g., "DAVIDPHILIPWEBB")
        const isConcatenatedName = 
          /^[A-ZÀ-Ÿ]+$/.test(candidateName) && 
          candidateName.length >= 10 && 
          candidateName.length <= 60 &&
          !hasBlacklisted;
        
        if (
          ((wordCount >= 2 && wordCount <= 4) || (wordCount === 1 && isConcatenatedName)) &&
          !hasBlacklisted &&
          candidateName.length >= 4 &&
          candidateName.length <= 60 &&
          /^[A-Za-zÀ-ÿ\s,.''-]+$/.test(candidateName)
        ) {
          if (candidateName.includes(",")) {
            const parts = candidateName.split(",").map((p) => p.trim());
            if (parts.length === 2 && parts[0] && parts[1]) {
              candidateName = `${parts[1]} ${parts[0]}`;
            }
          }
          
          fullName = candidateName;
          confidence += 35;
          break;
        }
      }
    }
  }

  // Pattern 2: Standalone all-caps names (fallback)
  if (!fullName) {
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const line = lines[i];
      
      const allCapsNamePattern = /^([A-ZÀ-Ÿ][A-ZÀ-Ÿ.''-]*(?:\s+[A-ZÀ-Ÿ][A-ZÀ-Ÿ.''-]*){1,3})$/;
      const match = line.match(allCapsNamePattern);
      
      if (match && match[1]) {
        const candidateName = match[1].trim();
        const wordCount = candidateName.split(/\s+/).length;
        const hasBlacklisted = NAME_BLACKLIST.some((word) =>
          candidateName.includes(word)
        );
        
        const isHeader = /^(ADDRESS|DATE|CONSUMER|SUBJECT|REPORT|FILE|PAGE|BUREAU|CREDIT|PERSONAL|INFO)/i.test(candidateName);
        
        if (
          wordCount >= 2 &&
          wordCount <= 4 &&
          !hasBlacklisted &&
          !isHeader &&
          candidateName.length >= 4 &&
          candidateName.length <= 60
        ) {
          if (candidateName.includes(",")) {
            const parts = candidateName.split(",").map((p) => p.trim());
            if (parts.length === 2 && parts[0] && parts[1]) {
              fullName = `${parts[1]} ${parts[0]}`;
            } else {
              fullName = candidateName;
            }
          } else {
            fullName = candidateName;
          }
          
          confidence += 25;
          break;
        }
      }
    }
  }

  return { name: fullName, confidence };
}