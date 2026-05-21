import { describe, expect, it } from "vitest";

import { assertRenderableConsumerIdentificationImage } from "../../helpers/consumerIdentification";
import { BusinessRuleError } from "../../helpers/endpointErrorHandler";

const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWMAgv8AAQQBAP8H9UQAAAAASUVORK5CYII=";

const CORRUPT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lEQP2wAAAABJRU5ErkJggg==";

describe("consumer identification image validation", () => {
  it("accepts a decodable PNG identification image", () => {
    expect(() =>
      assertRenderableConsumerIdentificationImage("image/png", Buffer.from(VALID_PNG_BASE64, "base64")),
    ).not.toThrow();
  });

  it("rejects a corrupt PNG before it can crash packet PDF rendering", () => {
    expect(() =>
      assertRenderableConsumerIdentificationImage("image/png", Buffer.from(CORRUPT_PNG_BASE64, "base64")),
    ).toThrow(BusinessRuleError);
  });
});
