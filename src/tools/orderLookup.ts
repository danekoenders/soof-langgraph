import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const orderLookupTool = tool(
  async ({ orderId }) => {
    // TODO: implement real order lookup via API or database
    return `Status van bestelling ${orderId}: in verwerking (placeholder).`;
  },
  {
    name: "lookup_order",
    description: "Retrieve order information by orderId.",
    schema: z.object({
      orderId: z.string().describe("The unique order ID"),
    }),
  },
); 