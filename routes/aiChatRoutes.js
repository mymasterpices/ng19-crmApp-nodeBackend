require("dotenv/config");
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const { Client } = require("@modelcontextprotocol/sdk/client");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

// ---------- Startup checks ----------
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY in .env");
}
if (!process.env.MONGO_URI) {
  throw new Error("Missing MONGO_URI in .env");
}

// ---------- Restrict agent to a single database ----------
// "test" is a DATABASE (not a collection) that contains many collections,
// e.g. categories, chats, customers, products, salespeople, etc.
// Your MONGO_URI already points at it:
//   mongodb://localhost:27017/test
// This constant restricts the agent to only ever touch the "test" database,
// regardless of what the model asks for. Any collection *inside* "test" is fine.
const ALLOWED_DATABASE = "test";

// ---------- Token-usage guardrails ----------
// Collections that must never be sent to the model raw (e.g. vector
// embeddings are hundreds/thousands of floats per document and will
// blow up your input tokens almost instantly).
const BLOCKED_COLLECTIONS = ["image_embeddings"];

// Hard cap on how many documents any single find/aggregate call can
// return, regardless of what the model asks for.
const MAX_DOC_LIMIT = 20;

// Hard cap on how many characters of a tool result get sent back to
// the model. This is a backstop in case a query returns a small number
// of documents that are individually huge (large arrays, long text
// fields, etc).
const MAX_RESULT_CHARS = 4000;

// How many of the most recent user/assistant turns to keep in full.
// Older turns are summarized down to a single compact line instead of
// being resent verbatim (and their tool-call/tool-result plumbing is
// dropped entirely).
const MAX_HISTORY_TURNS = 6;

// Only allow read/inspection-style tools, scoped to the "test" database.
// "list-collections" is allowed so the model can discover which collections
// exist inside "test" (categories, customers, products, etc.). "list-databases"
// is excluded since the model should never need to see other databases.
const ALLOWED_TOOLS = [
  "find",
  "aggregate",
  "count",
  "list-collections",
  "collection-schema",
  "collection-indexes",
  "db-stats",
  "explain",
];

const ANTHROPIC_MODEL = "claude-sonnet-4-6"; // verify current model name in Anthropic's docs if this errors

// ---------- Convert MCP tool defs -> Anthropic tool definitions ----------
// Anthropic's Messages API accepts standard JSON Schema directly under
// "input_schema", so we just do light cleanup (stripping stray fields
// like "$schema") and rename the key.
function cleanSchemaForAnthropic(schema) {
  if (!schema || typeof schema !== "object") {
    return { type: "string" };
  }

  const type = schema.type || "object";
  const clean = { type };

  if (schema.description) clean.description = schema.description;

  if (type === "object") {
    if (schema.properties) {
      clean.properties = {};
      for (const [key, val] of Object.entries(schema.properties)) {
        clean.properties[key] = cleanSchemaForAnthropic(val);
      }
    } else {
      clean.properties = {};
    }
    if (schema.required) clean.required = schema.required;
  }

  if (type === "array") {
    clean.items = schema.items
      ? cleanSchemaForAnthropic(schema.items)
      : { type: "string" };
  }

  return clean;
}

// Helper to extract plain text from an Anthropic response's content blocks
function extractText(content) {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// Helper to extract plain text from a single user or assistant message's
// content, whether it's a plain string or an array of content blocks.
function extractPlainText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ");
  }
  return "";
}

// Trims a session's history so old tool-call/tool-result plumbing
// doesn't get resent (and re-billed) on every future request. Keeps the
// last MAX_HISTORY_TURNS user/assistant exchanges verbatim, and
// collapses everything older into short one-line summaries containing
// only the user question and the assistant's final text answer (no
// tool_use / tool_result blocks, which is where the token bloat lives).
function trimHistory(history) {
  // Identify indices where a "final" assistant text turn ends a full
  // user request (i.e. assistant content has no tool_use blocks).
  const turnBoundaries = [];
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === "assistant") {
      const hasToolUse =
        Array.isArray(msg.content) &&
        msg.content.some((b) => b.type === "tool_use");
      if (!hasToolUse) {
        turnBoundaries.push(i); // this index completes a turn
      }
    }
  }

  if (turnBoundaries.length <= MAX_HISTORY_TURNS) {
    return history; // nothing to trim yet
  }

  const cutoffBoundaryIdx = turnBoundaries.length - MAX_HISTORY_TURNS;
  const cutoffIdx = turnBoundaries[cutoffBoundaryIdx]; // keep everything after this index in full

  // Everything from index 0 to cutoffIdx (inclusive) is old history.
  // Walk it and pull out just the user text + final assistant text per turn.
  const oldSlice = history.slice(0, cutoffIdx + 1);
  const summarizedMessages = [];
  let pendingUserText = null;

  for (const msg of oldSlice) {
    if (msg.role === "user") {
      // Only treat it as a "new user turn" if it's a plain text message,
      // not a tool_result block (which we're dropping entirely).
      const isToolResult =
        Array.isArray(msg.content) &&
        msg.content.some((b) => b.type === "tool_result");
      if (!isToolResult) {
        pendingUserText = extractPlainText(msg.content);
      }
    } else if (msg.role === "assistant") {
      const hasToolUse =
        Array.isArray(msg.content) &&
        msg.content.some((b) => b.type === "tool_use");
      if (!hasToolUse && pendingUserText !== null) {
        const assistantText = extractPlainText(msg.content);
        summarizedMessages.push({
          role: "user",
          content: `[earlier question] ${pendingUserText}`,
        });
        summarizedMessages.push({
          role: "assistant",
          content: `[earlier answer] ${assistantText}`,
        });
        pendingUserText = null;
      }
    }
  }

  const recentSlice = history.slice(cutoffIdx + 1);
  return [...summarizedMessages, ...recentSlice];
}

