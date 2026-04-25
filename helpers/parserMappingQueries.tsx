import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getParserMappings } from "../endpoints/parser-mapping/list_GET.schema";
import { createParserMapping } from "../endpoints/parser-mapping/create_POST.schema";
import { updateParserMapping } from "../endpoints/parser-mapping/update_POST.schema";
import { deleteParserMapping } from "../endpoints/parser-mapping/delete_POST.schema";
import { testParserMapping } from "../endpoints/parser-mapping/test_POST.schema";
import { getParserMappingHistory } from "../endpoints/parser-mapping/history_GET.schema";
import { rollbackParserMapping } from "../endpoints/parser-mapping/rollback_POST.schema";

export const PARSER_MAPPING_KEYS = {
  all: ["parserMappings"] as const,
  lists: () => [...PARSER_MAPPING_KEYS.all, "list"] as const,
  list: (bureau?: string, section?: string) => [...PARSER_MAPPING_KEYS.lists(), bureau, section] as const,
  histories: () => [...PARSER_MAPPING_KEYS.all, "history"] as const,
  history: (mappingId?: number) => [...PARSER_MAPPING_KEYS.histories(), mappingId] as const,
};

export function useParserMappings(bureau?: string, section?: string) {
  return useQuery({
    queryKey: PARSER_MAPPING_KEYS.list(bureau, section),
    queryFn: () => getParserMappings({ bureau, section }),
  });
}

export function useCreateParserMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createParserMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_MAPPING_KEYS.lists() });
    },
  });
}

export function useUpdateParserMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateParserMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_MAPPING_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: PARSER_MAPPING_KEYS.histories() });
    },
  });
}

export function useDeleteParserMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteParserMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_MAPPING_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: PARSER_MAPPING_KEYS.histories() });
    },
  });
}

export function useTestParserMapping() {
  return useMutation({
    mutationFn: testParserMapping,
    // Testing is stateless externally; no cache invalidation needed.
  });
}

export function useParserMappingHistory(mappingId?: number) {
  return useQuery({
    queryKey: PARSER_MAPPING_KEYS.history(mappingId),
    queryFn: () => getParserMappingHistory({ mappingId }),
    enabled: mappingId !== undefined, // Usually targeted explicitly, optionally global.
  });
}

export function useRollbackParserMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rollbackParserMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_MAPPING_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: PARSER_MAPPING_KEYS.histories() });
    },
  });
}