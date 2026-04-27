import { parseAllTables, mapTableRows, parseHtmlToRawText } from "./_htmlParserUtils";

function parseNumericAmount(val: string | null | undefined): number | null {
  if (!val) return null;
  if (val.trim().toUpperCase() === "N/A") return null;
  const parsed = parseFloat(val.replace(/[^0-9.-]/g, ""));
  return isNaN(parsed) ? null : parsed;
}

export function getEquifaxSection(html: string, sectionH1Regex: RegExp): string | null {
  const match = html.match(sectionH1Regex);
  if (!match) return null;
  const startIndex = match.index!;
  const nextH1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  nextH1Regex.lastIndex = startIndex + match[0].length;
  const nextH1 = nextH1Regex.exec(html);
  if (nextH1) {
    return html.substring(startIndex, nextH1.index);
  }
  return html.substring(startIndex);
}

export function cleanPageBreaks(html: string): string {
  return html
    .replace(/<hr\s*\/?>/gi, "")
    .replace(/<h2[^>]*>\s*Page\s+\d+\s*<\/h2>\s*(?:<p[^>]*>(?:(?!<\/p>)[\s\S])*?(?:EQUIFAX|Credit Report)(?:(?!<\/p>)[\s\S])*?<\/p>\s*)*/gi, "");
}

export function parseEqPersonalInfo(html: string) {
  const section = getEquifaxSection(html, /<h1[^>]*>\s*Personal Info(?:rmation)?\s*<\/h1>/i);
  if (!section) return null;

  const tables = parseAllTables(section);
  const result: any = {
    surname: null,
    givenNames: null,
    middleName: null,
    birthDate: null,
    socialInsuranceNo: null,
    telephones: [],
    addresses: [],
    employers: [],
  };

  for (const table of tables) {
    if (table.length === 0) continue;
    
    const headerStr = table[0].join(" ").toLowerCase();

    // Detect Employment Table specifically
    if (headerStr.includes("employer")) {
      for (let r = 1; r < table.length; r++) {
        if (table[r].length >= 2) {
          result.employers.push({ type: table[r][0], employerName: table[r][1] });
        }
      }
      continue;
    }

    // Flatten rows
    for (let r = 0; r < table.length; r++) {
      const row = table[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c].trim();
        const nextCell = row[c + 1]?.trim() || "";

        if (cell.toLowerCase() === "current name" && nextCell) {
          const parts = nextCell.split(/\s+/);
          result.givenNames = parts[0] || null;
          result.middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : null;
          result.surname = parts.length > 1 ? parts[parts.length - 1] : null;
        } else if (cell.toLowerCase() === "date of birth") {
          const datePattern = /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/i;
          if (nextCell && datePattern.test(nextCell.replace(/xx/gi, "00"))) {
            result.birthDate = nextCell;
          } else {
            // Fallback: Date of Birth value might be in the next row at the same column index
            const nextRowCell = table[r + 1]?.[c]?.trim();
            if (nextRowCell && datePattern.test(nextRowCell.replace(/xx/gi, "00"))) {
              result.birthDate = nextRowCell;
            }
          }
        } else if (cell.toLowerCase() === "social insurance number") {
          const sinRegex = /^[\dxX]{3}[\/\-]?[\dxX]{3}[\/\-]?[\dxX]{3}$/i;
          if (nextCell && sinRegex.test(nextCell)) {
            result.socialInsuranceNo = nextCell;
          } else {
            const nextRowCell = table[r + 1]?.[c]?.trim();
            if (nextRowCell && sinRegex.test(nextRowCell)) {
              result.socialInsuranceNo = nextRowCell;
            }
          }
        }
      }

      // Detect Phone Table
      if (row.length >= 2 && ["home", "cell", "work"].includes(row[0].toLowerCase()) && /[\d\-\.]+/.test(row[1])) {
        const t = row[0].charAt(0).toUpperCase() + row[0].slice(1).toLowerCase();
        result.telephones.push({ type: t, number: row[1] });
      }

      // Detect Address Table (horizontal layout: Type, Last Reported Date, Address, City, Province, Postal Code)
      if (row.length >= 5 && ["current", "previous"].includes(row[0].toLowerCase())) {
        result.addresses.push({
          type: row[0],
          reportedDate: row[1],
          address: row[2],
          city: row[3],
          province: row[4],
          postalCode: row[5],
        });
      } else if (row.length >= 2 && row.length < 5 && ["current", "previous"].includes(row[0].toLowerCase())) {
        // Fallback for Employment rows labeled "Current" / "Previous" that aren't wide enough for addresses
        if (row[1] && !row[1].match(/^\d{4}[\/\-]/)) {
          result.employers.push({ type: row[0], employerName: row[1] });
        }
      }
    }
  }

  // Also check for <h2>Employment</h2> standalone within personal info
  const employmentMatch = section.match(/<h2[^>]*>\s*Employment(?:s)?\s*<\/h2>([\s\S]*?)(?:<h2|$)/i);
  if (employmentMatch) {
    const empTables = parseAllTables(employmentMatch[1]);
    for (const et of empTables) {
      for (let r = 1; r < et.length; r++) {
        if (et[r].length >= 2) {
          result.employers.push({ type: et[r][0], employerName: et[r][1] });
        }
      }
    }
  }

  const uniqueEmployers = new Map();
  for (const emp of result.employers) {
    if (emp && emp.employerName) {
      if (!uniqueEmployers.has(emp.employerName)) {
        uniqueEmployers.set(emp.employerName, emp);
      }
    }
  }
  result.employers = Array.from(uniqueEmployers.values());

  return result;
}

