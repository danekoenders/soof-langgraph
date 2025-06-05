import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph } from "@langchain/langgraph";
import {
  ConfigurationAnnotation,
  ensureConfiguration,
} from "./configuration.js";
import { StateAnnotation, InputStateAnnotation } from "./state.js";
import { loadChatModel, productRetrievalTool, validateClaims, getMessageText } from "./utils.js";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { CLAIMS_COMPLIANT_RESPONSE_TEMPLATE } from "./prompts.js";

const toolNode = new ToolNode([productRetrievalTool]);

async function respond(
  state: typeof StateAnnotation.State,
  config: RunnableConfig
): Promise<typeof StateAnnotation.Update> {
  /**
   * Call the LLM to respond to the user.
   */
  const configuration = ensureConfiguration(config);

  const model = await loadChatModel(configuration.responseModel);
  
  const modelWithTools = (model as any).bindTools 
    ? (model as any).bindTools([productRetrievalTool]) 
    : model;

  const systemMessage = configuration.responseSystemPromptTemplate
    .replace("{systemTime}", new Date().toISOString());
  
  const messageValue = [
    { role: "system", content: systemMessage },
    ...state.messages,
  ];
  
  const response = await modelWithTools.invoke(messageValue);
  
  // Store the original response content for claims validation
  // Don't add to messages yet - wait for validation
  const responseContent = typeof response.content === 'string' 
    ? response.content 
    : JSON.stringify(response.content);
  
  return { 
    originalResponse: responseContent
  };
}

async function validateClaimsNode(
  state: typeof StateAnnotation.State,
  config: RunnableConfig
): Promise<typeof StateAnnotation.Update> {
  /**
   * Validate the generated response against claims database
   */
  const configuration = ensureConfiguration(config);
  
  if (!state.originalResponse) {
    throw new Error("No original response to validate");
  }
  
  // Check if Pinecone environment variables are available
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
    console.warn("Pinecone environment variables not configured, skipping claims validation");
    
    // Add the original response to conversation since validation is skipped
    return {
      claimsValidation: {
        isCompliant: true,
        violatedClaims: [],
        allowedClaims: [],
        suggestions: [],
        complianceScore: 1.0,
      },
      validatedResponse: state.originalResponse,
      messages: [{ role: "assistant", content: state.originalResponse }]
    };
  }
  
  try {
    const validation = await validateClaims(
      state.originalResponse,
      configuration.claimsValidationThreshold
    );
    
    // If compliant, add original response to conversation
    if (validation.isCompliant) {
      return {
        claimsValidation: validation,
        validatedResponse: state.originalResponse,
        messages: [{ role: "assistant", content: state.originalResponse }]
      };
    } else {
      // If not compliant, don't add to messages yet - wait for regeneration
      return {
        claimsValidation: validation,
        validatedResponse: ""
      };
    }
  } catch (error) {
    console.error("Claims validation error:", error);
    // Fallback: add original response to conversation
    return {
      claimsValidation: {
        isCompliant: true,
        violatedClaims: [],
        allowedClaims: [],
        suggestions: [],
        complianceScore: 1.0,
      },
      validatedResponse: state.originalResponse,
      messages: [{ role: "assistant", content: state.originalResponse }]
    };
  }
}

async function regenerateResponse(
  state: typeof StateAnnotation.State,
  config: RunnableConfig
): Promise<typeof StateAnnotation.Update> {
  /**
   * Regenerate response to comply with claims validation
   */
  const configuration = ensureConfiguration(config);
  
  if (!state.claimsValidation || !state.originalResponse) {
    throw new Error("Missing validation data for regeneration");
  }
  
  const model = await loadChatModel(configuration.responseModel);
  
  // Get the original user query for the prompt template
  const userMessages = state.messages.filter(msg => msg.getType() === 'human');
  const originalQuery = userMessages.length > 0 
    ? getMessageText(userMessages[userMessages.length - 1])
    : "User question";
  
  // Create compliance-focused system prompt
  const systemMessage = CLAIMS_COMPLIANT_RESPONSE_TEMPLATE
    .replace("{originalQuery}", originalQuery)
    .replace("{originalResponse}", state.originalResponse)
    .replace("{violatedClaims}", state.claimsValidation.violatedClaims.join(", "))
    .replace("{allowedClaims}", state.claimsValidation.allowedClaims.join(", "))
    .replace("{suggestions}", state.claimsValidation.suggestions.join(", "))
    .replace("{systemTime}", new Date().toISOString());
  
  // Use rolling window of last 4 messages (2 user + 2 AI) for context
  // This preserves recent context while keeping costs and latency manageable
  const recentMessages = state.messages.slice(-4);
  
  const messageValue = [
    { role: "system", content: systemMessage },
    ...recentMessages, // Only recent context for cost optimization
  ];
  
  const regeneratedResponse = await model.invoke(messageValue);
  const regeneratedContent = typeof regeneratedResponse.content === 'string' 
    ? regeneratedResponse.content 
    : JSON.stringify(regeneratedResponse.content);
  
  // Add only the regenerated (compliant) response to conversation
  return {
    messages: [{ role: "assistant", content: regeneratedContent }],
    validatedResponse: regeneratedContent
  };
}

function shouldContinue(state: typeof StateAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && 'tool_calls' in lastMessage) {
    const aiMessage = lastMessage as AIMessage;
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      return "tools";
    }
  }
  return "validateClaims";
}

function shouldRegenerate(state: typeof StateAnnotation.State) {
  if (!state.claimsValidation) {
    return "__end__";
  }
  
  return state.claimsValidation.isCompliant ? "__end__" : "regenerateResponse";
}

const builder = new StateGraph(
  {
    stateSchema: StateAnnotation,
    input: InputStateAnnotation,
  },
  ConfigurationAnnotation
)
  .addNode("respond", respond)
  .addNode("tools", toolNode)
  .addNode("validateClaims", validateClaimsNode)
  .addNode("regenerateResponse", regenerateResponse)
  .addEdge("__start__", "respond")
  .addConditionalEdges("respond", shouldContinue)
  .addEdge("tools", "respond")
  .addConditionalEdges("validateClaims", shouldRegenerate)
  .addEdge("regenerateResponse", "__end__");

export const graph = builder.compile({
  interruptBefore: [],
  interruptAfter: [],
});

graph.name = "Soof Chat Graph";
