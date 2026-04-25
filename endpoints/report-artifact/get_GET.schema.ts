import { z } from "zod";

import { Selectable } from "kysely";
import { ReportArtifact } from "../../helpers/schema";

export const schema = z.object({
  id: z.coerce.number()
});

export type InputType = z.infer<typeof schema>;

// We select specific fields to return to the client
export type ReportArtifactDetail = Pick<Selectable<ReportArtifact>, 
  'id' | 
  'artifactType' | 
  'storageUrl' | 
  'reportDate' | 
  'metro2Version' | 
  'sha256' | 
  'createdAt'
>;

export type OutputType = {
  reportArtifact: ReportArtifactDetail;
};

export const getReportArtifact = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(params);
  const result = await fetch(`/_api/report-artifact/get?id=${validatedInput.id}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  
  return JSON.parse(await result.text());
};