import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";
import { gadget } from "./config/index.js";

export const auth = new Auth()
  .authenticate(async (request: Request) => {
    const authorization = request.headers.get("authorization");
    const myShopifyDomain = request.headers.get("x-shopify-domain");
    const apiKey = request.headers.get("x-api-key");

    // Handle LangGraph Cloud default authentication (x-api-key)
    if (apiKey && !authorization) {
      try {
        // Let LangGraph Cloud handle its default auth
        // Return a server-like user for Cloud dashboard access
        return {
          identity: "langgraph-cloud",
          auth_type: "cloud",
          permissions: ["*"], // Full permissions for Cloud dashboard
        };
      } catch (error) {
        throw new HTTPException(401, { message: "Invalid API key" });
      }
    }

    // Handle custom authentication (Session/Bearer)
    if (!authorization) {
      throw new HTTPException(401, { message: "Missing authorization header" });
    }

    const [authType, key] = authorization.split(" ");

    try {
      switch (authType) {
        case "Session":
          if (!myShopifyDomain) {
            throw new HTTPException(401, { message: "Missing x-shopify-domain header" });
          }
          return await validateSessionToken(key, myShopifyDomain, request);

        case "Bearer":
          return await validateAccessKey(key, request);

        default:
          throw new HTTPException(401, {
            message: "Invalid authorization type",
          });
      }
    } catch (error) {
      throw new HTTPException(401, {
        message: "Authentication failed",
        cause: error,
      });
    }
  })

  // === CHAT USERS (Session Token) - RESTRICTED ACCESS ===

  // Allow chat users to read their own threads
  .on("threads:read", ({ user, permissions }) => {
    if (user.auth_type === "session") {
      if (!permissions.includes("threads:read")) {
        throw new HTTPException(403, { message: "Unauthorized" });
      }
      
      // Filter by session_token (matches metadata field set during creation)
      const filter = { session_token: user.identity };
      
      return filter;
    }
    // Server access or Cloud dashboard - no restrictions
    return;
  })

  // Allow chat users to create runs (for streaming)
  .on("threads:create_run", ({ user, permissions }) => {
    if (user.auth_type === "session") {
      if (!permissions.includes("threads:stream")) {
        throw new HTTPException(403, { message: "Unauthorized to stream" });
      }
      // Users can only run on threads they own (filter by session_token)
      const filter = { session_token: user.identity };
      return filter;
    }
    // Server access or Cloud dashboard - no restrictions
    return;
  })

  // DENY chat users from creating threads (they get created server-side)
  .on("threads:create", ({ user, value }) => {
    if (user.auth_type === "session") {
      throw new HTTPException(403, {
        message: "Chat users cannot create threads directly",
      });
    }
    // Server or Cloud dashboard can create threads
    if ("metadata" in value) {
      value.metadata ??= {};
      // Server creates threads - metadata should include session_token for user association
      value.metadata.created_by = user.identity;
    }
    return;
  })

  // Add debugging for thread search operations
  .on("threads:search", ({ user }) => {
    if (user.auth_type === "session") {
      // Filter by session_token (matches metadata field set during creation)
      const filter = { session_token: user.identity };
      return filter;
    }
    return;
  })

  // DENY chat users from accessing assistants, crons, etc.
  .on("assistants", ({ user }) => {
    if (user.auth_type === "session") {
      throw new HTTPException(403, {
        message: "Chat users cannot access assistants",
      });
    }
    return; // Server access or Cloud dashboard allowed
  })

  .on("crons", ({ user }) => {
    if (user.auth_type === "session") {
      throw new HTTPException(403, {
        message: "Chat users cannot access cron jobs",
      });
    }
    return; // Server access or Cloud dashboard allowed
  })

  // === SERVER ACCESS (Bearer Token) - FULL ACCESS ===

  // Fallback handler for any unhandled resources - deny chat users, allow servers/cloud
  .on("*", ({ user }) => {
    if (user.auth_type === "session") {
      throw new HTTPException(403, { message: "Access denied" });
    }
    return; // Server access or Cloud dashboard - no restrictions
  });

// Session token validation (chat users) - LIMITED PERMISSIONS
async function validateSessionToken(token: string, myShopifyDomain: string, _request: Request) {
  try {
    const validatedSession = await gadget.utils.validateSessionToken({
        token,
        myShopifyDomain,
    });

    if (!validatedSession.isValid) {
      throw new Error(validatedSession.error || "Invalid session token");
    }

    return {
      identity: token,
      auth_type: "session",
      permissions: ["threads:read", "threads:stream"],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Session validation failed: ${errorMessage}`);
  }
}

// Access key validation (server-to-server) - FULL PERMISSIONS
async function validateAccessKey(key: string, _request: Request) {
  const validKey = process.env.ACCESS_KEY || "";

  if (key !== validKey) {
    throw new Error("Invalid access key");
  }

  return {
    identity: "server",
    auth_type: "server",
    permissions: ["*"], // FULL permissions
    access_key: key,
  };
}
