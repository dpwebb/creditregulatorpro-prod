import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getVersionList } from "../endpoints/version/list_GET.schema";
import { postCreateVersion } from "../endpoints/version/create_POST.schema";
import { postUpdateVersion } from "../endpoints/version/update_POST.schema";
import { postDeleteVersion } from "../endpoints/version/delete_POST.schema";
import { postSnapshotVersion } from "../endpoints/version/snapshot_POST.schema";
import { getCurrentVersion } from "../endpoints/version/current_GET.schema";
import { postGenerateVersionNotes } from "../endpoints/version/generate-notes_POST.schema";
import { getMigrationList } from "../endpoints/migration/list_GET.schema";
import { postCreateMigration } from "../endpoints/migration/create_POST.schema";
import { postUpdateMigration } from "../endpoints/migration/update_POST.schema";
import { getChangeSummary } from "../endpoints/version/change-summary_GET.schema";

const VERSION_KEYS = {
  all: ["versions"] as const,
  current: ["versions", "current"] as const,
  migrations: (versionId: number) => ["versions", versionId, "migrations"] as const,
  changeSummary: ["version", "change-summary"] as const,
};

export function useVersions() {
  return useQuery({
    queryKey: VERSION_KEYS.all,
    queryFn: () => getVersionList(),
  });
}

export function useCurrentVersion() {
  return useQuery({
    queryKey: VERSION_KEYS.current,
    queryFn: () => getCurrentVersion(),
  });
}

export function useCreateVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postCreateVersion>[0]) => postCreateVersion(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.changeSummary });
    },
  });
}

export function useChangeSummary({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: VERSION_KEYS.changeSummary,
    queryFn: () => getChangeSummary(),
    enabled,
  });
}

export function useUpdateVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postUpdateVersion>[0]) => postUpdateVersion(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.current });
    },
  });
}

export function useDeleteVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postDeleteVersion>[0]) => postDeleteVersion(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.all });
    },
  });
}

export function useGenerateNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postGenerateVersionNotes>[0]) => postGenerateVersionNotes(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.current });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.changeSummary });
    },
  });
}

export function useGenerateSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postSnapshotVersion>[0]) => postSnapshotVersion(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.changeSummary });
    },
  });
}

export function useVersionMigrations(versionId: number) {
  return useQuery({
    queryKey: VERSION_KEYS.migrations(versionId),
    queryFn: () => getMigrationList({ versionId }),
    enabled: !!versionId,
  });
}

export function useCreateMigration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postCreateMigration>[0]) => postCreateMigration(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.migrations(variables.versionId) });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.changeSummary });
    },
  });
}

export function useUpdateMigration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postUpdateMigration>[0]) => postUpdateMigration(input),
    onSuccess: (updatedMigration) => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.migrations(updatedMigration.versionId) });
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.changeSummary });
    },
  });
}