export function parseEqCreditScore(html: string) {
  const section = getEquifaxSection(html, /<h1[^>]*>\s*Credit Score\s*<\/h1>/i);
  if (!section) return null;

  let score = null;
  let date = null;

  const scoreMatch = section.match(/Equifax Credit Score(?:<br\s*\/?>)\s*(\d{3})/i);
  if (scoreMatch) score = parseInt(scoreMatch[1], 10);

  const dateMatch = section.match(/as of\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
  if (dateMatch) date = dateMatch[1];

  return { score, date };
}

export function parseSingleEqAccount(creditorName: string, html: string, accountType: string) {
  const tables = parseAllTables(html);
  if (tables.length === 0) return null;

  let accountNumber = null;
  let balance = null;
  let creditLimit = null;
  let highCredit = null;
  let pastDue = null;
  let status = null;
  let creditorPhone = null;
  let notes = null;
  let memberNumber = null;
  let ratingCode = null;
  let ratingCodeDescription = null;
  let amountWrittenOff = null;
  let delinquencyDates: string[] = [];
  let dateOpened = null;
  let dateReported = null;
  let lastPaymentDate = null;
  let dateClosed = null;
  let paymentHistoryDetails: any[] = [];
  let monthsReviewed = null;
  let lastActivityDate = null;
  let chargeOffDate = null;
  let terms = null;
  let responsibilityCode = null;
  let paymentHistoryProfile = null;

  const rawText = parseHtmlToRawText(html);

  const lastActivityMatch = rawText.match(/(?:Last Activity|Date of Last Activity)\s*:?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
  if (lastActivityMatch) lastActivityDate = lastActivityMatch[1];

  const chargeOffMatch = rawText.match(/(?:Charge Off|Written Off|Date Written Off)\s*:?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
  if (chargeOffMatch) chargeOffDate = chargeOffMatch[1];

  const termsMatch = rawText.match(/Terms\s*:?\s*([A-Za-z0-9\s]+?)(?:$|\n| {2,})/i);
  if (termsMatch) terms = termsMatch[1].trim();

  const respMatch = rawText.match(/Responsibility\s*:?\s*([A-Za-z\s]+?)(?:$|\n| {2,})/i);
  if (respMatch) responsibilityCode = respMatch[1].trim();

  const phpMatch = rawText.match(/Payment History\s*:?\s*([0-9cxo\-]+)/i);
  if (phpMatch) paymentHistoryProfile = phpMatch[1];

  const delinquenciesMatch = rawText.match(/Delinquencies\s*:?([\s\S]*?)(?:$|Account Numbers|Months Reviewed)/i);
  if (delinquenciesMatch) {
    const dates = delinquenciesMatch[1].match(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/g);
    if (dates) delinquencyDates = dates;
  }

  for (const table of tables) {
    if (table.length === 0) continue;
    const headerStr = table[0].join(" ").toLowerCase();

    if (headerStr.includes("account number") && headerStr.includes("rating code")) {
      // Overview table
      const mapped = mapTableRows(table, {
        "Account Number": "accountNumber",
        "Phone": "creditorPhone",
        "Notes": "notes",
        "Member Number": "memberNumber",
        "High Credit": "highCredit",
        "Highest Balance": "highestBalance",
        "Rating Code": "ratingCode",
        "Rating Code Description": "ratingCodeDescription",
        "Status": "status"
      });
      if (mapped.length > 0) {
        const m = mapped[0] as any;
        if (m.accountNumber) accountNumber = m.accountNumber;
        if (m.creditorPhone) creditorPhone = m.creditorPhone;
        if (m.notes) notes = m.notes;
        if (m.memberNumber) memberNumber = m.memberNumber;
        if (m.highCredit || m.highestBalance) highCredit = parseNumericAmount(m.highCredit || m.highestBalance);
        if (m.ratingCode) ratingCode = m.ratingCode;
        if (m.ratingCodeDescription) ratingCodeDescription = m.ratingCodeDescription;
        if (m.status || m.ratingCode) status = m.status || m.ratingCode;
      }
    } else if (headerStr.includes("balance") && headerStr.includes("account dates")) {
      // Balance and Amounts table
      for (let r = 0; r < table.length; r++) {
        const row = table[r];
        if (r === 1 && row.length > 0) {
          const firstCell = row[0].trim();
          const bareDollarMatch = firstCell.match(/^\$?([\d,]+)$/);
          if (bareDollarMatch && balance === null) {
            balance = parseFloat(bareDollarMatch[1].replace(/,/g, ""));
          }
        }
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          const nextCell = row[c + 1] || "";

          const matchNum = cell.match(/(?:Balance|Limit|Past Due|Written Off|Payment).*?\$?(N\/A|[\d,]+\.\d{2}|[\d,]+)/i) || nextCell.match(/^\$?(N\/A|[\d,]+\.\d{2}|[\d,]+)/i);
          if (cell.toLowerCase().includes("balance") && !cell.toLowerCase().includes("highest")) balance = matchNum ? parseNumericAmount(matchNum[1]) : null;
          if (cell.toLowerCase().includes("credit limit")) creditLimit = matchNum ? parseNumericAmount(matchNum[1]) : null;
          if (cell.toLowerCase().includes("past due")) pastDue = matchNum ? parseNumericAmount(matchNum[1]) : null;
          if (cell.toLowerCase().includes("amount written off") || cell.toLowerCase().includes("written off")) amountWrittenOff = matchNum ? parseNumericAmount(matchNum[1]) : amountWrittenOff;

          const matchDate = cell.match(/(?:Opened|Reported|Payment|Closed|Activity|Written Off).*?(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i) || nextCell.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
          if (cell.toLowerCase().includes("opened")) dateOpened = matchDate ? matchDate[1] : null;
          if (cell.toLowerCase().includes("reported")) dateReported = matchDate ? matchDate[1] : null;
          if (cell.toLowerCase().includes("last payment")) lastPaymentDate = matchDate ? matchDate[1] : null;
          if (cell.toLowerCase().includes("closed")) dateClosed = matchDate ? matchDate[1] : null;
          if (cell.toLowerCase().includes("activity") && !lastActivityDate) lastActivityDate = matchDate ? matchDate[1] : null;
          if ((cell.toLowerCase().includes("written off") || cell.toLowerCase().includes("charge off")) && !chargeOffDate) chargeOffDate = matchDate ? matchDate[1] : null;
        }
      }
    } else if (headerStr.includes("months reviewed")) {
      // Payment details
      if (table.length > 1 && table[1].length > 0) {
        monthsReviewed = table[1][0];
      }
    } else if (headerStr.includes("month") && headerStr.includes("balance") && headerStr.includes("past due")) {
      // Payment History table
      const mapped = mapTableRows(table, {
        "Month": "date",
        "Balance": "balance",
        "Credit Limit": "creditLimit",
        "High Credit": "highCredit",
        "Past Due": "pastDue",
        "Payment": "payment"
      });
      paymentHistoryDetails.push(...mapped.map((m: any) => ({
        date: m.date,
        balance: parseNumericAmount(m.balance),
        creditLimit: parseNumericAmount(m.creditLimit),
        highCredit: parseNumericAmount(m.highCredit),
        pastDue: parseNumericAmount(m.pastDue),
        payment: parseNumericAmount(m.payment),
      })));
    }
  }

  // Fallback: extract from table cells in vertical/adjacent layout
  for (const table of tables) {
    for (let r = 0; r < table.length; r++) {
      const row = table[r];
      for (let c = 0; c < row.length; c++) {
        const rawCell = row[c].trim();
        const cell = rawCell.toLowerCase();

        // 1. Inline checks
        if (cell.startsWith("balance ") && balance === null) {
          const m = rawCell.match(/Balance\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
          if (m) balance = parseNumericAmount(m[1]);
        }
        if (cell.startsWith("credit limit ") && creditLimit === null) {
          const m = rawCell.match(/Credit Limit\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
          if (m) creditLimit = parseNumericAmount(m[1]);
        }
        if ((cell.startsWith("highest balance ") || cell.startsWith("high credit ")) && highCredit === null) {
          const m = rawCell.match(/(?:Highest Balance|High Credit)\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
          if (m) highCredit = parseNumericAmount(m[1]);
        }
        if (cell.startsWith("past due ") && pastDue === null) {
          const m = rawCell.match(/Past Due\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
          if (m) pastDue = parseNumericAmount(m[1]);
        }
        if (cell.startsWith("amount written off ") && amountWrittenOff === null) {
          const m = rawCell.match(/Amount Written Off\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
          if (m) amountWrittenOff = parseNumericAmount(m[1]);
        }
        if (cell.startsWith("opened ") && dateOpened === null) {
          const m = rawCell.match(/Opened\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
          if (m) dateOpened = m[1];
        }
        if (cell.startsWith("reported ") && dateReported === null) {
          const m = rawCell.match(/Reported\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
          if (m) dateReported = m[1];
        }
        if (cell.startsWith("last payment ") && lastPaymentDate === null) {
          const m = rawCell.match(/Last Payment\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
          if (m) lastPaymentDate = m[1];
        }
        if (cell.startsWith("closed ") && dateClosed === null) {
          const m = rawCell.match(/Closed\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
          if (m) dateClosed = m[1];
        }
        if (cell.startsWith("last activity ") && lastActivityDate === null) {
          const m = rawCell.match(/Last Activity\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
          if (m) lastActivityDate = m[1];
        }

        let nextVal = row[c + 1]?.trim();
        if (!nextVal && table[r + 1]) {
          nextVal = table[r + 1][c]?.trim();
        }

        if (!nextVal) continue;

        if (cell === "balance" && balance === null) {
          const m = nextVal.match(/^\$?(N\/A|[\d,]+(?:\.\d{2})?)$/i);
          if (m) balance = parseNumericAmount(m[1]);
        }
        if (cell === "credit limit" && creditLimit === null) {
          const m = nextVal.match(/^\$?(N\/A|[\d,]+(?:\.\d{2})?)$/i);
          if (m) creditLimit = parseNumericAmount(m[1]);
        }
        if ((cell === "highest balance" || cell === "high credit") && highCredit === null) {
          const m = nextVal.match(/^\$?(N\/A|[\d,]+(?:\.\d{2})?)$/i);
          if (m) highCredit = parseNumericAmount(m[1]);
        }
        if (cell === "past due" && pastDue === null) {
          const m = nextVal.match(/^\$?(N\/A|[\d,]+(?:\.\d{2})?)$/i);
          if (m) pastDue = parseNumericAmount(m[1]);
        }
        if (cell === "amount written off" && amountWrittenOff === null) {
          const m = nextVal.match(/^\$?(N\/A|[\d,]+(?:\.\d{2})?)$/i);
          if (m) amountWrittenOff = parseNumericAmount(m[1]);
        }
        if (cell === "opened" && dateOpened === null) {
          const m = nextVal.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})$/);
          if (m) dateOpened = m[1];
        }
        if (cell === "reported" && dateReported === null) {
          const m = nextVal.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})$/);
          if (m) dateReported = m[1];
        }
        if (cell === "last payment" && lastPaymentDate === null) {
          const m = nextVal.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})$/);
          if (m) lastPaymentDate = m[1];
        }
        if (cell === "closed" && dateClosed === null) {
          const m = nextVal.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})$/);
          if (m) dateClosed = m[1];
        }
      }
    }
  }

  // Fallback: extract from rawText (e.g., "Balance \n $248")
  if (balance === null) {
    const m = rawText.match(/Balance\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
    if (m) balance = parseNumericAmount(m[1]);
  }
  if (creditLimit === null) {
    const m = rawText.match(/Credit Limit\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
    if (m) creditLimit = parseNumericAmount(m[1]);
  }
  if (highCredit === null) {
    const m = rawText.match(/(?:High Credit|Highest Balance)\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
    if (m) highCredit = parseNumericAmount(m[1]);
  }
  if (pastDue === null) {
    const m = rawText.match(/Past Due\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
    if (m) pastDue = parseNumericAmount(m[1]);
  }
  if (amountWrittenOff === null) {
    const m = rawText.match(/Amount Written Off\s+\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
    if (m) amountWrittenOff = parseNumericAmount(m[1]);
  }
  if (dateOpened === null) {
    const m = rawText.match(/Opened\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
    if (m) dateOpened = m[1];
  }
  if (dateReported === null) {
    const m = rawText.match(/Reported\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
    if (m) dateReported = m[1];
  }
  if (lastPaymentDate === null) {
    const m = rawText.match(/Last Payment\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
    if (m) lastPaymentDate = m[1];
  }
  if (dateClosed === null) {
    const m = rawText.match(/Closed\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
    if (m) dateClosed = m[1];
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

  return {
    creditorName,
    sourceText: rawText,
    accountType,
    accountNumber,
    balance,
    creditLimit,
    highCredit,
    pastDue,
    status,
    dateOpened,
    dateReported,
    dateClosed,
    lastPaymentDate,
    lastActivityDate,
    creditorPhone,
    notes,
    memberNumber,
    ratingCode,
    ratingCodeDescription,
    amountWrittenOff,
    delinquencyDates,
    chargeOffDate,
    terms,
    responsibilityCode,
    paymentHistoryProfile,
    monthsReviewed,
    paymentHistoryDetails: paymentHistoryDetails.length > 0 ? paymentHistoryDetails : null,
  };
}

export function parseEqAccounts(html: string) {
  const tradelines: any[] = [];
  const accountTypes = [
    { type: "Revolving", regex: /<h1[^>]*>\s*Accounts\s*-\s*Revolving\s*<\/h1>/i },
    { type: "Open", regex: /<h1[^>]*>\s*Accounts\s*-\s*Open\s*<\/h1>/i },
    { type: "Mortgage", regex: /<h1[^>]*>\s*Accounts\s*-\s*Mortgage\s*<\/h1>/i },
    { type: "Installment", regex: /<h1[^>]*>\s*Accounts\s*-\s*Installment\s*<\/h1>/i }
  ];

  for (const accType of accountTypes) {
    let sectionHtml = getEquifaxSection(html, accType.regex);
    if (!sectionHtml) continue;

    sectionHtml = cleanPageBreaks(sectionHtml);

    const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    let match;
    let creditors: { name: string; html: string }[] = [];
    let lastIndex = -1;
    let lastName = "";

    while ((match = h2Regex.exec(sectionHtml)) !== null) {
      if (lastIndex !== -1) {
        creditors.push({ name: lastName, html: sectionHtml.substring(lastIndex, match.index) });
      }
      lastName = match[1].replace(/<[^>]*>/g, '').trim();
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex !== -1) {
      creditors.push({ name: lastName, html: sectionHtml.substring(lastIndex) });
    }

    for (const cred of creditors) {
      if (/^Page\s+\d+$/i.test(cred.name)) continue;
      const acc = parseSingleEqAccount(cred.name, cred.html, accType.type);
      if (acc) tradelines.push(acc);
    }
  }

  if (tradelines.length === 0) {
    let sectionHtml = getEquifaxSection(html, /<h1[^>]*>\s*Accounts\s*<\/h1>/i);
    if (sectionHtml) {
      sectionHtml = cleanPageBreaks(sectionHtml);
      const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
      let match;
      let creditors: { name: string; html: string }[] = [];
      let lastIndex = -1;
      let lastName = "";

      while ((match = h2Regex.exec(sectionHtml)) !== null) {
        if (lastIndex !== -1) {
          creditors.push({ name: lastName, html: sectionHtml.substring(lastIndex, match.index) });
        }
        lastName = match[1].replace(/<[^>]*>/g, '').trim();
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex !== -1) {
        creditors.push({ name: lastName, html: sectionHtml.substring(lastIndex) });
      }

      for (const cred of creditors) {
        if (/^Page\s+\d+$/i.test(cred.name)) continue;
        const acc = parseSingleEqAccount(cred.name, cred.html, "Unknown");
        if (acc) tradelines.push(acc);
      }
    }
  }

  return tradelines;
}

export function parseEqCollections(html: string) {
  let sectionHtml = getEquifaxSection(html, /<h1[^>]*>\s*Collections\s*<\/h1>/i);
  if (!sectionHtml) return [];

  sectionHtml = cleanPageBreaks(sectionHtml);

  const collections: any[] = [];
  const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let match;
  let creditors: { name: string; html: string }[] = [];
  let lastIndex = -1;
  let lastName = "";

  while ((match = h2Regex.exec(sectionHtml)) !== null) {
    if (lastIndex !== -1) {
      creditors.push({ name: lastName, html: sectionHtml.substring(lastIndex, match.index) });
    }
    lastName = match[1].replace(/<[^>]*>/g, '').trim();
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex !== -1) {
    creditors.push({ name: lastName, html: sectionHtml.substring(lastIndex) });
  }

  for (const cred of creditors) {
    if (/^Page\s+\d+$/i.test(cred.name)) continue;
    
    const tables = parseAllTables(cred.html);
    let colDetails: any = { 
      collectionAgencyName: cred.name, 
      accountType: "Collection", 
      isCollectionAccount: true 
    };
    
    let memberName = null;
    let memberNumber = null;
    let status = null;

    if (tables.length > 0) {
      for (const row of tables[0]) {
        if (row.length >= 2) {
          const key = row[0].toLowerCase().replace(/[^a-z0-9]/g, "");
          const val = row[1];
          if (key.includes("dateassigned")) {
            colDetails.dateOpened = val;
            colDetails.dateAssignedToCollection = val;
          }
          if (key.includes("datereported") || key.includes("lastreported")) {
            const m = val.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
            colDetails.dateReported = m ? m[1] : val;
          }
          if (key.includes("accountnumber")) colDetails.accountNumber = val;
          if (key.includes("amount")) colDetails.highCredit = parseNumericAmount(val);
          if (key.includes("balance")) colDetails.balance = parseNumericAmount(val);
          if (key.includes("lastpaymentdate")) colDetails.lastPaymentDate = val;
          if (key.includes("firstdelinquency")) colDetails.firstDelinquencyDate = val;
          if (key.includes("membername")) memberName = val;
          if (key.includes("membernumber")) memberNumber = val;
          if (key.includes("ratingcode") || key.includes("status")) status = val;
          
          if (key.includes("dateverified")) colDetails.dateVerified = val;
          if (key.includes("datepaid") || key.includes("datesettled")) colDetails.datePaidSettled = val;
          if (key.includes("narrative")) colDetails.narrative = val;
          if (key.includes("phonenumber")) colDetails.phoneNumber = val;
        }
      }
    }
    
    if (colDetails.balance === undefined && colDetails.highCredit !== undefined) {
      colDetails.balance = colDetails.highCredit;
    }

    colDetails.sourceText = parseHtmlToRawText(cred.html);
    colDetails.creditorName = cred.name;
    colDetails.originalCreditorName = memberName || undefined;
    colDetails.status = status || "Collection";
    colDetails.memberNumber = memberNumber || null;
    if (memberName) {
      colDetails.memberName = memberName;
    }

    collections.push(colDetails);
  }

  return collections;
}

export function parseEqConsumerStatements(html: string) {
  let sectionHtml = getEquifaxSection(html, /<h1[^>]*>\s*Consumer Statement(?:s)?\s*<\/h1>/i);
  if (!sectionHtml) return [];

  sectionHtml = cleanPageBreaks(sectionHtml);
  let rawText = parseHtmlToRawText(sectionHtml).replace(/^Consumer Statements?\s*/i, "").trim();
  
  if (!rawText) return [];

  return [{
    statementText: rawText,
    statementType: "general_statement",
    rawSectionText: sectionHtml,
  }];
}

export function parseEqEmployment(html: string) {
  const sectionHtml = getEquifaxSection(html, /<h1[^>]*>\s*Employment(?:s)?\s*<\/h1>/i);
  if (!sectionHtml) return [];

  const tables = parseAllTables(sectionHtml);
  if (tables.length === 0) return [];

  const results: any[] = [];
  for (const table of tables) {
    const mapped = mapTableRows(table, {
      "Type": "type",
      "Employer Name": "employerName"
    });
    results.push(...mapped.map((m: any) => ({
      type: m.type,
      employerName: m.employerName
    })));
  }
  return results;
}

export function parseEqInquiries(html: string) {
  const sectionHtml = getEquifaxSection(html, /<h1[^>]*>\s*Inquiries\s*<\/h1>/i);
  if (!sectionHtml) return [];

  const tables = parseAllTables(sectionHtml);
  if (tables.length === 0) return [];

  return mapTableRows(tables[0], {
    "Date": "date",
    "Member Name": "creditorName",
    "Phone": "telephone",
    "May Affect Scores": "mayAffectScores"
  }).map((row: any) => ({
    date: row.date,
    creditorName: row.creditorName,
    telephone: row.telephone,
    type: row.mayAffectScores?.toLowerCase() === "yes" ? "Hard" : "Soft",
  }));
}