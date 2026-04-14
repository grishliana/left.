// =========================
// CRASH PROTECTION
// =========================
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

// =========================
// ENV
// =========================
require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// =========================
// VALIDATION
// =========================
if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("Missing ENV variables");
  process.exit(1);
}

// =========================
// EXPRESS
// =========================
const app = express();
app.get("/", (_, res) => res.send("Bot running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log("Server running on", PORT)
);

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// GROQ
// =========================
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

// =========================
// STATE
// =========================
const users = {};
const queues = new Map();
const activeChannels = new Set();

const botLog = [];
const lastReplyTime = new Map();
const lastReplies = new Map();
const recentTopics = new Map();
const recentBotReplies = new Map();

// =========================
// UTIL
// =========================
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function clean(text) {
  return (text || "")
    .replace(/<@!?\\d+>/g, "")
    .replace(/\\b\\w+#\\d{4}\\b/g, "")
    .trim();
}

// =========================
// RATE LIMIT
// =========================
function canSpeak() {
  const now = Date.now();
  while (botLog.length && now - botLog[0] > 60000) botLog.shift();
  return botLog.length < 5;
}

// =========================
// USER SYSTEM
// =========================
function getUser(id) {
  if (!users[id]) {
    users[id] = {
      affection: 0,
      trust: 0,
      familiarity: 0,
      mood: "neutral",
      memories: { short: [], long: [] }
    };
  }
  return users[id];
}

// =========================
// UPDATE USER
// =========================
function updateUser(u, msg) {
  const t = msg.content.toLowerCase();

  if (t.includes("lol")) u.affection++;
  if (t.includes("?")) u.trust++;
  if (msg.content.length > 30) u.familiarity++;

  u.mood =
    t.includes("lol") ? "playful" :
    t.includes("?") ? "curious" :
    t.includes("bro") ? "teasing" :
    "neutral";

  u.memories.short.push(msg.content);
  if (u.memories.short.length > 12) u.memories.short.shift();

  if (
    msg.content.length > 40 ||
    t.includes("i like") ||
    t.includes("i hate") ||
    t.includes("my ")
  ) {
    u.memories.long.push(msg.content);
    if (u.memories.long.length > 15) u.memories.long.shift();
  }
}

// =========================
// MEMORY
// =========================
function getMemoryContext(user) {
  return `
Recent:
${user.memories.short.slice(-6).join("\n")}

Important:
${user.memories.long.slice(-4).join("\n")}
`;
}

// =========================
// QUEUE
// =========================
function getQueue(id) {
  if (!queues.has(id)) queues.set(id, []);
  return queues.get(id);
}

// =========================
// INTENT SYSTEM
// =========================
function getIntent() {
  const intents = ["react", "ask_question", "tease", "share_opinion", "change_topic"];
  return intents[Math.floor(Math.random() * intents.length)];
}

function maybeShiftTopic() {
  return Math.random() < 0.3;
}

// =========================
// SIMILARITY CHECK (REAL FIX)
// =========================
function isTooSimilar(a, b) {
  if (!a || !b) return false;

  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));

  let overlap = 0;
  setA.forEach(w => {
    if (setB.has(w)) overlap++;
  });

  return overlap / Math.max(setA.size, 1) > 0.6;
}

// =========================
// PERSONA (ANTI-REPEAT CONTROLLED)
// =========================
function getPersona(user, intent, shift, lastBotReply) {
  return `
You are Aliya, a real Discord girl.

CRITICAL RULES:
- NEVER repeat ideas or phrasing from earlier replies
- NEVER use the same conversational pattern twice in a row
- If repetition risk is high → change topic immediately
- Avoid filler-only replies ("lol", "idk") as full responses
- Always move conversation forward

CONVERSATION CONTROL:
- If stable → introduce new angle or question
- If repetitive → shift topic aggressively
- If user repeats → respond differently each time

STYLE:
- natural, lowercase texting
- short but meaningful responses
- human imperfection allowed

INTENT: ${intent}
TOPIC SHIFT: ${shift ? "yes" : "no"}

LAST BOT MESSAGE:
${lastBotReply || "none"}

MEMORY:
${getMemoryContext(user)}
`;
}

// =========================
// VARIATION ENGINE
// =========================
const shortReplies = ["lol","idk","fr","nah","wait","tbh","kinda","real","ok","yeah","maybe"];
const reactions = ["??","what","no way","nahh","fr?","wait what","bro","lmao what"];

function diversifyMessage(userId, text) {
  text = text.toLowerCase();

  const type = ["short","normal","reaction"][Math.floor(Math.random()*3)];

  if (type === "short" && Math.random() < 0.3) {
    text = shortReplies[Math.floor(Math.random() * shortReplies.length)];
  }

  if (type === "reaction" && Math.random() < 0.25) {
    text = reactions[Math.floor(Math.random() * reactions.length)];
  }

  if (Math.random() < 0.12) {
    text = text.split(" ").slice(0, -1).join(" ");
  }

  if (!lastReplies.has(userId)) lastReplies.set(userId, []);
  const history = lastReplies.get(userId);

  if (history.some(h => isTooSimilar(h, text))) {
    text += " ...idk";
  }

  history.push(text);
  if (history.length > 6) history.shift();

  return text.trim();
}

// =========================
// PROCESS QUEUE (BUG FREE CORE)
// =========================
async function processQueue(channelId) {
  if (activeChannels.has(channelId)) return;
  activeChannels.add(channelId);

  const queue = getQueue(channelId);

  try {
    while (queue.length > 0) {
      const { message, user } = queue.shift();

      if (!canSpeak()) {
        await sleep(1000);
        queue.unshift({ message, user });
        continue;
      }

      const now = Date.now();
      const last = lastReplyTime.get(channelId) || 0;

      if (now - last < 4000) {
        await sleep(1000);
        queue.unshift({ message, user });
        continue;
      }

      lastReplyTime.set(channelId, now);
      botLog.push(now);

      const intent = getIntent();
      const shift = maybeShiftTopic();

      const lastBotReply = recentBotReplies.get(channelId) || "";
      recentBotReplies.set(channelId, message.content);

      recentTopics.set(channelId, intent);

      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 1.25,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: getPersona(user, intent, shift, lastBotReply)
          },
          {
            role: "user",
            content: `
${getMemoryContext(user)}

Chat:
${message.content}
`
          }
        ]
      });

      let reply = clean(res?.choices?.[0]?.message?.content || "hm");
      reply = diversifyMessage(message.author.id, reply);

      const delay = Math.min(3000, 500 + reply.length * 25);

      await message.channel.sendTyping();
      await sleep(delay);

      await message.reply(reply);
    }
  } finally {
    activeChannels.delete(channelId);
  }
}

// =========================
// MESSAGE HANDLER
// =========================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const user = getUser(message.author.id);
  updateUser(user, message);

  const queue = getQueue(message.channel.id);
  queue.push({ message, user });

  processQueue(message.channel.id);
});

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);