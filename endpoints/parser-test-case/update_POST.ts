import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./update_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { Json } from "../../helpers/schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403 }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.expectedConsumerInfo !== undefined) updateData.expectedConsumerInfo = input.expectedConsumerInfo as unknown as Json;
    if (input.expectedTradelines !== undefined) updateData.expectedTradelines = input.expectedTradelines as unknown as Json;

    const updatedTestCase = await db
      .updateTable("parserTestCase")
      .set(updateData)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    const output: OutputType = {
      testCase: {
        id: updatedTestCase.id,
        name: updatedTestCase.name,
        description: updatedTestCase.description,
        expectedConsumerInfo: updatedTestCase.expectedConsumerInfo,
        expectedTradelines: updatedTestCase.expectedTradelines,
      },
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}