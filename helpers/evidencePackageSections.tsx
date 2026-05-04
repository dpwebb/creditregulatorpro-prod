import { Content, TDocumentDefinitions, PageBreak } from "pdfmake/interfaces";
import { format } from "./dateUtils";
import { EvidencePackageData } from "./evidencePackageData";

/**
 * Reusable page break constant for type safety
 */
const pageBreakAfter: Content = { text: "", pageBreak: "after" as PageBreak };

const formatOrNA = (value: Date | string | null | undefined, pattern: string): string => {
  if (!value) return "N/A";
  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "N/A" : format(parsedDate, pattern);
};

const shortenOrNA = (value: string | null | undefined, maxLength: number): string => {
  if (!value) return "N/A";
  return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
};

/**
 * Generates the cover page section
 */
export const generateCoverPage = (data: EvidencePackageData): Content[] => {
  return [
    {
      text: "Evidence Package",
      style: "coverTitle",
      alignment: "center",
      margin: [0, 80, 0, 10] as [number, number, number, number],
    },
    {
      text: "Case Documentation",
      style: "coverSubtitle",
      alignment: "center",
      margin: [0, 0, 0, 40] as [number, number, number, number],
    },
    {
      canvas: [
        {
          type: "rect",
          x: 0,
          y: 0,
          w: 515,
          h: 60,
          r: 5,
          color: "#f8f9fa",
        },
      ],
    },
    {
      text: "CONFIDENTIAL - LEGAL PRIVILEGE ASSERTED",
      style: "watermark",
      alignment: "center",
      color: "#dc3545",
      margin: [0, -45, 0, 0] as [number, number, number, number],
    },
    {
      table: {
        widths: ["35%", "65%"],
        body: [
          [
            { text: "Case Reference ID:", bold: true },
            data.obligation.id.toString(),
          ],
          [
            { text: "Account Number:", bold: true },
            data.obligation.accountNumber,
          ],
          [{ text: "Creditor:", bold: true }, { text: data.obligation.creditorName || "N/A" }],
          [{ text: "Bureau:", bold: true }, data.obligation.bureauName || "N/A"],
          [
            { text: "Generation Date/Time:", bold: true },
            format(new Date(), "yyyy-MM-dd HH:mm:ss zzz"),
          ],
        ],
      },
      layout: "noBorders",
      margin: [50, 50, 50, 20] as [number, number, number, number],
    },
    {
      text: "\n\nThis document is prepared for legal proceedings and contains privileged information protected under attorney-client privilege.",
      style: "disclaimer",
      alignment: "center",
      margin: [40, 50, 40, 0] as [number, number, number, number],
    },
    pageBreakAfter,
  ];
};

/**
 * Generates executive summary section
 */
