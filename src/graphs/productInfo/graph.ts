import { StateGraph } from "@langchain/langgraph";
import { ProductInfoState } from "./state.js";
import { initChatModel } from "langchain/chat_models/universal";
import { RunnableConfig } from "@langchain/core/runnables";
import { searchShopCatalogTool } from "../../tools/shopifyMcp.js";
import { z } from "zod";
import {
  defaultContextManager,
  ContextManager,
} from "../../utils/contextManager.js";
import {
  AIMessage,
  SystemMessage,
  HumanMessage,
  FunctionMessage,
} from "@langchain/core/messages";

async function searchProducts(
  state: typeof ProductInfoState.State,
  config: RunnableConfig
): Promise<typeof ProductInfoState.Update> {
  try {
    const myShopifyDomain = config?.configurable?.myShopifyDomain;

    if (!myShopifyDomain) {
      const errorMsg = "myShopifyDomain is required but not provided in config";
      console.error("Product search error:", errorMsg);
      return {
        error: errorMsg,
        processingStatus: "Configuration error: Missing shop domain",
        searchQuery: "",
        productResults: [],
      };
    }

    const { searchQuery, context } = await generateSearchFromHistory(
      state.messages
    );

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
      error: mcpResult.success
        ? null
        : `MCP search failed: ${mcpResult.error || "Unknown error"}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Product search error:", error);
    return {
      searchQuery: "",
      productResults: [],
      processingStatus: "Product search failed due to error",
      error: `Product search failed: ${errorMessage}`,
    };
  }
}

async function generateSearchFromHistory(
  messages: any[]
): Promise<{ searchQuery: string; context: string }> {
  // Get the last 3 messages (mix of human, AI, and system messages)
  const recentMessages = messages.slice(-3);

  if (recentMessages.length === 0) {
    const errorMsg = "No user messages found in chat history";
    console.error("Search generation error:", errorMsg);
    throw new Error(errorMsg);
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
    const searchSystemMessage =
      defaultContextManager.createTaskSystemMessage(searchPrompt);
    const contextMessages = defaultContextManager.buildContextMessages(
      recentMessages,
      [searchSystemMessage]
    );

    const result = await structuredModel.invoke(contextMessages);

    if (!result.searchQuery || result.searchQuery.trim() === "") {
      throw new Error("Generated search query is empty");
    }

    return {
      searchQuery: result.searchQuery,
      context: result.context,
    };
  } catch (error) {
    console.error("Error generating search from history:", error);
    // Fallback to a simple approach if LLM call fails
    const lastMessage = recentMessages[recentMessages.length - 1];
    const fallbackQuery = lastMessage.content?.toString() || "supplements";

    if (fallbackQuery.trim() === "") {
      throw new Error(
        "Cannot generate search query: no valid content found in messages"
      );
    }

    console.warn(
      "Using fallback search query due to LLM error:",
      fallbackQuery
    );
    return {
      searchQuery: fallbackQuery,
      context: "General product search - LLM analysis failed, using fallback",
    };
  }
}

async function generateResponse(
  state: typeof ProductInfoState.State,
  config: RunnableConfig
): Promise<typeof ProductInfoState.Update> {
  try {
    const myShopifyDomain = config?.configurable?.myShopifyDomain;
    if (!myShopifyDomain) {
      return {
        error: "Missing myShopifyDomain in config",
        processingStatus: "Configuration error",
        messages: [],
      };
    }

    // Return early if search phase failed
    if (state.error) {
      return {
        error: state.error,
        processingStatus: "Previous error propagated",
        messages: [new AIMessage(state.error)],
      };
    }

    // Initialise model
    const model = await initChatModel("gpt-4o-mini");

    // ------------------------------------------------------------------
    // Structured output schema – single best product recommendation
    // ------------------------------------------------------------------
    const recommendationSchema = z.object({
      hasRecommendation: z
        .boolean()
        .describe("Whether a suitable product was found"),
      bestProduct: z
        .object({
          product_id: z.string().describe("GID of the product"),
          title: z.string().describe("Product title"),
          short_description: z
            .string()
            .describe("Concise description (Max 3 sentences)"),
          price: z.string().optional().describe("Price"),
          currency: z.string().optional().describe("Currency"),
          image_url: z.string().optional().describe("Image URL"),
          image_alt_text: z.string().optional(),
        })
        .optional(),
      reason: z.string().optional().describe("Why this product is recommended"),
      suggestions: z
        .array(z.string())
        .optional()
        .describe(
          "Alternative search suggestions when no suitable product is found"
        ),
    });

    const structuredModel = model.withStructuredOutput(recommendationSchema);

    // ------------------------------------------------------------------
    // Build prompt – feed raw MCP JSON directly
    // ------------------------------------------------------------------
    const responsePrompt = `You are a helpful e-commerce assistant for a supplement store. The user is looking for product information.

    1. Analyse the product data and choose at most ONE best matching product.
    2. If products array is empty, set hasRecommendation to false and provide suggestions.
    3. Always respond ONLY with valid JSON matching the schema – **no additional keys, text or markdown**.
`;

    const systemMessage = new SystemMessage(responsePrompt);

    const productContextManager = new ContextManager({
      baseSystemPrompt: false,
      windowSize: 3,
    });

    // Build messages with raw product JSON as content of the final user message
    const rawProductJSON = JSON.stringify(
      { products: state.productResults ?? [] },
      null,
      2
    );

    const messages = productContextManager.buildContextMessages(
      state.messages,
      [
        systemMessage,
        new FunctionMessage({
          name: "fetch_products",
          content: rawProductJSON,
        }),
      ]
    );

    const result = await structuredModel.invoke(messages);

    // Prepare final AI message with JSON string for downstream consumers
    const finalMessage = new AIMessage(JSON.stringify(result, null, 2));

    return {
      messages: [finalMessage],
      processingStatus: "Recommendation generated",
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error in response node";
    return {
      messages: [new AIMessage(`Error: ${message}`)],
      processingStatus: "Error in generateResponse",
      error: message,
    };
  }
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
