import {
  parseHtmlToRawText,
  parseAllTables,
  getRegion,
  extractFieldFromTables,
  mapTableRows
} from "./_htmlParserUtils";
import {
  isSamePaymentAmount,
  parseTransUnionPaymentAmountFrequency,
} from "./transunionPaymentTerms";

/**
 * Parses an individual Tradeline account block deterministically.
 */
export function parseAccount(accHtml: string) {
  const rawText = parseHtmlToRawText(accHtml);
  const tables = parseAllTables(accHtml);

  let creditorName = "";

  // Look for Creditor Name in tables to handle page 4 format (value in next row)
  for (const table of tables) {
    for (let r = 0; r < table.length; r++) {
      for (let c = 0; c < table[r].length; c++) {
        if (table[r][c].toLowerCase().includes("creditor name")) {
          // If it's a key-value in same cell like "Creditor Name BANK"
          const match = table[r][c].match(/Creditor Name\s*:?\s*(.+)/i);
          if (match && match[1].trim() && !match[1].toLowerCase().includes("payment history")) {
            creditorName = match[1].trim();
            break;
          }
          // If it's in the next cell
          let nextCol = c + 1;
          while (nextCol < table[r].length && table[r][nextCol].toLowerCase().includes("creditor name")) {
            nextCol++;
          }
          if (nextCol < table[r].length && table[r][nextCol].trim() && !table[r][nextCol].toLowerCase().includes("payment history")) {
            creditorName = table[r][nextCol].trim();
            break;
          }
          // If it's in the next row
          if (r + 1 < table.length && table[r+1][c] && table[r+1][c].trim() && !table[r+1][c].toLowerCase().includes("payment history") && !table[r+1][c].toLowerCase().includes("creditor name")) {
            creditorName = table[r+1][c].trim();
            break;
          }
        }
      }
      if (creditorName) break;
    }
    if (creditorName) break;
  }
  
  if (!creditorName) {
    // Robust extraction handling both <strong> wrappers and <td colspan> wrappers
    const credRegex = /(?:<strong[^>]*>|<t[dh][^>]*>)\s*Creditor Name\s*:?(?:\s*<\/strong>|\s*<\/t[dh]>)\s*(?:<t[dh][^>]*>)?\s*(?:<[^>]+>)*([^<]+)/i;
    const credMatchHtml = accHtml.match(credRegex);
    if (credMatchHtml && credMatchHtml[1].trim() && !credMatchHtml[1].toLowerCase().includes("payment history")) {
      creditorName = credMatchHtml[1].trim();
    } else {
      // Fallback to raw text extraction
      const credMatchText = rawText.match(/Creditor Name\s*:?\s*([^\n]+)/i);
      if (credMatchText && !credMatchText[1].toLowerCase().includes("payment history")) {
        creditorName = credMatchText[1].trim();
      }
    }
  }

  const getField = (label: string) => {
    let val = extractFieldFromTables(tables, label);
    if (val !== null) return val.trim();

    // Fallback to text parsing
    const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${safeLabel}\\s*:?\\s*([^\\n]+)`, "i");
    const match = rawText.match(regex);
    if (match) {
      return match[1].split(/\s{2,}/)[0].trim();
    }
    return null;
  };

  const getFieldAlt = (...labels: string[]) => {
    for (const label of labels) {
      const val = getField(label);
      if (val !== null) return val;
    }
    return null;
  };

  const getAmount = (label: string) => {
    const val = getField(label);
    if (!val) return null;
    const num = parseFloat(val.replace(/[^0-9.-]/g, ""));
    return isNaN(num) ? null : num;
  };

  const getAmountAlt = (...labels: string[]) => {
    for (const label of labels) {
      const val = getAmount(label);
      if (val !== null) return val;
    }
    return null;
  };

  let accountNumber = getField("Account Number");
  if (!accountNumber) {
    const accMatch = rawText.match(/Account\s*(?:Number|#|No\.?)\s*:?\s*([A-Z0-9*X-]+)/i);
    if (accMatch && !/type|review/i.test(accMatch[1])) {
      accountNumber = accMatch[1].trim();
    }
  }
  
  if (accountNumber) {
    const anLower = accountNumber.trim().toLowerCase();
    if (/^(account|type|review|status|date|balance|creditor|name)$/i.test(anLower)) {
      accountNumber = null;
    }
  }
  
  let accountType = getField("Account Type");

  // Fallback for Page 4 format where "Account" is isolated and its value is adjacent
  if (!accountType) {
    for (const table of tables) {
      for (let r = 0; r < table.length; r++) {
        const row = table[r];
        for (let c = 0; c < row.length - 1; c++) {
          if (row[c].trim().toLowerCase() === "account") {
            let nextCol = c + 1;
            while (nextCol < row.length && (row[nextCol].trim().toLowerCase() === "account" || row[nextCol].trim().toLowerCase() === "type:")) {
              nextCol++;
            }
            const nextVal = row[nextCol]?.trim();
            if (nextVal) {
              accountType = nextVal;
              break;
            }
          }
        }
        if (accountType) break;
      }
      if (accountType) break;
    }
  }

  let responsibilityCode = getField("Responsibility Code");

  // Split compound Account Type (e.g. "INSTALLMENT / INDIVIDUAL" or "Open/Individual" → type + responsibility)
  if (accountType && accountType.includes("/")) {
    const parts = accountType.split(/\s*\/\s*/);
    if (parts.length >= 2) {
      const respPartRaw = parts[1].trim();
      const respPart = respPartRaw.toLowerCase().replace(/[\s-]+/g, "_");
      const respMap: Record<string, string> = {
        individual: "individual",
        joint: "joint",
        authorized_user: "authorized_user",
        co_signer: "cosigner",
        cosigner: "cosigner",
        on_behalf_of: "on_behalf_of",
        terminated: "terminated",
      };

      if (respMap[respPart]) {
        accountType = parts[0].trim();
        if (!responsibilityCode) {
          responsibilityCode = respMap[respPart];
        }
      }
    }
  }

  const status = getField("Status");
  let balance = getAmount("Balance");
  let openedDate = getFieldAlt("Opened Date", "Date Opened");
  let reportedDate = getFieldAlt("Reported Date", "Last Reported", "Date Reported");
  const closedDate = getFieldAlt("Closed Date", "Date Closed");
  const firstDelinquencyDate = getFieldAlt("First Delinquency", "Date of First Delinquency");
  const lastActivityDate = getFieldAlt("Last Activity", "Date of Last Activity");
  let lastPaymentDate = getField("Last Payment");
  let postedDate = getField("Posted Date");
  const chargeOffDate = getField("Charge Off");
  const balloonPaymentDate = getField("Balloon Payment");
  let highCredit = getAmount("High Credit");
  let pastDue = getAmount("Past Due");
  let creditLimit = getAmount("Credit Limit");
  let monthlyPayment = getAmountAlt("Monthly Payment");
  let scheduledMonthlyPayment = null;
  let paymentFrequency = null;
  const monthsReviewed = getFieldAlt("Months Reviewed");
  let terms = getField("Terms");
  
  if (terms) {
    const tLower = terms.toLowerCase();
    if (tLower === "terms:" || tLower === "terms" || (!/\d/.test(tLower) && !tLower.includes("month") && !tLower.includes("year"))) {
      terms = null;
    }
  }

  const paymentTerms = parseTransUnionPaymentAmountFrequency(terms);
  if (paymentTerms) {
    monthlyPayment = monthlyPayment ?? paymentTerms.amount;
    scheduledMonthlyPayment = paymentTerms.amount;
    paymentFrequency = paymentTerms.frequency;
    terms = null;
  }

  let paymentHistoryProfile = getField("Payment History");
  if (!paymentHistoryProfile) {
    const phMatch = rawText.match(/Payment History\s*:?\s*([0-9A-Za-z]+)/i);
    if (phMatch) {
      paymentHistoryProfile = phMatch[1];
    }
  }

  if (paymentHistoryProfile) {
    const pLower = paymentHistoryProfile.toLowerCase();
    if (
      pLower.includes("last payment") ||
      pLower.includes("terms") ||
      pLower.includes("date") ||
      pLower.includes("payment date") ||
      paymentHistoryProfile.length < 3 ||
      !/[0-9CXO-]/i.test(paymentHistoryProfile)
    ) {
      paymentHistoryProfile = null;
    }
  }

  let paymentHistory: any = null;
  let paymentPattern = null;

  // 1. Try to find payment history in the account's tables
  for (const table of tables) {
    for (let r = 0; r < table.length - 1; r++) {
      const headers = table[r].map((h) => h.toLowerCase().trim());
      if (headers.includes("30") && headers.includes("60") && headers.includes("90")) {
        const idx30 = headers.indexOf("30");
        const idx60 = headers.indexOf("60");
        const idx90 = headers.indexOf("90");
        const idxM = headers.findIndex((h) => h === "#m" || h === "months");

        // Values are in the next row at the same indices
        paymentHistory = {
          "30": parseInt(table[r + 1][idx30] || "0", 10),
          "60": parseInt(table[r + 1][idx60] || "0", 10),
          "90": parseInt(table[r + 1][idx90] || "0", 10),
          "#M": idxM !== -1 ? parseInt(table[r + 1][idxM] || "0", 10) : 0,
        };
        paymentPattern = `30d:${paymentHistory["30"]} 60d:${paymentHistory["60"]} 90d:${paymentHistory["90"]} months:${paymentHistory["#M"]}`;
        break;
      }
    }
    if (paymentHistory) break;
  }

  // 2. Fallback to raw text
  if (!paymentHistory) {
    const payHistMatch = rawText.match(
      /30\s*:\s*(\d+).*?60\s*:\s*(\d+).*?90\s*:\s*(\d+).*?(?:#M|Months)\s*:\s*(\d+)/i
    );
    if (payHistMatch) {
      paymentHistory = {
        "30": parseInt(payHistMatch[1] || "0", 10),
        "60": parseInt(payHistMatch[2] || "0", 10),
        "90": parseInt(payHistMatch[3] || "0", 10),
        "#M": parseInt(payHistMatch[4] || "0", 10),
      };
      paymentPattern = `30d:${paymentHistory["30"]} 60d:${paymentHistory["60"]} 90d:${paymentHistory["90"]} months:${paymentHistory["#M"]}`;
    }
  }

  let legend = getField("Legend");
  if (!legend) {
    const legendMatch = rawText.match(/Legend\s*:?\s*([^\n]+)/i);
    if (legendMatch) legend = legendMatch[1].trim();
  }

  let paymentHistoryDetails: any[] = [];
  for (const tableRows of tables) {
    if (tableRows.length > 0) {
      // Find the header row within the table
      let headerRowIdx = -1;
      for (let r = 0; r < tableRows.length; r++) {
        const cells = tableRows[r].map(c => c.toLowerCase().trim());
        const hasBalance = cells.some(c => c.includes("balance"));
        const hasDate = cells.some(c => c.includes("date"));
        const hasPast = cells.some(c => c.includes("past"));
        const hasPayment = cells.some(c => c.includes("payment"));
        const hasMop = cells.some(c => c.includes("mop"));
        
        if (hasBalance && hasDate && (hasPast || hasPayment || hasMop)) {
          const balanceIdx = cells.findIndex(c => c.includes("balance"));
          const mopIdx = cells.findIndex(c => c.includes("mop"));
          const paymentIdx = cells.findIndex(c => c.includes("payment"));
          const pastIdx = cells.findIndex(c => c.includes("past"));

          // Prevent matching concatenated values like "Balance Payment Date" by requiring split cells
          const hasSeparateMopOrPayment = 
            (mopIdx !== -1 && mopIdx !== balanceIdx) ||
            (paymentIdx !== -1 && paymentIdx !== balanceIdx) ||
            (pastIdx !== -1 && pastIdx !== balanceIdx);

          if (hasSeparateMopOrPayment) {
            headerRowIdx = r;
            break;
          }
        }
      }

      // Identify the monthly detail breakdown table (robust match)
      if (headerRowIdx !== -1) {
        const targetRows = tableRows.slice(headerRowIdx);
        
        if (targetRows.length > 0 && targetRows[0].length > 0) {
          const firstCellNorm = targetRows[0][0].toLowerCase().trim().replace(/[^a-z0-9]/g, "");
          if (
            firstCellNorm.includes("paymenthistory") &&
            !["date", "balance", "payment"].includes(firstCellNorm)
          ) {
            targetRows[0] = targetRows[0].slice(1);
          }
        }

        const mapped = mapTableRows(targetRows, {
          Date: "date",
          Balance: "balance",
          Payment: "payment",
          "Past Due": "pastDue",
          MOP: "mop",
          Terms: "terms",
          "High Credit": "highCredit",
          "Credit Limit": "creditLimit",
          "Balloon Payment": "balloonPayment",
          "Charge Off": "chargeOff",
          Narrative: "narrative",
        });

        paymentHistoryDetails = mapped.map((row: any) => {
          const parseNum = (v: any) => {
            if (!v) return null;
            const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
            return isNaN(n) ? null : n;
          };
          const rowPayment = parseNum(row.payment);
          const rowTerms =
            paymentTerms && isSamePaymentAmount(row.terms, paymentTerms.amount)
              ? null
              : row.terms;
          return {
            ...row,
            balance: parseNum(row.balance),
            payment:
              rowPayment ??
              (paymentTerms && isSamePaymentAmount(row.terms, paymentTerms.amount)
                ? paymentTerms.amount
                : null),
            pastDue: parseNum(row.pastDue),
            highCredit: parseNum(row.highCredit),
            creditLimit: parseNum(row.creditLimit),
            balloonPayment: parseNum(row.balloonPayment),
            chargeOff: parseNum(row.chargeOff),
            terms: rowTerms,
          };
        });

        if (paymentHistoryDetails.length > 0) {
          const firstRow = paymentHistoryDetails[0];
          if (balance === null && firstRow.balance != null) balance = firstRow.balance;
          if (highCredit === null && firstRow.highCredit != null) highCredit = firstRow.highCredit;
          if (pastDue === null && firstRow.pastDue != null) pastDue = firstRow.pastDue;
          if (creditLimit === null && firstRow.creditLimit != null) creditLimit = firstRow.creditLimit;
        }
        break;
      }
    }
  }

  const rawStatus = legend || status;
  let finalStatus = rawStatus;
  if (rawStatus) {
    let parts = rawStatus.split(',').map(p => p.trim());
    parts = parts.filter(p => !p.toLowerCase().includes('x-unknown'));
    if (parts.length > 0) {
      let bestDerogatory = null;
      let maxPriority = 0;
      for (const p of parts) {
        let priority = 0;
        if (/WO|CHARGE\s*OFF/i.test(p)) priority = 4;
        else if (/CO/i.test(p)) priority = 3;
        else if (/TC/i.test(p)) priority = 2;
        else if (/CG/i.test(p)) priority = 1;
        
        if (priority > maxPriority) {
          maxPriority = priority;
          bestDerogatory = p;
        }
      }
      finalStatus = bestDerogatory || parts[0];
    } else {
      finalStatus = rawStatus.replace(/X-Unknown/ig, '').replace(/,\s*,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '');
    }
  }

  // Post-processing date cross-validation for DocStrange row shift
  if (!openedDate && reportedDate && postedDate) {
    const parsedReported = new Date(reportedDate).getTime();
    const parsedPosted = new Date(postedDate).getTime();
    if (!isNaN(parsedReported) && !isNaN(parsedPosted)) {
      const diffDays = Math.abs(parsedReported - parsedPosted) / (1000 * 60 * 60 * 24);
      if (diffDays > 365) {
        console.log(`[Parser] Detected DocStrange date misalignment for ${creditorName}: correcting openedDate and reportedDate`);
        openedDate = reportedDate;
        reportedDate = postedDate;
        postedDate = null;
      }
    }
  }

  // MOP Inference
  let mop = "0";
  if (paymentHistoryDetails.length > 0 && paymentHistoryDetails[0].mop) {
    mop = paymentHistoryDetails[0].mop.trim();
  } else if (finalStatus) {
    if (/CG|WO|CO|charge\s*off|bad\s*debt|R9|I9|09|collection/i.test(finalStatus)) {
      mop = "9";
    } else if (/R8|I8|08|repossession/i.test(finalStatus)) {
      mop = "8";
    } else if (/R7|I7|07/i.test(finalStatus)) {
      mop = "7";
    } else if (/R5|I5|05/i.test(finalStatus)) {
      mop = "5";
    } else if (/R4|I4|04/i.test(finalStatus)) {
      mop = "4";
    } else if (/R3|I3|03/i.test(finalStatus)) {
      mop = "3";
    } else if (/R2|I2|02/i.test(finalStatus)) {
      mop = "2";
    } else if (/R1|I1|01|AC|CZ|current|pays/i.test(finalStatus)) {
      mop = "1";
    }
  }

  // Derive last payment date from payment history if missing
  if (!lastPaymentDate && paymentHistoryDetails.length > 0) {
    let latestTime = -1;
    for (const entry of paymentHistoryDetails) {
      if (entry.payment && entry.payment > 0 && entry.date) {
        const d = new Date(entry.date);
        const t = d.getTime();
        if (!isNaN(t) && t > latestTime) {
          latestTime = t;
          lastPaymentDate = entry.date;
        }
      }
    }
  }

  // High credit fallback
  if ((highCredit === 0 || highCredit === null) && balance !== null && balance > 0) {
    if (paymentHistoryDetails.length > 0) {
      let fallbackHc = paymentHistoryDetails[0].highCredit;
      if (!fallbackHc) {
        let maxHc = 0;
        for (const row of paymentHistoryDetails) {
          if (row.highCredit && row.highCredit > maxHc) {
            maxHc = row.highCredit;
          }
        }
        if (maxHc > 0) {
          fallbackHc = maxHc;
        }
      }
      if (fallbackHc) {
        highCredit = fallbackHc;
      }
    }
  }

  return {
    creditorName,
    accountNumber,
    accountType,
    balance,
    status: finalStatus,
    dateOpened: openedDate,
    dateReported: reportedDate,
    dateClosed: closedDate,
    dateOfFirstDelinquency: firstDelinquencyDate,
    lastActivityDate,
    lastPaymentDate,
    postedDate,
    chargeOffDate,
    balloonPaymentDate,
    highCredit,
    pastDue,
    creditLimit,
    monthlyPayment,
    scheduledMonthlyPayment,
    paymentFrequency,
    paymentHistoryProfile,
    paymentPattern,
    monthsReviewed,
    responsibilityCode,
    remarks: legend,
    terms,
    legend,
    paymentHistory,
    paymentHistoryDetails:
      paymentHistoryDetails.length > 0 ? paymentHistoryDetails : null,
    mop,
    sourceText: rawText,
  };
}

/**
 * Splits out and extracts all account entries in the disclosure, handling page boundaries properly.
 */
export function extractAccounts(html: string): any[] {
  const accounts: any[] = [];
  const accRegion = getRegion(html, /Account\(s\)\s*:/i);
  if (!accRegion) return accounts;

  // Find boundaries using a robust regex that checks for strong tags OR table headers
  const creditorRegex = /(?:<strong[^>]*>|<t[dh][^>]*>)\s*Creditor Name\s*:?(?:\s*<\/strong>|\s*<\/t[dh]>)/gi;
  let matches: number[] = [];
  let m;
  while ((m = creditorRegex.exec(accRegion)) !== null) {
    matches.push(m.index);
  }

  // Always search for <p>-format or adjacent text accounts
  const pFormatRegex = />[^<]*Creditor Name\s+[A-Z]/gi;
  while ((m = pFormatRegex.exec(accRegion)) !== null) {
    matches.push(m.index);
  }

  // Sort and deduplicate matches
  matches.sort((a, b) => a - b);
  let deduped: number[] = [];
  for (let idx of matches) {
    if (deduped.length === 0 || idx - deduped[deduped.length - 1] > 30) {
      deduped.push(idx);
    }
  }
  matches = deduped;

  // Deep fallback
  if (matches.length === 0) {
    const rawFallbackRegex = /Creditor Name/gi;
    while ((m = rawFallbackRegex.exec(accRegion)) !== null) {
      matches.push(m.index);
    }
    let df: number[] = [];
    for (let idx of matches) {
      if (df.length === 0 || idx - df[df.length - 1] > 30) {
        df.push(idx);
      }
    }
    matches = df;
  }

  for (let i = 0; i < matches.length; i++) {
    let startIdx = matches[i];
    
    const previousTableStart = accRegion.lastIndexOf("<table", startIdx);
    const previousTableEnd = accRegion.lastIndexOf("</table>", startIdx);
    
    if (previousTableStart > previousTableEnd) {
      const previousTrStart = accRegion.lastIndexOf("<tr", startIdx);
      if (previousTrStart > previousTableStart) {
        const textBetween = accRegion.substring(previousTableStart, previousTrStart).replace(/<[^>]+>/g, "").trim();
        if (textBetween.length === 0) {
          startIdx = previousTableStart;
        } else {
          startIdx = previousTrStart;
        }
      } else {
        startIdx = previousTableStart;
      }
    }

    let endIdx = accRegion.length;
    if (i + 1 < matches.length) {
      const nextMatchIdx = matches[i + 1];
      const nextTableStart = accRegion.lastIndexOf("<table", nextMatchIdx);
      const nextTableEnd = accRegion.lastIndexOf("</table>", nextMatchIdx);
      
      if (nextTableStart > nextTableEnd) {
        const nextTrStart = accRegion.lastIndexOf("<tr", nextMatchIdx);
        if (nextTrStart > nextTableStart) {
          const textBetween = accRegion.substring(nextTableStart, nextTrStart).replace(/<[^>]+>/g, "").trim();
          if (textBetween.length === 0 && nextTableStart > startIdx) {
            endIdx = nextTableStart;
          } else {
            endIdx = nextTrStart;
          }
        } else {
          endIdx = nextTableStart > startIdx ? nextTableStart : nextMatchIdx;
        }
      } else {
        endIdx = nextMatchIdx;
      }
    }

    let accountHtml = accRegion.substring(startIdx, endIdx);
    
    // Check if it looks like <p>Creditor Name...<br />...
    if (accountHtml.includes("<p>") && accountHtml.includes("<br")) {
      accountHtml = accountHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, inner) => {
        if (/Creditor Name/i.test(inner) && /<br\s*\/?>/i.test(inner)) {
          const lines = inner.split(/<br\s*\/?>/i);
          const tableRows = lines.map((line: string) => {
            let key = "";
            let val = line;
            const knownLabels = ["Creditor Name", "Account Number", "Account Type", "Account Status", "Date Opened", "Date Closed", "Date of Last Activity", "Date of First Delinquency", "High Credit", "Balance", "Past Due", "Credit Limit", "Monthly Payment", "Last Reported", "Months Reviewed", "Payment History", "Posted Date"];
            for (const label of knownLabels) {
              if (line.toLowerCase().trim().startsWith(label.toLowerCase())) {
                key = label;
                val = line.substring(line.toLowerCase().indexOf(label.toLowerCase()) + label.length).replace(/^[:\s]+/, "");
                break;
              }
            }
            if (key) {
              return `<tr><td>${key}</td><td>${val}</td></tr>`;
            } else {
              return `<tr><td colspan="2">${line}</td></tr>`;
            }
          });
          return `<table><tbody>${tableRows.join("")}</tbody></table>`;
        }
        return match;
      });
    }

    if (!accountHtml.trim().toLowerCase().startsWith("<table")) {
      accountHtml = `<table>${accountHtml}</table>`;
    }

    accounts.push(parseAccount(accountHtml));
  }

  return accounts;
}
