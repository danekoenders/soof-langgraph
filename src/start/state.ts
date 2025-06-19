import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { ClaimsValidationResult } from "../retrieval_graph/state.js";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  pendingResponse: Annotation<BaseMessage | null>(),
  originalResponse: Annotation<string | null>(),
  claimsValidation: Annotation<ClaimsValidationResult | null>(),
});
