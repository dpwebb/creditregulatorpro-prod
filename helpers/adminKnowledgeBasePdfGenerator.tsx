export const generateAdminKnowledgeBasePdf = async (): Promise<void> => {
  try {
    const response = await fetch("/_api/pdf/admin-knowledge-base", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Admin Knowledge Base PDF");
    }

    const result = await response.json();
    const base64Data = result.pdf || result.base64;

    const dataUrl = `data:application/pdf;base64,${base64Data}`;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "Credit-Regulator-Pro-Admin-Guide.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error generating admin knowledge base PDF:", error);
    throw error;
  }
};