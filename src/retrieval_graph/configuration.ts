/**
 * Define the configurable parameters for the agent.
 */
import { RunnableConfig } from "@langchain/core/runnables";
import { RESPONSE_SYSTEM_PROMPT_TEMPLATE } from "./prompts.js";
import { Annotation } from "@langchain/langgraph";

/**
 * Simple configuration for the chat agent.
 */
export const ConfigurationAnnotation = Annotation.Root({
  /**
   * The system prompt used for generating responses.
   */
  responseSystemPromptTemplate: Annotation<string>,

  /**
   * The language model used for generating responses. Should be in the form: provider/model-name.
   */
  responseModel: Annotation<string>,

  /**
   * Similarity threshold for claims matching (0-1). 
   * Suggested: 0.75 for good balance between precision and recall
   */
  claimsValidationThreshold: Annotation<number>,

  /**
   * Maximum number of response regeneration attempts
   */
  maxRegenerationAttempts: Annotation<number>,
});

/**
 * Create a configuration instance from a RunnableConfig object.
 */
export function ensureConfiguration(
  config: RunnableConfig | undefined = undefined,
): typeof ConfigurationAnnotation.State {
  const configurable = (config?.configurable || {}) as Partial<
    typeof ConfigurationAnnotation.State
  >;

  return {
    responseSystemPromptTemplate:
      configurable.responseSystemPromptTemplate ||
      RESPONSE_SYSTEM_PROMPT_TEMPLATE,
    responseModel:
      configurable.responseModel || "openai/gpt-4o-mini",
    claimsValidationThreshold:
      configurable.claimsValidationThreshold || 0.5,
    maxRegenerationAttempts:
      configurable.maxRegenerationAttempts || 3,
  };
}
