import { AIMessage, isAIMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { buildChatContext } from "./context.js";
import { AgentState } from "./state.js";
import handoffTool from "./tools/handoff.js";
import productInfoTool from "./tools/productInfo.js";

const tools = [handoffTool, productInfoTool];
const toolNode = new ToolNode(tools);

const model = new ChatOpenAI({ model: "gpt-4o-mini" });
const boundModel = model.bindTools(tools);

const callModel = async (state: typeof AgentState.State) => {
  const { messages } = state;
  const contextMessages = buildChatContext(messages);
  console.log(contextMessages);
  const response = await boundModel.invoke(contextMessages);
  const aiMessage = isAIMessage(response) ? response : new AIMessage(response);
  return { messages: [aiMessage] };
};

const routeMessage = (state: typeof AgentState.State) => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (!lastMessage?.tool_calls?.length) {
    return END;
  }
  return "tools";
};

const workflow = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeMessage)
  .addEdge("tools", "agent");

export const graph = workflow.compile();

graph.name = "Start Graph";