import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const handoffTool = new DynamicStructuredTool({
  name: "handoff",
  description: "Forward the chat to the support team.",
  schema: z.object({}),
  func: async () => {
    return "Your chat has been forwarded to the support team. Please wait for a response.";
  },
});

export default handoffTool;