export const generateExecutiveSummary = (data: EvidencePackageData): Content[] => {
  const challengeRows = data.packets.map((packet) => [
    formatOrNA(packet.createdAt, "yyyy-MM-dd"),
    packet.type || "N/A",
    packet.status || "Pending",
    packet.bureauResponseDate
      ? formatOrNA(packet.bureauResponseDate, "yyyy-MM-dd")
      : "No response",
  ]);

  return [
    { text: "Executive Summary", style: "sectionHeader" },
    {
      table: {
        widths: ["25%", "75%"],
        body: [
          [
            { text: "Current Status:", bold: true },
            data.obligation.state || "Unknown",
          ],
          [
            { text: "Days Since Initial Challenge:", bold: true },
            data.daysSinceChallenge.toString(),
          ],
          [
            { text: "Total Escalations:", bold: true },
            data.escalationCount.toString(),
          ],
          [
            { text: "Challenge Vector:", bold: true },
            data.obligation.disputeVector || "N/A",
          ],
        ],
      },
      layout: "lightHorizontalLines",
      margin: [0, 10, 0, 20] as [number, number, number, number],
    },
    { text: "Challenge Timeline", style: "subsectionHeader" },
    challengeRows.length > 0
      ? {
          table: {
            headerRows: 1,
            widths: ["25%", "25%", "25%", "25%"],
            body: [
              [
                { text: "Date Sent", style: "tableHeader" },
                { text: "Type", style: "tableHeader" },
                { text: "Status", style: "tableHeader" },
                { text: "Response Date", style: "tableHeader" },
              ],
              ...challengeRows,
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 5, 0, 20] as [number, number, number, number],
        }
      : { text: "No challenges recorded.", italics: true, margin: [0, 5, 0, 20] as [number, number, number, number] },
    { text: "Creditor Compliance Record", style: "subsectionHeader" },
    data.creditorMetrics.length > 0
      ? {
          table: {
            headerRows: 1,
            widths: ["25%", "25%", "25%", "25%"],
            body: [
              [
                { text: "Outcome", style: "tableHeader" },
                { text: "Response Time (Days)", style: "tableHeader" },
                { text: "Escalations", style: "tableHeader" },
                { text: "Final State", style: "tableHeader" },
              ],
              ...data.creditorMetrics.map((m) => [
                m.outcome,
                m.responseTimeDays?.toString() || "N/A",
                m.escalationCount?.toString() || "0",
                m.finalState || "N/A",
              ]),
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 5, 0, 20] as [number, number, number, number],
        }
      : {
          text: "No historical compliance data available.",
          italics: true,
          margin: [0, 5, 0, 20] as [number, number, number, number],
        },
    pageBreakAfter,
  ];
};

/**
 * Generates chain of custody section
 */
export const generateChainOfCustody = (data: EvidencePackageData): Content[] => {
  const auditRows = data.auditLogs.map((log) => [
    format(log.timestamp, "yyyy-MM-dd HH:mm:ss"),
    log.actionType,
    log.userId?.toString() || "System",
    log.ipAddress || "N/A",
    JSON.stringify(log.details || {}).substring(0, 80),
  ]);

  const eventRows = data.evidenceEvents.map((evt) => [
    format(evt.at || new Date(), "yyyy-MM-dd HH:mm:ss"),
    evt.eventType,
    evt.description?.substring(0, 100) || "N/A",
    evt.currentHash?.substring(0, 16) || "N/A",
    evt.previousHash?.substring(0, 16) || "N/A",
  ]);

  return [
    { text: "Chain of Custody", style: "sectionHeader" },
    {
      text: "All actions and modifications to this case are logged below to ensure document integrity and establish a verifiable chain of custody for court proceedings.",
      margin: [0, 5, 0, 15] as [number, number, number, number],
    },
    { text: "Audit Log", style: "subsectionHeader" },
    auditRows.length > 0
      ? {
          table: {
            headerRows: 1,
            widths: ["15%", "15%", "10%", "15%", "45%"],
            body: [
              [
                { text: "Timestamp", style: "tableHeader" },
                { text: "Action", style: "tableHeader" },
                { text: "User ID", style: "tableHeader" },
                { text: "IP Address", style: "tableHeader" },
                { text: "Details", style: "tableHeader" },
              ],
              ...auditRows,
            ],
          },
          layout: "lightHorizontalLines",
          fontSize: 8,
          margin: [0, 5, 0, 20] as [number, number, number, number],
        }
      : { text: "No audit logs found.", italics: true, margin: [0, 5, 0, 20] as [number, number, number, number] },
    { text: "Evidence Event Chain (Hash Verification)", style: "subsectionHeader" },
    {
      text: "Hash values prove document integrity and prevent tampering.",
      fontSize: 9,
      margin: [0, 5, 0, 10] as [number, number, number, number],
    },
    eventRows.length > 0
      ? {
          table: {
            headerRows: 1,
            widths: ["15%", "20%", "30%", "17.5%", "17.5%"],
            body: [
              [
                { text: "Timestamp", style: "tableHeader" },
                { text: "Event Type", style: "tableHeader" },
                { text: "Description", style: "tableHeader" },
                { text: "Current Hash", style: "tableHeader" },
                { text: "Previous Hash", style: "tableHeader" },
              ],
              ...eventRows,
            ],
          },
          layout: "lightHorizontalLines",
          fontSize: 8,
          margin: [0, 5, 0, 20] as [number, number, number, number],
        }
      : {
          text: "No evidence events recorded.",
          italics: true,
          margin: [0, 5, 0, 20] as [number, number, number, number],
        },
    pageBreakAfter,
  ];
};

/**
 * Generates challenge documentation section
 */
export const generateChallengeDocumentation = (data: EvidencePackageData): Content[] => {
  const packetRows = data.packets.map((packet) => [
    packet.id.toString(),
    formatOrNA(packet.createdAt, "yyyy-MM-dd"),
    packet.type || "N/A",
    packet.statuteCode || "N/A",
    packet.status || "Pending",
    packet.responseType || "None",
  ]);

  return [
    { text: "Challenge Documentation", style: "sectionHeader" },
    {
      text: "All formal dispute packets and communications sent to bureaus and creditors.",
      margin: [0, 5, 0, 15] as [number, number, number, number],
    },
    packetRows.length > 0
      ? {
          table: {
            headerRows: 1,
            widths: ["8%", "15%", "15%", "20%", "15%", "27%"],
            body: [
              [
                { text: "Packet ID", style: "tableHeader" },
                { text: "Date Sent", style: "tableHeader" },
                { text: "Type", style: "tableHeader" },
                { text: "Statute Ref", style: "tableHeader" },
                { text: "Status", style: "tableHeader" },
                { text: "Response", style: "tableHeader" },
              ],
              ...packetRows,
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 5, 0, 20] as [number, number, number, number],
        }
      : { text: "No packets generated yet.", italics: true, margin: [0, 5, 0, 20] as [number, number, number, number] },
    pageBreakAfter,
  ];
};

/**
 * Generates evidence attachments index section
 */
export const generateEvidenceAttachmentsIndex = (
  data: EvidencePackageData
): Content[] => {
  const attachmentRows = data.attachments.map((att) => [
    att.fileName,
    formatOrNA(att.uploadedAt, "yyyy-MM-dd HH:mm"),
    (att.fileSizeBytes / 1024).toFixed(2) + " KB",
    att.description || "No description",
    shortenOrNA(att.storageUrl, 40),
  ]);

  return [
    { text: "Evidence Attachments Index", style: "sectionHeader" },
    {
      text: "List of all files and documents attached to this case. Actual files are available separately or can be embedded if base64 data is available.",
      margin: [0, 5, 0, 15] as [number, number, number, number],
    },
    attachmentRows.length > 0
      ? {
          table: {
            headerRows: 1,
            widths: ["20%", "15%", "12%", "30%", "23%"],
            body: [
              [
                { text: "File Name", style: "tableHeader" },
                { text: "Upload Date", style: "tableHeader" },
                { text: "Size", style: "tableHeader" },
                { text: "Description", style: "tableHeader" },
                { text: "Storage Location", style: "tableHeader" },
              ],
              ...attachmentRows,
            ],
          },
          layout: "lightHorizontalLines",
          fontSize: 9,
          margin: [0, 5, 0, 20] as [number, number, number, number],
        }
      : {
          text: "No evidence attachments found.",
          italics: true,
          margin: [0, 5, 0, 20] as [number, number, number, number],
        },
    pageBreakAfter,
  ];
};

/**
 * Generates statutory references section
 */
export const generateStatutoryReferences = (data: EvidencePackageData): Content[] => {
  const statuteItems: Content[] = data.statutes.flatMap((statute) => {
    const nodes: Content[] = [
      {
        text: `${statute.code} - ${statute.jurisdiction}`,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      },
      {
        text: `Section: ${statute.sectionReference || "N/A"}`,
        margin: [10, 0, 0, 3] as [number, number, number, number],
      },
      {
        text: `Description: ${statute.description || "N/A"}`,
        margin: [10, 0, 0, 3] as [number, number, number, number],
      },
      {
        text: `Effective Date: ${formatOrNA(statute.effectiveDate, "yyyy-MM-dd")}`,
        margin: [10, 0, 0, 3] as [number, number, number, number],
      },
      {
        text: `Response Clock: ${statute.responseClockDays || "N/A"} days`,
        margin: [10, 0, 0, 3] as [number, number, number, number],
      },
    ];
    
    if (statute.sourceUrl) {
      nodes.push({
        text: `Source: ${statute.sourceUrl}`,
        link: statute.sourceUrl,
        color: "blue",
        decoration: "underline",
        margin: [10, 0, 0, 10] as [number, number, number, number],
      });
    } else {
      nodes.push({ text: "", margin: [0, 0, 0, 10] as [number, number, number, number] });
    }
    
    return nodes;
  });

  return [
    { text: "Statutory References", style: "sectionHeader" },
    {
      text: "Complete statutory authority and references cited in all challenges.",
      margin: [0, 5, 0, 15] as [number, number, number, number],
    },
    ...(data.statutes.length > 0
      ? statuteItems
      : [{ text: "No statute references found.", italics: true }]),
    pageBreakAfter,
  ];
};

/**
 * Generates appendices section
 */
export const generateAppendices = (): Content[] => {
  return [
    { text: "Appendices", style: "sectionHeader" },
    { text: "A. Glossary of Terms", style: "subsectionHeader", margin: [0, 10, 0, 10] as [number, number, number, number] },
    {
      ul: [
        {
          text: "Provincial CRA: Provincial Consumer Reporting Acts - Laws regulating credit reporting agencies and creditors.",
        },
        {
          text: "Metro2: Industry-standard format for reporting consumer credit information to credit bureaus.",
        },
        {
          text: "Creditor: Entity that provides (furnishes) consumer credit information to credit bureaus.",
        },
        {
          text: "Tradeline: Individual credit account record on a credit report.",
        },
        {
          text: "DOFD: Date of First Delinquency - Critical date for credit reporting compliance.",
        },
        {
          text: "Procedural Exhaustion: Legal requirement to complete all administrative remedies before litigation.",
        },
      ],
      margin: [0, 0, 0, 20] as [number, number, number, number],
    },
    {
      text: "B. Procedural Exhaustion Criteria",
      style: "subsectionHeader",
      margin: [0, 10, 0, 10] as [number, number, number, number],
    },
    {
      text: "To establish procedural exhaustion for litigation:",
      margin: [0, 0, 0, 5] as [number, number, number, number],
    },
    {
      ol: [
        "Initial dispute filed with credit bureau",
        "Bureau investigation completed (30-45 days)",
        "If unresolved, direct dispute with creditor",
        "Creditor investigation period expired (30 days)",
        "All reasonable remedies attempted",
        "Documentation of all communications and responses",
      ],
      margin: [0, 0, 0, 20] as [number, number, number, number],
    },
    { text: "C. Contact Information", style: "subsectionHeader", margin: [0, 10, 0, 10] as [number, number, number, number] },
    {
      text: [
        "For questions about this evidence package or to request additional documentation, contact the case management team.\n\n",
        "Document generated by: Canada Serverless Application Project\n",
        `Generation timestamp: ${format(new Date(), "yyyy-MM-dd HH:mm:ss zzz")}`,
      ],
      margin: [0, 0, 0, 20] as [number, number, number, number],
    },
  ];
};

/**
 * Generates the complete PDF document definition with all sections
 */
export const generateDocumentDefinition = (
  data: EvidencePackageData
): TDocumentDefinitions => {
  return {
    info: {
      title: `Evidence Package - Case ${data.obligation.id}`,
      author: "Canada Serverless Application Project",
      subject: `Legal Documentation for Obligation Instance ${data.obligation.id}`,
      keywords: "evidence, legal, Provincial CRA, PIPEDA, credit reporting",
    },
    pageSize: "LETTER",
    pageMargins: [50, 80, 50, 60],
    header: (currentPage, pageCount) => {
      if (currentPage === 1) return null; // No header on cover page
      return {
        text: `Case Reference: ${data.obligation.id} | Account: ${data.obligation.accountNumber}`,
        alignment: "center",
        margin: [50, 30, 50, 0],
        fontSize: 9,
        color: "#666",
      };
    },
    footer: (currentPage, pageCount) => {
      return {
        columns: [
          {
            text: `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
            alignment: "left",
            fontSize: 8,
            color: "#666",
            margin: [50, 0, 0, 0],
          },
          {
            text: `Page ${currentPage} of ${pageCount}`,
            alignment: "right",
            fontSize: 8,
            color: "#666",
            margin: [0, 0, 50, 0],
          },
        ],
        margin: [0, 20, 0, 0],
      };
    },
    content: [
      ...generateCoverPage(data),
      ...generateExecutiveSummary(data),
      ...generateChainOfCustody(data),
      ...generateChallengeDocumentation(data),
      ...generateEvidenceAttachmentsIndex(data),
      ...generateStatutoryReferences(data),
      ...generateAppendices(),
    ],
    styles: {
      coverTitle: {
        fontSize: 32,
        bold: true,
        color: "#1a1f2e",
      },
      coverSubtitle: {
        fontSize: 18,
        color: "#666",
      },
      watermark: {
        fontSize: 16,
        bold: true,
      },
      disclaimer: {
        fontSize: 10,
        italics: true,
        color: "#666",
      },
      sectionHeader: {
        fontSize: 20,
        bold: true,
        margin: [0, 15, 0, 10] as [number, number, number, number],
        color: "#1a1f2e",
      },
      subsectionHeader: {
        fontSize: 14,
        bold: true,
        margin: [0, 10, 0, 8] as [number, number, number, number],
        color: "#333",
      },
      tableHeader: {
        bold: true,
        fontSize: 10,
        color: "#000",
        fillColor: "#f0f0f0",
      },
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      lineHeight: 1.3,
    },
  };
};
