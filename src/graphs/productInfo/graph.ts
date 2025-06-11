import { StateGraph } from "@langchain/langgraph";
import { ProductInfoState } from "./state.js";
import { initChatModel } from "langchain/chat_models/universal";
import { RunnableConfig } from "@langchain/core/runnables";
import { searchShopCatalogTool } from "../../tools/shopifyMcp.js";
import { z } from "zod";
import { defaultContextManager } from "../../utils/contextManager.js";

async function searchProducts(
  state: typeof ProductInfoState.State,
  _config: RunnableConfig
): Promise<typeof ProductInfoState.Update> {
  // Generate search query and context from chat history
  const { searchQuery, context } = await generateSearchFromHistory(state.messages);
  const myShopifyDomain = state.myShopifyDomain || "unknown-store";

  try {
    // Search the store catalog using Shopify MCP
    const mcpResult = await searchShopCatalogTool.invoke({
      query: searchQuery,
      context,
      myShopifyDomain,
    });

    const productResults = mcpResult.products;

    return {
      searchQuery,
      productResults,
      processingStatus: mcpResult.success
        ? `Search completed for "${searchQuery}" on ${myShopifyDomain}. Found ${mcpResult.products?.length || 0} products.`
        : `Search failed for "${searchQuery}" on ${myShopifyDomain}`,
    };
  } catch (error) {
    console.log("Product search error:", error);
    return {
      searchQuery,
      productResults: [],
      processingStatus: "Product search failed",
    };
  }
}

async function generateSearchFromHistory(
  messages: any[]
): Promise<{ searchQuery: string; context: string }> {
  // Get the last 3 messages (mix of human, AI, and system messages)
  const recentMessages = messages.slice(-3);

  if (recentMessages.length === 0) {
    throw new Error("No user messages found in chat history");
  }

  // Create the model with structured output
  const model = await initChatModel("gpt-4o-mini");

  const searchGenerationSchema = z.object({
    searchQuery: z
      .string()
      .describe("Specific search query to find the most relevant products"),
    context: z
      .string()
      .describe(
        "Additional context about customer preferences, needs, or constraints"
      ),
  });

  const structuredModel = model.withStructuredOutput(searchGenerationSchema);

  // Create the search analysis prompt
  const searchPrompt = `
    Based on this conversation, analyze the customer's needs and generate:
    1. A specific search query that would find the most relevant products in the supplement store
    2. Context about customer preferences, needs, or constraints that would help tailor the search results

    Focus on:
    - Needs mentioned in the conversation
    - Any specific requirements mentioned (for example dosage, form, brand, color, preferences)
    `;

  try {
    // Use context manager for search analysis
    const searchSystemMessage = defaultContextManager.createTaskSystemMessage(searchPrompt);
    const contextMessages = defaultContextManager.buildContextMessages(
      recentMessages,
      [searchSystemMessage]
    );

    const result = await structuredModel.invoke(contextMessages);
    return {
      searchQuery: result.searchQuery,
      context: result.context,
    };
  } catch (error) {
    console.error("Error generating search from history:", error);
    // Fallback to a simple approach if LLM call fails
    const lastMessage = recentMessages[recentMessages.length - 1];
    const fallbackQuery = lastMessage.content?.toString() || "supplements";
    return {
      searchQuery: fallbackQuery,
      context: "General product search - LLM analysis failed",
    };
  }
}

async function generateResponse(
  state: typeof ProductInfoState.State,
  _config: RunnableConfig
): Promise<typeof ProductInfoState.Update> {
  const model = await initChatModel("gpt-4o-mini");

  // Build context for response generation
  const responseContext = `
  You are a helpful supplement store assistant. Use the product information to answer the user's question about our products.
  
    ## Product Search Results

    **Store**: ${state.myShopifyDomain}
    **Search Query**: ${state.searchQuery}

    ## Products Found (${state.productResults?.length || 0}):
    ${
    state.productResults
        ?.map(
        (p) => `
    - **${p.productName}** - $${p.price} ${p.currency}
    ${p.description}
    URL: ${p.productUrl}
    `
        )
        .join("\n") || "No products found"
    }

    Generate a helpful response about these products.
    `;

  // Use context manager to build messages with product context
  const productSystemMessage = defaultContextManager.createTaskSystemMessage(responseContext);

  const messages = defaultContextManager.buildContextMessages(
    state.messages,
    [productSystemMessage]
  );

  const response = await model.invoke(messages);

  return {
    messages: [response],
    processingStatus: "Response generated",
  };
}

// Build the simple product info graph
const builder = new StateGraph({ stateSchema: ProductInfoState })
  .addNode("searchProducts", searchProducts)
  .addNode("generateResponse", generateResponse)
  .addEdge("__start__", "searchProducts")
  .addEdge("searchProducts", "generateResponse")
  .addEdge("generateResponse", "__end__");

export const graph = builder.compile();
graph.name = "Simple Product Search Graph";
