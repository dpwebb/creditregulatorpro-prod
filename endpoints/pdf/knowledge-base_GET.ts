import { OutputType } from "./knowledge-base_GET.schema";


import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { generateServerPdf } from "../../helpers/pdfServerUtils";
import { kbPdfContentSections } from "../../helpers/kbPdfContentSections";
import type { TDocumentDefinitions, StyleDictionary, Content } from "pdfmake/interfaces";

export async function handle(request: Request) {
  try {
    // Authenticate the user
    await getServerUserSession(request);

    const sections = kbPdfContentSections();

    const content: Content[] = [
      {
        text: "Credit Regulator Pro Knowledge Base",
        fontSize: 36,
        bold: true,
        color: "#1a365d",
        alignment: "center",
        margin: [0, 200, 0, 10],
      },
      {
        text: "Canada's Credit Bureau Compliance Audit Engine — Complete Reference Guide",
        fontSize: 16,
        alignment: "center",
        margin: [0, 0, 0, 40],
      },
      {
        text: `Generated: ${new Intl.DateTimeFormat("en-CA", {
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date())}`,
        alignment: "center",
        margin: [0, 0, 0, 10],
      },
      {
        text: "CONFIDENTIAL — For authorized users only",
        alignment: "center",
        color: "#d32f2f",
        bold: true,
      },
      { text: "", pageBreak: "after" },
      {
        toc: {
          title: { text: "Table of Contents", style: "header", margin: [0, 0, 0, 20] },
        },
      },
      ...sections.section1(),
      ...sections.section2(),
      ...sections.section3(),
      ...sections.section4(),
      ...sections.section5(),
      ...sections.section6(),
      ...sections.section7(),
      ...sections.section8(),
      ...sections.section9(),
      ...sections.section10(),
      ...sections.section11(),
      ...sections.section12(),
      ...sections.section13(),
      ...sections.section14(),
      ...sections.section15(),
      ...sections.section16(),
      ...sections.section17(),
    ];

    const styles: StyleDictionary = {
      header: { fontSize: 24, bold: true, color: "#1a365d", margin: [0, 20, 0, 10] },
      subHeader: { fontSize: 16, bold: true, color: "#1a365d", margin: [0, 15, 0, 5] },
      h3: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
      body: { fontSize: 11, color: "#333333", margin: [0, 0, 0, 10], lineHeight: 1.4 },
      list: { margin: [0, 0, 0, 10], fontSize: 11, color: "#333333", lineHeight: 1.4 },
      tableExample: { margin: [0, 5, 0, 15] },
      tableHeader: {
        bold: true,
        fontSize: 11,
        color: "#000000",
        fillColor: "#f0f0f0",
        margin: [4, 4, 4, 4],
      },
      tableCell: { fontSize: 10, margin: [4, 4, 4, 4] },
    };

    const docDefinition: TDocumentDefinitions = {
      content,
      styles,
      defaultStyle: { font: "Roboto" },
      watermark: { text: "CONFIDENTIAL", opacity: 0.04, bold: true },
      header: (currentPage: number) => {
        if (currentPage === 1) return null;
        return {
          text: "Credit Regulator Pro Knowledge Base",
          margin: [40, 20, 40, 0],
          fontSize: 10,
          color: "#666666",
        };
      },
      footer: (currentPage: number, pageCount: number) => {
        if (currentPage === 1) return null;
        return {
          columns: [
            {
              text: "CONFIDENTIAL",
              alignment: "left",
              fontSize: 10,
              color: "#666666",
            },
            {
              text: `Page ${currentPage} of ${pageCount}`,
              alignment: "right",
              fontSize: 10,
              color: "#666666",
            },
          ],
          margin: [40, 10, 40, 0],
        };
      },
    };

    const pdfBase64 = await generateServerPdf(docDefinition);

    return new Response(
      JSON.stringify({ pdf: pdfBase64 } satisfies OutputType),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}