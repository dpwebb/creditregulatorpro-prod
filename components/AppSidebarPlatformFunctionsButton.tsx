import React, { useState } from "react";
import { Download } from "lucide-react";
import { usePlatformFunctionsPdf } from "../helpers/usePlatformFunctionsPdf";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";
import { Spinner } from "./Spinner";
import { useToast } from "../helpers/useToast";
import styles from "./AppSidebarPlatformFunctionsButton.module.css";

interface Props {
  isMinimized: boolean;
}

export const AppSidebarPlatformFunctionsButton: React.FC<Props> = ({ isMinimized }) => {
  const { refetch, isFetching } = usePlatformFunctionsPdf();
  const { showError } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { data, isError, error } = await refetch();
      if (isError) {
         throw error;
      }
      if (data?.pdf) {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${data.pdf}`;
        link.download = "platform-functions.pdf";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to download Platform Functions PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  const loading = isFetching || isDownloading;

  const buttonContent = (
    <button 
      onClick={handleDownload} 
      className={styles.button} 
      data-minimized={isMinimized}
      disabled={loading}
      aria-label="Download Platform Functions PDF"
    >
      <span className={styles.iconWrapper}>
        {loading ? <Spinner size="sm" /> : <Download size={20} strokeWidth={2} />}
      </span>
      {!isMinimized && <span className={styles.label}>Platform Functions</span>}
    </button>
  );

  if (isMinimized) {
    return (
      <div className={styles.wrapper} data-minimized="true">
        <Tooltip>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent side="right">
            Platform Functions PDF
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {buttonContent}
    </div>
  );
};