import { Button } from "./Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./DropdownMenu";
import { Download, FileText, FileDown, Loader2 } from "lucide-react";

interface ExportDropdownProps {
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  isExporting?: boolean;
  label?: string;
  variant?: "outline" | "primary" | "secondary" | "ghost";
}

export const ExportDropdown = ({
  onExportCSV,
  onExportPDF,
  isExporting = false,
  label = "Export",
  variant = "outline",
}: ExportDropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} disabled={isExporting}>
          {isExporting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onExportCSV && (
          <DropdownMenuItem onClick={onExportCSV}>
            <FileText size={14} style={{ marginRight: 8 }} />
            Export as CSV
          </DropdownMenuItem>
        )}
        {onExportPDF && (
          <DropdownMenuItem onClick={onExportPDF}>
            <FileDown size={14} style={{ marginRight: 8 }} />
            Export as PDF
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};