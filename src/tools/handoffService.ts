import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const handoffTool = tool(
  async ({ transcript }) => {
    // TODO: send transcript to customer-service platform (e.g. Zendesk, Intercom)
    console.log("Handoff transcript:", transcript);
    return "You have been forwarded to our customer support team. An agent will contact you shortly.";
  },
  {
    name: "handoff_to_agent",
    description: "Send the full chat transcript to the customer support team.",
    schema: z.object({
      transcript: z.string().describe("Complete chat history for handoff"),
    }),
  },
); 