require("dotenv/config");
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const Anthropic = require("@anthropic-ai/sdk");

// ---------- Startup checks ----------
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY in .env");
}
if (!process.env.MONGO_URI) {
  throw new Error("Missing MONGO_URI in .env");
}

const ALLOWED_DATABASE = "test";
const BLOCKED_COLLECTIONS = ["image_embeddings"];
const MAX_DOC_LIMIT = 20;
const MAX_RESULT_CHARS = 4000;
const MAX_HISTORY_TURNS = 6;
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

// ---------- Resilient Auto-Reconnecting MongoDB Connection ----------
let mongoClient = null;

async function getDb() {
  // Check if client exists and is connected
  if (!mongoClient) {
    console.log("Initializing new MongoDB connection...");
    mongoClient = new MongoClient(process.env.MONGO_URI, {
      maxPoolSize: 5,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    await mongoClient.connect();
    console.log("Successfully connected directly to MongoDB!");
  } else {
    // Ping to verify connection is still alive, auto-reconnect if dropped
    try {
      await mongoClient.db(ALLOWED_DATABASE).command({ ping: 1 });
    } catch (err) {
      console.log(
        "MongoDB connection lost or timed out. Reconnecting...",
        err.message,
      );
      try {
        await mongoClient.close().catch(() => {});
      } catch (e) {}

      mongoClient = new MongoClient(process.env.MONGO_URI, {
        maxPoolSize: 5,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      });
      await mongoClient.connect();
      console.log("MongoDB re-connected successfully!");
    }
  }
  return mongoClient.db(ALLOWED_DATABASE);
}

// ---------- Define Native Tools for Claude ----------
const nativeTools = [
  {
    name: "list-collections",
    description: "List all collections available in the database.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find",
    description:
      "Find documents in a specific collection with an optional query filter.",
    input_schema: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Name of the collection to query",
        },
        filter: {
          type: "object",
          description: "MongoDB query filter object (default {})",
        },
        limit: {
          type: "number",
          description: "Max documents to return (capped at 20)",
        },
      },
      required: ["collection"],
    },
  },
  {
    name: "count",
    description: "Count documents in a collection matching a filter.",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Name of the collection" },
        filter: { type: "object", description: "MongoDB query filter object" },
      },
      required: ["collection"],
    },
  },
  {
    name: "aggregate",
    description: "Run an aggregation pipeline on a collection.",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Name of the collection" },
        pipeline: {
          type: "array",
          items: { type: "object" },
          description: "Aggregation pipeline stages",
        },
      },
      required: ["collection", "pipeline"],
    },
  },
];

// Anthropic caching enabled on the final tool to minimize token cost for definitions
nativeTools[nativeTools.length - 1].cache_control = { type: "ephemeral" };

// ---------- Helper Functions ----------
function extractText(content) {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

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

// Trims chat history to save tokens by dropping old plumbing details
function trimHistory(history) {
  const turnBoundaries = [];
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === "assistant") {
      const hasToolUse =
        Array.isArray(msg.content) &&
        msg.content.some((b) => b.type === "tool_use");
      if (!hasToolUse) turnBoundaries.push(i);
    }
  }

  if (turnBoundaries.length <= MAX_HISTORY_TURNS) return history;

  const cutoffIdx = turnBoundaries[turnBoundaries.length - MAX_HISTORY_TURNS];
  const oldSlice = history.slice(0, cutoffIdx + 1);
  const summarizedMessages = [];
  let pendingUserText = null;

  for (const msg of oldSlice) {
    if (msg.role === "user") {
      const isToolResult =
        Array.isArray(msg.content) &&
        msg.content.some((b) => b.type === "tool_result");
      if (!isToolResult) pendingUserText = extractPlainText(msg.content);
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

  return [...summarizedMessages, ...history.slice(cutoffIdx + 1)];
}

function truncateResult(result) {
  const str = JSON.stringify(result);
  if (str.length > MAX_RESULT_CHARS) {
    return (
      str.slice(0, MAX_RESULT_CHARS) +
      `... [truncated, ${str.length} total chars]`
    );
  }
  return str;
}

// ---------- Execute Native Tool Logic with Auto-Reconnect Wrapper ----------
async function executeNativeTool(name, input) {
  if (input.collection && BLOCKED_COLLECTIONS.includes(input.collection)) {
    throw new Error(
      `The "${input.collection}" collection cannot be queried directly.`,
    );
  }

  // Ensures connection is active before every database operation
  const db = await getDb();

  switch (name) {
    case "list-collections": {
      const collections = await db.listCollections().toArray();
      return collections.map((c) => c.name);
    }
    case "find": {
      const col = db.collection(input.collection);
      const filter = input.filter || {};
      const limit = Math.min(
        Number(input.limit) || MAX_DOC_LIMIT,
        MAX_DOC_LIMIT,
      );
      return await col.find(filter).limit(limit).toArray();
    }
    case "count": {
      const col = db.collection(input.collection);
      const filter = input.filter || {};
      const count = await col.countDocuments(filter);
      return { count };
    }
    case "aggregate": {
      const col = db.collection(input.collection);
      const pipeline = input.pipeline || [];
      pipeline.push({ $limit: MAX_DOC_LIMIT });
      return await col.aggregate(pipeline).toArray();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- Anthropic Setup ----------
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a database assistant with direct access to a MongoDB database.
You may ONLY query the "${ALLOWED_DATABASE}" database. It contains collections such as:
categories, chats, counters, customerinquiries, customers, dailyfootfalls, favitelists,
footfalls, jewelryorders, karigars, monthlyreports, products, salespeople, salestargets, sharelinks.
Always use the tools provided to answer user queries accurately.`;

// Prompt caching enabled via cache_control to dramatically lower input token usage costs
const SYSTEM_BLOCKS = [
  {
    type: "text",
    text: SYSTEM_PROMPT,
    cache_control: { type: "ephemeral" },
  },
];

const sessions = new Map();

// ---------- Router ----------
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message, sessionId = "default" } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ error: "Missing 'message' in request body" });
    }

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }

    let history = sessions.get(sessionId);
    history = trimHistory(history);
    history.push({ role: "user", content: message });

    let response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      system: SYSTEM_BLOCKS,
      tools: nativeTools,
      messages: history,
    });

    const toolLog = [];
    let safetyCounter = 0;

    while (response.stop_reason === "tool_use" && safetyCounter < 5) {
      safetyCounter++;
      history.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b) => b.type === "tool_use",
      );
      const toolResultBlocks = [];

      for (const call of toolUseBlocks) {
        console.log(`Executing native tool: ${call.name}`, call.input);

        let toolResult;
        try {
          // Wrapped with retry mechanism in case the first execution hits a dropped socket
          try {
            toolResult = await executeNativeTool(call.name, call.input);
          } catch (firstErr) {
            console.log(
              "Tool execution failed, retrying once with fresh connection...",
              firstErr.message,
            );
            mongoClient = null; // Reset client instance
            toolResult = await executeNativeTool(call.name, call.input);
          }
        } catch (err) {
          toolResult = { error: err.message };
        }

        toolLog.push({
          tool: call.name,
          args: call.input,
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
        tools: nativeTools,
        messages: history,
      });
    }

    history.push({ role: "assistant", content: response.content });
    sessions.set(sessionId, history);

    res.json({
      reply: extractText(response.content),
      toolCalls: toolLog,
      usage: response.usage,
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Health check ----------
router.get("/health", async (req, res) => {
  try {
    await getDb();
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

module.exports = router;
