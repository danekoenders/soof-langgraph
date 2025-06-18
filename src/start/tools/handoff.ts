import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { gadget } from "../../config/gadget.js";

const handoffTool = new DynamicStructuredTool({
  name: "handoff",
  description: "Forward the chat to the support team.",
  schema: z.object({
    customerEmail: z.string().describe("The email of the customer."),
  }),
  func: async ({ customerEmail }, _runManager, config) => {
    // Get the session token from config.configurable
    const session_token = (config as any)?.configurable?.langgraph_auth_user?.identity;
    
    // Get the current state from config.configurable
    const currentState = (config as any)?.configurable?.currentState;
    
    if (!session_token) {
      console.warn("No session token found in config.configurable");
      return {
        error: true,
        message: "No session found, please start a new session.",
      };
    }
    
    if (!currentState) {
      console.warn("No current state found in config.configurable");
      return {
        error: true,
        message: "No state available for handoff.",
      };
    }
    
    // Now you can use both the session_token and currentState
    // Call sendTranscript without arguments as expected by the function
    const invoke = await gadget.assistant.functions.sendTranscript({
      sessionToken: session_token,
      messages: currentState.messages,
      customerEmail: customerEmail,
    });

    if (invoke.success === true) {
      return {
        message: "Your chat has been forwarded to the support team. Please wait for a response.",
        success: true,
      };
    } else {
      return {
        message: "Failed to forward your chat to the support team. Please try again.",
        success: false,
      };
    }
  },
});

export default handoffTool;
