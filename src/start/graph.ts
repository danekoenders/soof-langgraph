import { AIMessage, isAIMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { buildChatContext } from "./context.js";
import { AgentState } from "./state.js";
import handoffTool from "./tools/handoff.js";
import productInfoTool from "./tools/productInfo.js";
import validateClaimsTool from "./tools/validateClaims.js";
import { enforceCompliance } from "../utils/claims.js";

// -----------------------------------------------------------------------------
// Tool setup
// -----------------------------------------------------------------------------
const tools = [handoffTool, productInfoTool, validateClaimsTool];
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
  const update = await toolNode.invoke(state, configWithState);

  // Determine if product_info tool was executed
  let needsCompliance = state.needsCompliance ?? false;
  if (update.messages) {
    for (const msg of update.messages) {
      if ((msg as any)._getType && (msg as any)._getType() === "tool") {
        const name = (msg as any).name ?? (msg as any).tool_name;
        if (name === "product_info") {
          needsCompliance = true;
        }
      }
    }
  }

  console.log("needsCompliance", needsCompliance);

  return { ...update, needsCompliance };
};

// -----------------------------------------------------------------------------
// 3. Compliance node – validate & (optionally) rewrite pendingResponse.
// -----------------------------------------------------------------------------
const complianceNode = async (state: typeof AgentState.State) => {
  const pending = state.pendingResponse as AIMessage | null;
  if (!pending) {
    throw new Error("No pending response to validate");
  }

  // If no compliance requested, simply release the pending response
  if (!state.needsCompliance) {
    return { messages: [pending], pendingResponse: null };
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
    needsCompliance: false,
  };
};

// -----------------------------------------------------------------------------
// 4. Routing logic
// -----------------------------------------------------------------------------
const routeMessage = (state: typeof AgentState.State) => {
  // If the agent has produced a draft answer (pendingResponse)
  if (state.pendingResponse) {
    // Validate only when the flag is set by the tools node
    return state.needsCompliance ? "compliance" : END;
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