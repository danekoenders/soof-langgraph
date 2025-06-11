import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Placeholder product-recommendation tool.
 * Later we will replace the implementation with real logic (vector search, rules, etc.).
 */
export const productRecommendationTool = tool(
  async ({ query, maxResults }) => {
    // TODO: implement real recommendation logic (e.g. similarity search)
    return `Aanbevolen producten voor "${query}" (top ${maxResults})`;
  },
  {
    name: "recommend_products",
    description:
      "Provide product recommendations based on a search query. Returns a list of products.",
    schema: z.object({
      query: z.string().describe("Search term for products"),
      maxResults: z.number().int().default(5).describe("Maximum number of products to return"),
    }),
  },
); 