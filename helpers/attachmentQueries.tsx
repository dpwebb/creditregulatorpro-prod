import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAttachments, InputType as ListInput } from "../endpoints/evidence-attachment/list_GET.schema";
import { uploadAttachment, InputType as UploadInput } from "../endpoints/evidence-attachment/upload_POST.schema";
import { generatePackage, InputType as PackageInput } from "../endpoints/evidence-attachment/package_POST.schema";
import { toast } from "sonner";

export const ATTACHMENT_KEYS = {
  all: ["attachments"] as const,
  list: (filters: ListInput) => [...ATTACHMENT_KEYS.all, filters] as const,
};

export const useAttachmentList = (filters: ListInput) => {
  return useQuery({
    queryKey: ATTACHMENT_KEYS.list(filters),
    queryFn: () => getAttachments(filters),
    enabled: !!(filters.obligationInstanceId || filters.packetId),
    placeholderData: (prev) => prev,
  });
};

export const useUploadAttachmentMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UploadInput) => uploadAttachment(data),
    onSuccess: (_, variables) => {
      toast.success("Evidence uploaded successfully");
      queryClient.invalidateQueries({ 
        queryKey: ATTACHMENT_KEYS.all 
      });
    },
    onError: (error: Error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });
};

export const useGeneratePackageMutation = () => {
  return useMutation({
    mutationFn: (data: PackageInput) => generatePackage(data),
    onSuccess: (blob) => {
      // Create a URL for the blob and trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence-package-${new Date().toISOString()}.pdf`; // Fallback name, usually header handles it but we can't access headers easily from blob result here without wrapper
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Evidence package generated and downloaded");
    },
    onError: (error: Error) => {
      toast.error(`Package generation failed: ${error.message}`);
    },
  });
};