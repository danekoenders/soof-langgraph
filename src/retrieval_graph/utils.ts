import { BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain/chat_models/universal";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function getMessageText(msg: BaseMessage): string {
  /** Get the text content of a message. */
  const content = msg.content;
  if (typeof content === "string") {
    return content;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txts = (content as any[]).map((c) =>
      typeof c === "string" ? c : c.text || "",
    );
    return txts.join("").trim();
  }
}

/**
 * Load a chat model from a fully specified name.
 * @param fullySpecifiedName - String in the format 'provider/model' or 'provider/account/provider/model'.
 * @returns A Promise that resolves to a BaseChatModel instance.
 */
export async function loadChatModel(
  fullySpecifiedName: string,
): Promise<BaseChatModel> {
  const index = fullySpecifiedName.indexOf("/");
  if (index === -1) {
    // If there's no "/", assume it's just the model
    return await initChatModel(fullySpecifiedName);
  } else {
    const provider = fullySpecifiedName.slice(0, index);
    const model = fullySpecifiedName.slice(index + 1);
    return await initChatModel(model, { modelProvider: provider });
  }
}

/**
 * Mock product data for demonstration
 */
const MOCK_PRODUCTS = [
  {
    id: "prod-1",
    name: "Wireless Bluetooth Headphones",
    price: 89.99,
    description: "High-quality wireless headphones with noise cancellation",
    category: "Electronics",
    inStock: true,
    rating: 4.5
  },
  {
    id: "prod-2", 
    name: "Organic Cotton T-Shirt",
    price: 24.99,
    description: "Comfortable organic cotton t-shirt in various colors",
    category: "Clothing",
    inStock: true,
    rating: 4.2
  },
  {
    id: "prod-3",
    name: "Smart Water Bottle",
    price: 49.99,
    description: "Insulated smart water bottle with temperature tracking",
    category: "Fitness",
    inStock: false,
    rating: 4.7
  }
];

/**
 * Retrieve products based on search query
 */
async function retrieveProducts(query: string): Promise<string> {
  // Simple mock logic - return all products for now
  // In a real implementation, you would filter based on the query
  const products = MOCK_PRODUCTS.map(product => 
    `${product.name} - $${product.price} - ${product.description} (${product.inStock ? 'In Stock' : 'Out of Stock'})`
  ).join('\n');
  
  return `Found ${MOCK_PRODUCTS.length} products:\n${products}`;
}

/**
 * Tool for retrieving product information
 */
export const productRetrievalTool = tool(
  async ({ query }) => {
    return await retrieveProducts(query);
  },
  {
    name: "retrieve_products",
    description: "Retrieve product information based on a search query. Use this when users ask about products, prices, or inventory.",
    schema: z.object({
      query: z.string().describe("The search query for products")
    })
  }
);
