import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { loadChatModel } from "../retrieval_graph/utils.js";
import type { ClaimsValidationResult } from "../retrieval_graph/state.js";

/**
 * Initialize Pinecone client using the PINECONE_API_KEY env var.
 */
export function initializePinecone(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("PINECONE_API_KEY environment variable is required");
  }
  return new Pinecone({ apiKey });
}

/**
 * Query Pinecone for the most relevant health-claim records.
 */
export async function queryRelevantClaims(
  responseText: string,
  topK = 25,
): Promise<
  Array<{
    claim: string;
    claimType: "allowed" | "forbidden" | "general";
    nutrient: string;
    scope: string;
    score: number;
  }>
> {
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!indexName) {
    throw new Error("PINECONE_INDEX_NAME environment variable is required");
  }

  const pc = initializePinecone();
  const index = pc.index(indexName);
  const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
  const queryEmbedding = await embeddings.embedQuery(responseText);

  const queryResponse = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  return (
    queryResponse.matches?.map((m) => ({
      claim: (m.metadata?.claim as string) ?? "",
      claimType: (m.metadata?.claimType as
        | "allowed"
        | "forbidden"
        | "general") ?? "general",
      nutrient: (m.metadata?.nutrient as string) ?? "",
      scope: (m.metadata?.scope as string) ?? "",
      score: m.score ?? 0,
    })) || []
  );
}

/**
 * Pure validation: does the supplied text contain forbidden claims?
 */
export async function validateClaims(
  text: string,
  threshold = 0.75,
): Promise<ClaimsValidationResult> {
  const claims = await queryRelevantClaims(text);
  const significant = claims.filter((c) => c.score >= threshold);

  const allowed = significant
    .filter((c) => c.claimType === "allowed")
    .map((c) => c.claim);
  const forbidden = significant
    .filter((c) => c.claimType === "forbidden")
    .map((c) => c.claim);

  const total = significant.length;
  const complianceScore = total > 0 ? (total - forbidden.length) / total : 1;

  const suggestions = forbidden.length
    ? [
        "Herschrijf beweringen om te voldoen aan toegestane claims",
        "Vermijd expliciet verboden claims",
      ]
    : [];

  return {
    isCompliant: forbidden.length === 0,
    violatedClaims: forbidden,
    allowedClaims: allowed,
    suggestions,
    complianceScore,
  };
}

/**
 * If validation fails, regenerate the text once with a concise prompt.
 */
export async function enforceCompliance(
  text: string,
  modelName = "openai/gpt-4o-mini",
  threshold = 0.75,
): Promise<{ final: string; validation: ClaimsValidationResult }> {
  const validation = await validateClaims(text, threshold);
  if (validation.isCompliant) {
    return { final: text, validation };
  }

  const model = await loadChatModel(modelName);
  const systemPrompt = [
    "You are a compliance assistant rewriting content to remove forbidden health or nutrition claims.",
    `Forbidden claims: ${validation.violatedClaims.join(", ")}`,
    "Rewrite the answer so it is factual, concise, and compliant.",
  ].join("\n");

  const regenerated = await model.invoke([
    { role: "system", content: systemPrompt },
    { role: "assistant", content: text },
  ]);

  const final =
    typeof regenerated.content === "string"
      ? regenerated.content
      : JSON.stringify(regenerated.content);

  return { final, validation };
}

/**
 * Convenience helper used by most callers.
 */
export async function makeCompliant(
  answer: string,
  modelName = "openai/gpt-4o-mini",
  threshold = 0.75,
) {
  return enforceCompliance(answer, modelName, threshold);
} 