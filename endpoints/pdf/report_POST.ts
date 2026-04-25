import { schema, OutputType } from "./report_POST.schema";


import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { generateServerPdf } from "../../helpers/pdfServerUtils";
import type {
  TDocumentDefinitions,
  Content,
  TableCell,
  StyleDictionary,
} from "pdfmake/interfaces";

export async function handle(request: Request) {
  try {
    // Authenticate the user
    await getServerUserSession(request);

    // Parse and validate the input
    const json = JSON.parse(await request.text());
    const config = schema.parse(json);

    const {
      title,
      subtitle,
      metadata,
      columns,
      data,
      footerText,
      orientation = "portrait",
    } = config;

    const content: Content[] = [];

    // Title & Subtitle
    content.push({
      text: title,
      style: "reportTitle",
      margin: [0, 0, 0, subtitle ? 4 : 12],
    });

    if (subtitle) {
      content.push({
        text: subtitle,
        style: "reportSubtitle",
        margin: [0, 0, 0, 12],
      });
    }

    // Metadata Section
    if (metadata && Object.keys(metadata).length > 0) {
      const metadataRows = Object.entries(metadata).map(([key, value]) => ({
        columns: [
          { text: key + ":", width: "auto", bold: true, margin: [0, 0, 5, 0] },
          { text: value, width: "*", margin: [0, 0, 0, 0] },
        ],
        margin: [0, 0, 0, 2],
      }));

      content.push({
        stack: metadataRows as Content[],
        style: "metadata",
        margin: [0, 0, 0, 20],
      });
    }

    // Table Build
    const tableHeaderRow: TableCell[] = columns.map((col) => ({
      text: col.header,
      style: "tableHeader",
    }));

    const tableBodyRows: TableCell[][] = data.map((row) => {
      return columns.map((col) => {
        const val = row[col.dataKey];
        let displayVal = "";
        if (val !== null && val !== undefined) {
          if (typeof val === "object") {
            if (val instanceof Date) {
              displayVal = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(val);
            } else {
              displayVal = JSON.stringify(val);
            }
          } else {
            displayVal = String(val);
          }
        }
        return {
          text: displayVal,
          style: "tableCell",
        };
      });
    });

    const tableContent: Content = {
      table: {
        headerRows: 1,
        widths: columns.map((c) => (c.width ? c.width : "*")),
        body: [tableHeaderRow, ...tableBodyRows],
      },
      layout: {
        fillColor: (rowIndex: number) => {
          if (rowIndex === 0) return "#EEEEEE";
          return rowIndex % 2 === 0 ? "#F9F9F9" : null;
        },
        hLineWidth: (i: number, node: any) => {
          return i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5;
        },
        vLineWidth: () => 0,
        hLineColor: () => "#CCCCCC",
      },
    };

    content.push(tableContent);

    // Styles Dictionary
    const styles: StyleDictionary = {
      reportTitle: { fontSize: 18, bold: true, color: "#111111" },
      reportSubtitle: { fontSize: 12, color: "#666666" },
      metadata: { fontSize: 10, color: "#444444" },
      tableHeader: { bold: true, fontSize: 10, color: "#000000", margin: [0, 4, 0, 4] },
      tableCell: { fontSize: 9, color: "#333333", margin: [0, 4, 0, 4] },
      footer: { fontSize: 8, color: "#888888", italics: true },
    };

    // Construct Document
    const docDefinition: TDocumentDefinitions = {
      content: content,
      pageOrientation: orientation,
      pageSize: "LETTER",
      pageMargins: [40, 40, 40, 60],
      styles: styles,
      defaultStyle: { font: "Roboto" },
      footer: (currentPage, pageCount) => {
        return {
          columns: [
            {
              text: footerText || `Generated on ${new Date().toLocaleString("en-CA")}`,
              alignment: "left",
              style: "footer",
            },
            {
              text: `Page ${currentPage} of ${pageCount}`,
              alignment: "right",
              style: "footer",
            },
          ],
          margin: [40, 20, 40, 0],
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