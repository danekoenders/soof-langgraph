import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { validateClaims } from "../../utils/claims.js";
import { loadChatModel } from "../../retrieval_graph/utils.js";

const productInfoTool = new DynamicStructuredTool({
  name: "product_info",
  description: "Fetch product information based on a search query and context.",
  schema: z.object({
    searchQuery: z.string().describe("The product search query."),
    context: z
      .string()
      .describe("Additional context about what the user is requesting."),  
  }),
  func: async ({ searchQuery, context }, _runManager, config) => {
    // Get the Shopify domain from config.configurable (cast to any to avoid type error)
    const myShopifyDomain = (config as any)?.configurable?.myShopifyDomain;
    if (!myShopifyDomain) {
      throw new Error("Shopify domain (myShopifyDomain) is required");
    }
    const mcpPayload = {
      jsonrpc: "2.0",
      method: "tools/call",
      id: 1,
      params: {
        name: "search_shop_catalog",
        arguments: {
          query: searchQuery,
          context,
        },
      },
    };
    const mcpEndpoint = `https://${myShopifyDomain}/api/mcp`;
    try {
      const response = await fetch(mcpEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(mcpPayload),
      });
      const data = await response.json();
      const text = data?.result?.content?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          const bestProduct = parsed.products?.[0];
          if (bestProduct) {
            const mappedProduct = {
              description: bestProduct.description,
              product_type: bestProduct.product_type,
              title: bestProduct.title,
              price_range: bestProduct.price_range,
              variants: Array.isArray(bestProduct.variants)
                ? bestProduct.variants.map((v: any) => ({
                    currency: v.currency,
                    title: v.title,
                    available: v.available,
                    price: v.price,
                  }))
                : [],
            };

            /*
             * ──────────────────────────────────────────────────────────────────────────
             *  Validate & (if needed) rewrite description to remove forbidden claims  
             * ──────────────────────────────────────────────────────────────────────────
             */

            let finalDescription = mappedProduct.description;
            try {
              const validation = await validateClaims(finalDescription);
              if (!validation.isCompliant) {
                const modelName = (config as any)?.configurable?.responseModel ?? "openai/gpt-4o-mini";
                const model = await loadChatModel(modelName);
                const prompt = [
                  {
                    role: "system",
                    content:
                      "Rewrite the product description so it no longer contains forbidden health or nutrition claims. Keep it concise and factual.",
                  },
                  { role: "assistant", content: finalDescription },
                ];
                const regenerated = await model.invoke(prompt);
                finalDescription = typeof regenerated.content === "string" ? regenerated.content : JSON.stringify(regenerated.content);
              }
            } catch (_err) {
              // If validation or rewriting fails, fall back to the original description
            }

            // Ensure the (possibly rewritten) description is returned
            mappedProduct.description = finalDescription;

            return {
              metadata: bestProduct,
              product: mappedProduct,
              instructions:
                "Create a small and concise description about this product.",
            };
          } else {
            return { error: "No products found."};
          }
        } catch (err) {
          return { error: "Failed to parse product info JSON."};
        }
      }
      return { error: "No product info found in response."};
    } catch (err) {
      return {
        error: "Error fetching product info.",
        details: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export default productInfoTool;
