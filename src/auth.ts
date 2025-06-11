import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";
import { gadget } from "./config/index.js";

export const auth = new Auth()
  .authenticate(async (request: Request) => {
    const authorization = request.headers.get("authorization");
    
    console.log("🔍 Auth Debug - Authorization header:", authorization);

    if (!authorization) {
      console.log("❌ Auth Debug - Missing authorization header");
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
    if (user.auth_type === "session") {
      if (!permissions.includes("threads:read")) {
        throw new HTTPException(403, { message: "Unauthorized" });
      }
      return { user_id: user.identity };
    }
    // Server access - no restrictions
    return;
  })

  // Allow chat users to create runs (for streaming)
  .on("threads:create_run", ({ user, permissions }) => {
    if (user.auth_type === "session") {
      if (!permissions.includes("threads:stream")) {
        throw new HTTPException(403, { message: "Unauthorized to stream" });
      }
      // Users can only run on threads they own
      return { user_id: user.identity };
    }
    // Server access - no restrictions
    return;
  })

  // DENY chat users from creating threads (they get created server-side)
  .on("threads:create", ({ user, value }) => {
    if (user.auth_type === "session") {
      throw new HTTPException(403, {
        message: "Chat users cannot create threads directly",
      });
    }
    // Server can create threads
    if ("metadata" in value) {
      value.metadata ??= {};
      value.metadata.created_by = user.identity;
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
    return; // Server access allowed
  })

  .on("crons", ({ user }) => {
    if (user.auth_type === "session") {
      throw new HTTPException(403, {
        message: "Chat users cannot access cron jobs",
      });
    }
    return; // Server access allowed
  })

  // === SERVER ACCESS (Bearer Token) - FULL ACCESS ===

  // Fallback handler for any unhandled resources - deny chat users, allow servers
  .on("*", ({ user }) => {
    if (user.auth_type === "session") {
      throw new HTTPException(403, { message: "Access denied" });
    }
    return; // Server access - no restrictions
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