// Server-side guardrail: force every tool call's "database" argument (if
// present) to be the allowed one, reject calls that try to target any
// other database, block sensitive collections, and force a hard cap on
// how many documents can come back. Collections inside "test" are NOT
// restricted beyond the blocklist below — the model is free to query
// whichever (non-blocked) collection it needs.
function enforceDatabaseScope(call) {
  const args = { ...(call.input || {}) };

  if ("database" in args && args.database !== ALLOWED_DATABASE) {
    return {
      blocked: true,
      reason: `Access to database "${args.database}" is not allowed. Only "${ALLOWED_DATABASE}" is permitted.`,
    };
  }

  // Force it explicitly in case the model omitted it.
  args.database = ALLOWED_DATABASE;

  if (args.collection && BLOCKED_COLLECTIONS.includes(args.collection)) {
    return {
      blocked: true,
      reason: `The "${args.collection}" collection cannot be queried directly (large binary/vector fields would exhaust the context window). Ask about a different collection.`,
    };
  }

  // Force a hard document-count cap regardless of what the model asked
  // for. This applies to find/aggregate/count-style calls that accept
  // a "limit" argument; harmless no-op for tools that don't use it.
  if ("limit" in args) {
    args.limit = Math.min(Number(args.limit) || MAX_DOC_LIMIT, MAX_DOC_LIMIT);
  } else {
    args.limit = MAX_DOC_LIMIT;
  }

  return { blocked: false, args };
}

// Truncates a tool result before it's sent back to the model, as a hard
// backstop against any single response being enormous (e.g. one
// document with a huge embedded array/text field) even after the
// document-count cap above.
function truncateResult(result) {
  const str = JSON.stringify(result);
  if (str.length > MAX_RESULT_CHARS) {
    return (
      str.slice(0, MAX_RESULT_CHARS) +
      `... [truncated, ${str.length} total chars — refine your query/filter for more targeted results]`
    );
  }
  return str;
}

// ---------- Lazy async context (MCP connection + Anthropic tools) ----------
// Connecting to the MongoDB MCP server and listing its tools is async,
// but this file needs to export a plain Express Router synchronously
// (so `app.use('/api/ai-chat', require('./routes/aiChatRoutes'))` works
// like any other route file). So instead of doing this setup at
// require-time, we do it lazily on the FIRST incoming request and cache
// the resulting promise — every request (first or later) awaits the
// same promise, so the MCP connection only happens once.
let contextPromise = null;

function getContext() {
  if (!contextPromise) {
    contextPromise = buildContext().catch((err) => {
      // If setup failed, clear the cache so the NEXT request can retry
      // instead of being permanently stuck on a rejected promise.
      contextPromise = null;
      throw err;
    });
  }
  return contextPromise;
}

