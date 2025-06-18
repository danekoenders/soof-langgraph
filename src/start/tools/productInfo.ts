import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

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
