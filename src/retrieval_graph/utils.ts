import { BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain/chat_models/universal";

export function getMessageText(msg: BaseMessage): string {
  /** Get the text content of a message. */
  const content = msg.content;
  if (typeof content === "string") {
    return content;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txts = (content as any[]).map((c) =>
      typeof c === "string" ? c : c.text || "",
    );
    return txts.join("").trim();
  }
}

/**
 * Load a chat model from a fully specified name.
 * @param fullySpecifiedName - String in the format 'provider/model' or 'provider/account/provider/model'.
 * @returns A Promise that resolves to a BaseChatModel instance.
 */
export async function loadChatModel(
  fullySpecifiedName: string,
): Promise<BaseChatModel> {
  const index = fullySpecifiedName.indexOf("/");
  if (index === -1) {
    // If there's no "/", assume it's just the model
    return await initChatModel(fullySpecifiedName);
  } else {
    const provider = fullySpecifiedName.slice(0, index);
    const model = fullySpecifiedName.slice(index + 1);
    return await initChatModel(model, { modelProvider: provider });
  }
}
