import { Client } from "@gadget-client/soof-s";

if (!process.env.GADGET_API_KEY) {
  throw new Error("GADGET_API_KEY environment variable is required");
}

// Create Gadget client with API key authentication
const client = new Client({
  authenticationMode: {
    apiKey: process.env.GADGET_API_KEY,
  },
});

export const gadget = client;
