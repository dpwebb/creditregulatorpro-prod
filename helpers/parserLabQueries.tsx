import { useMutation } from "@tanstack/react-query";
import { runParserLabStage } from "../endpoints/parser-lab/run_POST.schema";

export function useRunParserLabStage() {
  return useMutation({
    mutationFn: (input: Parameters<typeof runParserLabStage>[0]) =>
      runParserLabStage(input),
  });
}
