import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getParserTestCases } from "../endpoints/parser-test-case/list_GET.schema";
import { createParserTestCase } from "../endpoints/parser-test-case/create_POST.schema";
import { updateParserTestCase } from "../endpoints/parser-test-case/update_POST.schema";
import { deleteParserTestCase } from "../endpoints/parser-test-case/delete_POST.schema";
import { runParserTest } from "../endpoints/parser-test-case/run_POST.schema";
import { runAllParserTests } from "../endpoints/parser-test-case/run-all_POST.schema";
import { exportParserTestCases } from "../endpoints/parser-test-case/export_POST.schema";
import { importParserTestCases } from "../endpoints/parser-test-case/import_POST.schema";
import { adjudicateParserTestCase } from "../endpoints/parser-test-case/adjudicate_POST.schema";

export const PARSER_TEST_KEYS = {
  all: ["parserTestCases"] as const,
  lists: () => [...PARSER_TEST_KEYS.all, "list"] as const,
  detail: (id: number) => [...PARSER_TEST_KEYS.all, "detail", id] as const,
  runs: (id: number) => [...PARSER_TEST_KEYS.all, "runs", id] as const,
};

export function useParserTestCases() {
  return useQuery({
    queryKey: PARSER_TEST_KEYS.lists(),
    queryFn: () => getParserTestCases(),
  });
}

export function useCreateParserTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createParserTestCase>[0]) => createParserTestCase(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_TEST_KEYS.lists() });
    },
  });
}

export function useUpdateParserTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateParserTestCase>[0]) => updateParserTestCase(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PARSER_TEST_KEYS.lists() });
      queryClient.invalidateQueries({
        queryKey: PARSER_TEST_KEYS.detail(data.testCase.id),
      });
    },
  });
}

export function useDeleteParserTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof deleteParserTestCase>[0]) => deleteParserTestCase(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_TEST_KEYS.lists() });
    },
  });
}

export function useRunParserTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof runParserTest>[0]) => runParserTest(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PARSER_TEST_KEYS.lists() });
      queryClient.invalidateQueries({
        queryKey: PARSER_TEST_KEYS.runs(data.testCaseId),
      });
    },
  });
}

export function useRunAllParserTests() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runAllParserTests,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_TEST_KEYS.all });
    },
  });
}

export function useExportParserTestCases() {
  return useMutation({
    mutationFn: (input: Parameters<typeof exportParserTestCases>[0]) => exportParserTestCases(input),
  });
}

export function useImportParserTestCases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof importParserTestCases>[0]) => importParserTestCases(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PARSER_TEST_KEYS.lists() });
    },
  });
}

export function useAdjudicateParserTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof adjudicateParserTestCase>[0]) =>
      adjudicateParserTestCase(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PARSER_TEST_KEYS.lists() });
      queryClient.invalidateQueries({
        queryKey: PARSER_TEST_KEYS.detail(data.testCase.id),
      });
    },
  });
}
