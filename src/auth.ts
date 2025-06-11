import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";
import { gadget } from "./config/index.js";

export const auth = new Auth()
  .authenticate(async (request: Request) => {
    const authorization = request.headers.get("authorization");
    const apiKey = request.headers.get("x-api-key");
    
    console.log("🔍 Auth Debug - Authorization header:", authorization);
    console.log("🔍 Auth Debug - X-API-Key header:", apiKey ? "present" : "missing");

    // Handle LangGraph Cloud default authentication (x-api-key)
    if (apiKey && !authorization) {
      console.log("🔍 Auth Debug - Processing x-api-key authentication");
      try {
        // Let LangGraph Cloud handle its default auth
        // Return a server-like user for Cloud dashboard access
        return {
          identity: "langgraph-cloud",
          auth_type: "cloud",
          permissions: ["*"], // Full permissions for Cloud dashboard
        };
      } catch (error) {
        console.log("❌ Auth Debug - x-api-key validation failed");
        throw new HTTPException(401, { message: "Invalid API key" });
      }
    }

    // Handle custom authentication (Session/Bearer)
    if (!authorization) {
      console.log("❌ Auth Debug - Missing authorization header and x-api-key");
      throw new HTTPException(401, { message: "Missing authorization header" });
    }

    const [authType, key] = authorization.split(" ");
    console.log("🔍 Auth Debug - Parsed authType:", authType);
    console.log("🔍 Auth Debug - Parsed key:", key ? `${key.substring(0, 10)}...` : "undefined");

    try {
      switch (authType) {
        case "Session":
          console.log("🔍 Auth Debug - Processing Session token");
          return await validateSessionToken(key, request);

        case "Bearer":
          console.log("🔍 Auth Debug - Processing Bearer token");
          return await validateAccessKey(key, request);

        default:
          console.log("❌ Auth Debug - Invalid auth type:", authType);
          throw new HTTPException(401, {
            message: "Invalid authorization type",
          });
      }
    } catch (error) {
      console.log("❌ Auth Debug - Authentication failed:", error);
      throw new HTTPException(401, {
        message: "Authentication failed",
        cause: error,
      });
    }
  })

  // === CHAT USERS (Session Token) - RESTRICTED ACCESS ===

  // Allow chat users to read their own threads
  .on("threads:read", ({ user, permissions }) => {
    console.log("🔍 Auth Debug - threads:read triggered", {
      authType: user.auth_type,
      identity: user.identity,
      permissions: permissions
    });
    
    if (user.auth_type === "session") {
      if (!permissions.includes("threads:read")) {
        console.log("❌ Auth Debug - Session user lacks threads:read permission");
        throw new HTTPException(403, { message: "Unauthorized" });
      }
      
      // Filter by session_token (matches metadata field set during creation)
      const filter = { session_token: user.identity };
      
      console.log("✅ Auth Debug - Session user threads:read filter applied:", filter);
      return filter;
    }
    // Server access or Cloud dashboard - no restrictions
    console.log("✅ Auth Debug - Server/Cloud access threads:read - no restrictions");
    return;
  })

  // Allow chat users to create runs (for streaming)
  .on("threads:create_run", ({ user, permissions }) => {
    console.log("🔍 Auth Debug - threads:create_run triggered", {
      authType: user.auth_type,
      identity: user.identity,
      permissions: permissions
    });
    
    if (user.auth_type === "session") {
      if (!permissions.includes("threads:stream")) {
        console.log("❌ Auth Debug - Session user lacks threads:stream permission");
        throw new HTTPException(403, { message: "Unauthorized to stream" });
      }
      // Users can only run on threads they own (filter by session_token)
      const filter = { session_token: user.identity };
      console.log("✅ Auth Debug - Session user threads:create_run filter applied:", filter);
      return filter;
    }
    // Server access or Cloud dashboard - no restrictions
    console.log("✅ Auth Debug - Server/Cloud access threads:create_run - no restrictions");
    return;
  })

  // DENY chat users from creating threads (they get created server-side)
  .on("threads:create", ({ user, value }) => {
    console.log("🔍 Auth Debug - threads:create triggered", {
      authType: user.auth_type,
      identity: user.identity,
      value: value
    });
    
    if (user.auth_type === "session") {
      console.log("❌ Auth Debug - Session user denied threads:create");
      throw new HTTPException(403, {
        message: "Chat users cannot create threads directly",
      });
    }
    // Server or Cloud dashboard can create threads
    console.log("✅ Auth Debug - Server/Cloud creating thread");
    if ("metadata" in value) {
      value.metadata ??= {};
      // Server creates threads - metadata should include session_token for user association
      value.metadata.created_by = user.identity;
      
      console.log("🔍 Auth Debug - Thread metadata set:", { 
        created_by: user.identity,
        session_token: value.metadata.session_token || "not_set",
        myShopifyDomain: value.metadata.myShopifyDomain || "not_set"
      });
    }
    return;
  })

  // Add debugging for thread search operations
  .on("threads:search", ({ user, permissions }) => {
    console.log("🔍 Auth Debug - threads:search triggered", {
      authType: user.auth_type,
      identity: user.identity,
      permissions: permissions
    });
    
    if (user.auth_type === "session") {
      // Filter by session_token (matches metadata field set during creation)
      const filter = { session_token: user.identity };
      console.log("✅ Auth Debug - Session user threads:search filter applied:", filter);
      return filter;
    }
    console.log("✅ Auth Debug - Server/Cloud access threads:search - no restrictions");
    return;
  })

  // DENY chat users from accessing assistants, crons, etc.
  .on("assistants", ({ user }) => {
    console.log("🔍 Auth Debug - assistants operation triggered", {
      authType: user.auth_type,
      identity: user.identity
    });
    
    if (user.auth_type === "session") {
      console.log("❌ Auth Debug - Session user denied assistants access");
      throw new HTTPException(403, {
        message: "Chat users cannot access assistants",
      });
    }
    console.log("✅ Auth Debug - Server/Cloud access assistants - allowed");
    return; // Server access or Cloud dashboard allowed
  })

  .on("crons", ({ user }) => {
    console.log("🔍 Auth Debug - crons operation triggered", {
      authType: user.auth_type,
      identity: user.identity
    });
    
    if (user.auth_type === "session") {
      console.log("❌ Auth Debug - Session user denied crons access");
      throw new HTTPException(403, {
        message: "Chat users cannot access cron jobs",
      });
    }
    console.log("✅ Auth Debug - Server/Cloud access crons - allowed");
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
async function validateSessionToken(token: string, _request: Request) {
  console.log("🔍 Session Debug - Validating session token");
  
  try {
    const validatedSession = await gadget.utils.validateSessionToken({
        token,
    });

    console.log("🔍 Session Debug - Validation result:", {
      isValid: validatedSession.isValid,
      error: validatedSession.error
    });

    if (!validatedSession.isValid) {
      console.log("❌ Session Debug - Invalid session token:", validatedSession.error);
      throw new Error(validatedSession.error || "Invalid session token");
    }

    console.log("✅ Session Debug - Session token validated successfully");
    return {
      identity: token,
      auth_type: "session",
      permissions: ["threads:read", "threads:stream"],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log("❌ Session Debug - Validation failed:", errorMessage);
    throw new Error(`Session validation failed: ${errorMessage}`);
  }
}

// Access key validation (server-to-server) - FULL PERMISSIONS
async function validateAccessKey(key: string, _request: Request) {
  console.log("🔍 Bearer Debug - Validating access key");
  
  const validKey = process.env.ACCESS_KEY || "";
  console.log("🔍 Bearer Debug - Environment key exists:", !!validKey);
  console.log("🔍 Bearer Debug - Key match:", key === validKey);

  if (key !== validKey) {
    console.log("❌ Bearer Debug - Invalid access key provided");
    throw new Error("Invalid access key");
  }

  console.log("✅ Bearer Debug - Access key validated successfully");
  return {
    identity: "server",
    auth_type: "server",
    permissions: ["*"], // FULL permissions
    access_key: key,
  };
}