async function buildContext() {
  // ---------- Connect to MongoDB MCP server ----------
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "mongodb-mcp-server@latest"],
    env: {
      MDB_MCP_CONNECTION_STRING: process.env.MONGO_URI,
    },
  });

  const mcpClient = new Client(
    { name: "crm-agent", version: "1.0" },
    { capabilities: {} },
  );

  console.log("Connecting to MongoDB MCP server...");
  await mcpClient.connect(transport);
  console.log("MCP server connected.");

  const mcpToolsResponse = await mcpClient.listTools();
  console.log(
    "Available MCP tools:",
    mcpToolsResponse.tools.map((t) => t.name),
  );

  const anthropicTools = mcpToolsResponse.tools
    .filter((t) => ALLOWED_TOOLS.includes(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description || `Tool: ${t.name}`,
      input_schema: cleanSchemaForAnthropic(t.inputSchema),
    }));

  // Mark the last tool definition as cacheable. Anthropic caches the
  // entire tools array (and everything before the marked block) as a
  // single prefix, so putting cache_control on the final tool is enough
  // to cache all of them. Since ALLOWED_TOOLS/anthropicTools never change
  // at runtime, this prefix will be a cache hit on every request after
  // the first, cutting the tool-definition tokens down to near-zero cost.
  if (anthropicTools.length > 0) {
    anthropicTools[anthropicTools.length - 1].cache_control = {
      type: "ephemeral",
    };
  }

  // ---------- Anthropic setup ----------
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // System prompt: tells Claude it may only ever query the "test" database.
  // Sent as a cacheable content block (see SYSTEM_BLOCKS below) since it's
  // identical on every request.
  const SYSTEM_PROMPT = `You are a database assistant with access to a MongoDB database via tools.
You may ONLY query the "${ALLOWED_DATABASE}" database. It contains multiple collections
(for example: categories, chats, counters, customerinquiries, customers, dailyfootfalls,
favitelists, footfalls, image_embeddings, jewelryorders, karigars, monthlyreports, products,
salespeople, salestargets, sharelinks). You may query ANY collection inside "${ALLOWED_DATABASE}",
but never call a tool against any other database, even if the user asks about one.
If the user asks about data outside the "${ALLOWED_DATABASE}" database, politely explain that
you only have access to the "${ALLOWED_DATABASE}" database.
Whenever a tool requires a "database" argument, always set it to "${ALLOWED_DATABASE}".
Use "list-collections" first if you're unsure which collection holds the data you need.
Results from tools are capped at ${MAX_DOC_LIMIT} documents and may be truncated for length;
if you need more, refine your filter rather than assuming you're missing data.
The "${BLOCKED_COLLECTIONS.join(", ")}" collection(s) cannot be queried directly.`;

  // System must be an array of content blocks to attach cache_control.
  // This is the SAME text on every request, so after the first call it
  // becomes a cache read instead of a fresh (billed at full price) input.
  const SYSTEM_BLOCKS = [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  // ---------- In-memory chat history store (per session id) ----------
  // For real apps, persist this per-user in Mongo/Redis instead.
  const sessions = new Map();

  return { mcpClient, anthropic, anthropicTools, SYSTEM_BLOCKS, sessions };
}

function getOrCreateHistory(sessions, sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []); // array of {role, content} messages
  }
  return sessions.get(sessionId);
}

// ---------- Router ----------
const router = express.Router();

// This router file assumes the parent app already applies cors() and
// express.json() globally. If it doesn't, uncomment these two lines:
// router.use(cors());
// router.use(express.json());

// ---------- Main chat route ----------
router.post("/", async (req, res) => {
  try {
    const { mcpClient, anthropic, anthropicTools, SYSTEM_BLOCKS, sessions } =
      await getContext();

    const { message, sessionId = "default" } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ error: "Missing 'message' in request body" });
    }

    let history = getOrCreateHistory(sessions, sessionId);
    history = trimHistory(history);
    history.push({ role: "user", content: message });

    let response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      system: SYSTEM_BLOCKS,
      tools: anthropicTools,
      messages: history,
    });

    const toolLog = []; // so you can see in Postman what tools got called

    // Loop until Claude stops requesting tool calls
    let safetyCounter = 0;
    while (response.stop_reason === "tool_use" && safetyCounter < 5) {
      safetyCounter++;

      // Push assistant's turn (including tool_use blocks) into history
      history.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use",
      );

      const toolResultBlocks = [];

      for (const call of toolUseBlocks) {
        console.log(`Claude requested tool: ${call.name}`, call.input);

        const scoped = enforceDatabaseScope(call);

        let toolResult;
        if (scoped.blocked) {
          toolResult = { error: scoped.reason };
        } else {
          try {
            const mcpResult = await mcpClient.callTool({
              name: call.name,
              arguments: scoped.args,
            });
            toolResult = mcpResult;
          } catch (toolErr) {
            toolResult = { error: toolErr.message };
          }
        }

        toolLog.push({
          tool: call.name,
          args: scoped.blocked ? call.input : scoped.args,
          result: toolResult,
        });

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: truncateResult(toolResult),
        });
      }

      history.push({ role: "user", content: toolResultBlocks });

      response = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1000,
        system: SYSTEM_BLOCKS,
        tools: anthropicTools,
        messages: history,
      });
    }

    // Push final assistant reply into history
    history.push({ role: "assistant", content: response.content });

    // Persist the (already trimmed, now extended) history back to the
    // session store.
    sessions.set(sessionId, history);

    res.json({
      reply: extractText(response.content),
      toolCalls: toolLog, // helpful for debugging in Postman
      usage: response.usage, // check cache_read_input_tokens / cache_creation_input_tokens here
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Health check ----------
router.get("/health", async (req, res) => {
  try {
    await getContext(); // will throw if MCP connection is broken/failing
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

module.exports = router;
