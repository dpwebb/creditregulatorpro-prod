import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getParserKnownEntities, InputType as ListInputType } from "../endpoints/parser-known-entity/list_GET.schema";
import { createParserKnownEntity } from "../endpoints/parser-known-entity/create_POST.schema";
import { KnownEntityType } from "./schema";

export const PARSER_KNOWN_ENTITY_KEYS = {
  all: ["parserKnownEntities"] as const,
  list: (entityType?: KnownEntityType) => 
    [...PARSER_KNOWN_ENTITY_KEYS.all, "list", entityType] as const,
};

export function useParserKnownEntities(entityType?: KnownEntityType) {
  return useQuery({
    queryKey: PARSER_KNOWN_ENTITY_KEYS.list(entityType),
    queryFn: () => getParserKnownEntities({ entityType }),
  });
}

export function useCreateParserKnownEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createParserKnownEntity,
    onSuccess: (_, variables) => {
      // Invalidate the specific list for this type and the general list
      queryClient.invalidateQueries({ 
        queryKey: PARSER_KNOWN_ENTITY_KEYS.list(variables.entityType) 
      });
      queryClient.invalidateQueries({ 
        queryKey: PARSER_KNOWN_ENTITY_KEYS.list(undefined) 
      });
    },
  });
}