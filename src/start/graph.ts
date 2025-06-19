import { AIMessage, isAIMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { buildChatContext } from "./context.js";
import { AgentState } from "./state.js";
import handoffTool from "./tools/handoff.js";
import productInfoTool from "./tools/productInfo.js";
import { enforceCompliance } from "../utils/claims.js";

// -----------------------------------------------------------------------------
// Tool setup
// -----------------------------------------------------------------------------
const tools = [handoffTool, productInfoTool];
const toolNode = new ToolNode(tools);

const model = new ChatOpenAI({ model: "gpt-4o-mini" });
const boundModel = model.bindTools(tools);

// -----------------------------------------------------------------------------
// 1. Agent node – generate next assistant message.
//    • If it contains tool calls, add it directly to messages (so tools node can
//      execute).
//    • Otherwise store it as `pendingResponse` for validation first.
// -----------------------------------------------------------------------------
const callModel = async (state: typeof AgentState.State) => {
  const { messages } = state;
  const contextMessages = buildChatContext(messages);
  
  const response = await boundModel.invoke(contextMessages);
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
      currentState: state
    }
  };
  
  // Call the tool node with the enhanced config
  return await toolNode.invoke(state, configWithState);
};

// -----------------------------------------------------------------------------
// 3. Compliance node – validate & (optionally) rewrite pendingResponse.
// -----------------------------------------------------------------------------
const complianceNode = async (state: typeof AgentState.State) => {
  const pending = state.pendingResponse as AIMessage | null;
  if (!pending) {
    throw new Error("No pending response to validate");
  }

  const originalText = pending.content as string;
  const { final, validation } = await enforceCompliance(
    typeof originalText === "string" ? originalText : JSON.stringify(originalText),
  );

  const finalMessage = new AIMessage(final);
  // Attach validation details in metadata for inspection on the client side
  finalMessage.additional_kwargs = {
    ...finalMessage.additional_kwargs,
    claimsValidation: validation,
  } as any;

  return {
    messages: [finalMessage],
    pendingResponse: null,
    originalResponse: typeof originalText === "string" ? originalText : JSON.stringify(originalText),
    claimsValidation: validation,
  };
};

// -----------------------------------------------------------------------------
// 4. Routing logic
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
// 5. Graph wiring
// -----------------------------------------------------------------------------
const workflow = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", callTools)
  .addNode("compliance", complianceNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeMessage)
  .addEdge("compliance", END)
  .addEdge("tools", "agent");

export const graph = workflow.compile();

graph.name = "Start Graph";