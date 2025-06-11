import { Annotation } from "@langchain/langgraph";
import { SharedBaseState } from "../shared/baseState.js";

// Chat state - uses the shared base state (no additional fields needed)
export const ChatState = Annotation.Root({
  ...SharedBaseState.spec,
  // Chat graph doesn't need any additional fields beyond the base state
}); 