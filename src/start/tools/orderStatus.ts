import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { gadget } from "../../config/gadget.js";

/**
 * Dynamic tool: order_status
 *
 * Fetches order fulfillment, delivery, and payment status using either an
 * order ID or a customer email (at least one is required). The tool returns
 * a structured object that the assistant can reference in its response.
 */
const orderStatusTool = new DynamicStructuredTool({
  name: "order_status",
  description:
    "Fetch order fulfillment, delivery, and payment status for a given order ID or customer email. Either orderId or email must be provided.",
  // Define the expected input schema
  schema: z
    .object({
      orderId: z
        .string()
        .describe("The order ID to look up.")
        .optional(),
      email: z
        .string()
        .email()
        .describe("The customer's email address associated with the order.")
        .optional(),
    })
    .refine(
      (data) => data.orderId || data.email,
      {
        message: "Either orderId or email must be provided",
      }
    ),
  // Tool implementation
  func: async ({ orderId, email }, _runManager, config) => {
    try {
      // Attempt to use Gadget backend if an implementation exists
      const sessionToken = (config as any)?.configurable?.langgraph_auth_user?.identity;

      if (!sessionToken) {
        throw new Error("No session token found in config");
      }

      const invoke = await gadget.assistant.functions.fetchParcelData({
        sessionToken,
        orderId,
        email,
      });

      return invoke;
    } catch (err) {
      return {
        error: "Failed to fetch order status.",
        details: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export default orderStatusTool; 