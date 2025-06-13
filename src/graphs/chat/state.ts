import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// Chat state - standalone with its own messages
export const ChatState = Annotation.Root({
  // Core conversation for chat
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: (existing, newMsg) => {
      const incoming = Array.isArray(newMsg) ? newMsg : [newMsg];
      return [...existing, ...incoming];
    },
    default: () => [],
  }),
}); 