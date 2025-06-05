import { BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain/chat_models/universal";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { ClaimsValidationResult } from "./state.js";

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
 */
export async function loadChatModel(
  fullySpecifiedName: string,
): Promise<BaseChatModel> {
  const index = fullySpecifiedName.indexOf("/");
  if (index === -1) {
    return await initChatModel(fullySpecifiedName);
  } else {
    const provider = fullySpecifiedName.slice(0, index);
    const model = fullySpecifiedName.slice(index + 1);
    return await initChatModel(model, { modelProvider: provider });
  }
}

/**
 * Initialize Pinecone client using environment variables
 */
export function initializePinecone(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("PINECONE_API_KEY environment variable is required");
  }
  return new Pinecone({ apiKey });
}

/**
 * Query Pinecone for relevant claims
 */
export async function queryRelevantClaims(
  responseText: string,
  topK: number = 25
): Promise<Array<{
  claim: string;
  claimType: "allowed" | "forbidden" | "general";
  nutrient: string;
  scope: string;
  score: number;
}>> {
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!indexName) {
    throw new Error("PINECONE_INDEX_NAME environment variable is required");
  }

  const pc = initializePinecone();
  const index = pc.index(indexName);
  
  // Use fixed OpenAI embedding model
  const embeddings = new OpenAIEmbeddings({ 
    model: "text-embedding-3-small" 
  });
  
  // Create embedding for the response text
  const queryEmbedding = await embeddings.embedQuery(responseText);
  
  // Query Pinecone for similar claims
  const queryResponse = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });
  
  // Parse results
  return queryResponse.matches?.map(match => ({
    claim: match.metadata?.claim as string || "",
    claimType: match.metadata?.claimType as "allowed" | "forbidden" | "general" || "general",
    nutrient: match.metadata?.nutrient as string || "",
    scope: match.metadata?.scope as string || "",
    score: match.score || 0,
  })) || [];
}

/**
 * Validate response against claims database
 */
export async function validateClaims(
  responseText: string,
  threshold: number = 0.75
): Promise<ClaimsValidationResult> {
  const relevantClaims = await queryRelevantClaims(responseText);
  
  // Filter claims above threshold
  const significantClaims = relevantClaims.filter(claim => claim.score >= threshold);
  
  // Separate different claim types
  const allowedClaims = significantClaims
    .filter(claim => claim.claimType === "allowed")
    .map(claim => claim.claim);
    
  const forbiddenClaims = significantClaims
    .filter(claim => claim.claimType === "forbidden")
    .map(claim => claim.claim);

  const generalClaims = significantClaims
    .filter(claim => claim.claimType === "general")
    .map(claim => claim.claim);
  
  // Calculate compliance score (forbidden claims make it non-compliant)
  const totalSignificantClaims = significantClaims.length;
  const violationCount = forbiddenClaims.length;
  const complianceScore = totalSignificantClaims > 0 
    ? (totalSignificantClaims - violationCount) / totalSignificantClaims 
    : 1.0;
  
  // Generate suggestions for violations
  const suggestions = forbiddenClaims.length > 0 
    ? [
        "Herformuleer claims om te voldoen aan toegestane beweringen",
        "Vermijd claims die expliciet verboden zijn voor deze nutriënten",
        "Gebruik alleen claims die expliciet zijn toegestaan voor deze nutriënten",
        "Zorg dat de toon professioneel en feitelijk blijft"
      ]
    : [];
  
  return {
    isCompliant: forbiddenClaims.length === 0,
    violatedClaims: forbiddenClaims, // Now these are the forbidden claims
    allowedClaims,
    suggestions,
    complianceScore,
  };
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
