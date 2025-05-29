import { BaseMessage } from "@langchain/core/messages";
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * This narrows the interface with the user.
 */
export const InputStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>,
});

/**
 * Simple state that only manages conversation messages.
 */
export const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
});
