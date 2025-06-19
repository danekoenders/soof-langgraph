import { AIMessage, isAIMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { buildChatContext } from "./context.js";
import { AgentState } from "./state.js";
import handoffTool from "./tools/handoff.js";
import productInfoTool from "./tools/productInfo.js";
import { validateClaims } from "../utils/claims.js";

// -----------------------------------------------------------------------------
// Tool setup
// -----------------------------------------------------------------------------
const tools = [handoffTool, productInfoTool];
const toolNode = new ToolNode(tools);

// Non-streaming model for the agent (to avoid duplicate partial events)
const agentModel = new ChatOpenAI({ model: "gpt-4o-mini", streaming: false });
const boundAgentModel = agentModel.bindTools(tools);

// Streaming model for the regenerate node – we want token-by-token output
const streamingModel = new ChatOpenAI({ model: "gpt-4o-mini", streaming: true });

// -----------------------------------------------------------------------------
// 1. Agent node – generate next assistant message.
//    • If it contains tool calls, add it directly to messages (so tools node can
//      execute).
//    • Otherwise store it as `pendingResponse` for validation first.
// -----------------------------------------------------------------------------
const callModel = async (state: typeof AgentState.State) => {
  const { messages } = state;
  const contextMessages = buildChatContext(messages);

  const response = await boundAgentModel.invoke(contextMessages);
  const aiMessage = isAIMessage(response) ? response : new AIMessage(response);

  if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
    // Needs tool execution – push immediately.
    return { messages: [aiMessage], pendingResponse: null };
  }

  // No tool calls – hold for compliance check before exposing.
  return { pendingResponse: aiMessage };
};

// -----------------------------------------------------------------------------
// 2. Tools node wrapper remains unchanged – we pass state so tools can access it
// -----------------------------------------------------------------------------
// Custom tools node that passes state to tools
const callTools = async (state: typeof AgentState.State, config: any) => {
  // Create a new config that includes the current state
  const configWithState = {
    ...config,
    configurable: {
      ...config?.configurable,
      currentState: state,
    },
  };

  // Call the tool node with the enhanced config
  return await toolNode.invoke(state, configWithState);
};

// -----------------------------------------------------------------------------
// 3. Compliance node – validate pendingResponse and store validation results.
// -----------------------------------------------------------------------------
const complianceNode = async (state: typeof AgentState.State) => {
  const pending = state.pendingResponse as AIMessage | null;
  if (!pending) {
    throw new Error("No pending response to validate");
  }

  const originalText = pending.content as string;
  const validation = await validateClaims(
    typeof originalText === "string"
      ? originalText
      : JSON.stringify(originalText)
  );

  // Store validation results but don't add to messages yet - always regenerate for consistent streaming
  return {
    pendingResponse: null,
    originalResponse:
      typeof originalText === "string"
        ? originalText
        : JSON.stringify(originalText),
    claimsValidation: validation,
  };
};

// -----------------------------------------------------------------------------
// 4. Regenerate node – always regenerate for consistent streaming behavior.
// -----------------------------------------------------------------------------
const regenerateNode = async (state: typeof AgentState.State) => {
  if (!state.claimsValidation || !state.originalResponse) {
    throw new Error("Missing validation data for regeneration");
  }

  // Create appropriate system prompt based on compliance status
  const systemPrompt = state.claimsValidation.isCompliant
    ? `Return the following text exactly as provided, without any changes: "${state.originalResponse}"`
    : `The original response contained claims violations. Please rewrite it to be compliant:

    Original response: "${state.originalResponse}"
    Violated claims: ${state.claimsValidation.violatedClaims.join(", ")}
    Allowed claims: ${state.claimsValidation.allowedClaims.join(", ")}
    Suggestions: ${state.claimsValidation.suggestions.join(", ")}

    Provide a compliant response that addresses the user's question without making prohibited claims.`;

  const regeneratedResponse = await streamingModel.invoke([
    { role: "system", content: systemPrompt },
  ]);

  const finalMessage = isAIMessage(regeneratedResponse)
    ? regeneratedResponse
    : new AIMessage(regeneratedResponse);

  // Attach validation details in metadata for inspection on the client side
  finalMessage.additional_kwargs = {
    ...finalMessage.additional_kwargs,
    claimsValidation: state.claimsValidation,
  } as any;

  return {
    messages: [finalMessage],
  };
};

// -----------------------------------------------------------------------------
// 5. Routing logic
// -----------------------------------------------------------------------------
const routeMessage = (state: typeof AgentState.State) => {
  // If we have a pending response, go to compliance node.
  if (state.pendingResponse) {
    return "compliance";
  }

  // Otherwise rely on last assistant message to decide next step.
  const { messages } = state;
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (!lastMessage?.tool_calls?.length) {
    return END;
  }
  return "tools";
};

// -----------------------------------------------------------------------------
// 6. Graph wiring
// -----------------------------------------------------------------------------
const workflow = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", callTools)
  .addNode("compliance", complianceNode)
  .addNode("regenerate", regenerateNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeMessage)
  .addEdge("compliance", "regenerate")
  .addEdge("regenerate", END)
  .addEdge("tools", "agent");

export const graph = workflow.compile();

graph.name = "Start Graph";
