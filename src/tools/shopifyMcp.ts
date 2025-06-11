import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Shopify MCP Server Tools
 * Based on: https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront
 */

// Tool to search store catalog via Shopify MCP
export const searchShopCatalogTool = tool(
  async ({ query, context, myShopifyDomain }) => {
    try {
      // Make actual MCP call to the Shopify endpoint
      const mcpPayload = {
        jsonrpc: "2.0",
        method: "tools/call",
        id: 1,
        params: {
          name: "search_shop_catalog",
          arguments: {
            query,
            ...(context && { context }),
          },
        },
      };

      console.log(`[MCP] Searching catalog for "${query}" on store: ${myShopifyDomain}`);
      
      // MCP endpoint for the Shopify store
      const mcpEndpoint = `https://${myShopifyDomain}/mcp/storefront`;
      
      try {
        const response = await fetch(mcpEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(mcpPayload),
        });
        
        if (!response.ok) {
          throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.error) {
          throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
        }
        
        // Parse the MCP response to get products
        let products = [];
        if (result.result?.content?.[0]?.text) {
          try {
            const parsedContent = JSON.parse(result.result.content[0].text);
            products = parsedContent.products || [];
          } catch (parseError) {
            console.warn('[MCP] Failed to parse product content:', parseError);
            // If parsing fails, try to extract products from the result directly
            products = result.result.products || [];
          }
        } else if (result.result?.products) {
          // Direct products array in result
          products = result.result.products;
        }
        
        console.log(`[MCP] Found ${products.length} products for query: ${query}`);
        
        return {
          query,
          store: myShopifyDomain,
          success: true,
          products,
          totalResults: products.length,
        };
        
      } catch (fetchError) {
        // If MCP endpoint is not available, fall back to mock data for development
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.warn(`[MCP] Endpoint not available (${errorMessage})`);
        
        return {
          query,
          store: myShopifyDomain,
          success: true,
          products: [],
          totalResults: 0,
          fallbackUsed: true,
        };
      }
      
    } catch (err) {
      console.error(`[MCP] Error searching catalog:`, err);
      const error = err instanceof Error ? err.message : String(err);
      return {
        query,
        store: myShopifyDomain,
        success: false,
        error,
        products: [],
        totalResults: 0,
      };
    }
  },
  {
    name: "search_shop_catalog",
    description: "Search the store's product catalog using Shopify MCP server. Returns product details including name, price, variants, and URLs.",
    schema: z.object({
      query: z.string().describe("Search query to find related products"),
      context: z.string().optional().describe("Additional context to help tailor results"),
      myShopifyDomain: z.string().describe("The Shopify store domain (required for MCP endpoint)"),
    }),
  },
);