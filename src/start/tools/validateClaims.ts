import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { validateClaims } from "../../utils/claims.js";

const validateClaimsTool = new DynamicStructuredTool({
  name: "validate_claims",
  description:
    "Validate whether the provided text contains any forbidden or allowed health/nutrition claims. Returns compliance information so that you can decide to rewrite your answer.",
  schema: z.object({
    text: z.string().describe("Full answer text that you want to validate."),
    threshold: z
      .number()
      .optional()
      .describe("Similarity threshold between 0 and 1. Default 0.5"),
  }),
  func: async ({ text, threshold = 0.5 }) => {
    const res = await validateClaims(text, threshold);
    return res;
  },
});

export default validateClaimsTool; 