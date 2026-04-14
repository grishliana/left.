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
const buffers = new Map();
const queues = new Map();
const processing = new Map();
const botLog = [];
const lastReplyTime = new Map();
const lastReplies = new Map();

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
      relationship: "stranger",
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

  u.affection = Math.max(-20, Math.min(100, u.affection));
  u.trust = Math.max(-20, Math.min(100, u.trust));
  u.familiarity = Math.max(0, Math.min(100, u.familiarity));

  if (t.includes("lol")) u.mood = "playful";
  else if (t.includes("?")) u.mood = "curious";
  else if (t.includes("bro")) u.mood = "teasing";
  else u.mood = "neutral";

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
// MEMORY CONTEXT
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
// BUFFER / QUEUE
// =========================
function getBuffer(id) {
  if (!buffers.has(id)) buffers.set(id, []);
  return buffers.get(id);
}

function getQueue(id) {
  if (!queues.has(id)) queues.set(id, []);
  return queues.get(id);
}

// =========================
// INTENT SYSTEM
// =========================
function getIntent() {
  const intents = [
    "react",
    "ask_question",
    "tease",
    "share_opinion",
    "change_topic"
  ];
  return intents[Math.floor(Math.random() * intents.length)];
}

// =========================
// TOPIC SHIFT
// =========================
function maybeShiftTopic() {
  return Math.random() < 0.25;
}

// =========================
// PERSONA
// =========================
function getPersona(user, intent, shift) {
  return `
You are Aliya, a real girl chatting on Discord.

STYLE:
- natural, relaxed, human
- not dry, not over-energetic

TEXTING:
- lowercase
- mix of short and medium replies
- occasional "lol", "idk", "ngl"
- sometimes pauses "..."

BEHAVIOR:
- not an assistant
- imperfect, human
- sometimes playful, sometimes chill

MEMORY USAGE:
- reference past things naturally sometimes
- don't repeat yourself
- build on conversations
- if convo gets repetitive, shift naturally

INTENT: ${intent}
TOPIC: ${shift ? "shift topic slightly" : "stay on topic"}

MOOD: ${user.mood}
RELATIONSHIP: ${user.relationship}

MEMORY:
${getMemoryContext(user)}
`;
}

// =========================
// STYLE + DIVERSITY
// =========================
const shortReplies = [
  "lol", "idk", "fr", "nah", "wait", "lowkey",
  "tbh", "kinda", "real", "huh", "ok", "yeah", "maybe"
];

const reactions = [
  "??", "what", "no way", "nahh", "fr?",
  "wait what", "you serious?", "bro", "lmao what"
];

function diversifyMessage(userId, text) {
  text = text.toLowerCase();

  const type = ["short", "normal", "reaction"][
    Math.floor(Math.random() * 3)
  ];

  if (type === "short" && Math.random() < 0.4) {
    text = shortReplies[Math.floor(Math.random() * shortReplies.length)];
  }

  if (type === "reaction" && Math.random() < 0.3) {
    text = reactions[Math.floor(Math.random() * reactions.length)];
  }

  if (Math.random() < 0.2) {
    text += ["...", " lol"][Math.floor(Math.random() * 2)];
  }

  // human imperfection (cut off)
  if (Math.random() < 0.15) {
    text = text.split(" ").slice(0, -1).join(" ");
  }

  if (!lastReplies.has(userId)) lastReplies.set(userId, []);
  const history = lastReplies.get(userId);

  // pattern-level anti-repeat
  if (history.some(h => h.slice(0, 10) === text.slice(0, 10))) {
    text += " idk why but yeah";
  }

  history.push(text);
  if (history.length > 6) history.shift();

  return text.trim();
}

// =========================
// PROCESS QUEUE
// =========================
async function processQueue(channelId) {
  if (processing.get(channelId)) return;
  processing.set(channelId, true);

  const queue = getQueue(channelId);

  while (queue.length > 0) {
    const { message, user } = queue.shift();

    if (!canSpeak()) continue;

    const now = Date.now();
    const last = lastReplyTime.get(channelId) || 0;
    if (now - last < 4000) continue;
    lastReplyTime.set(channelId, now);

    botLog.push(Date.now());

    const buffer = getBuffer(channelId);

    const intent = getIntent();
    const shift = maybeShiftTopic();

    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 1.2,
      max_tokens: 120,
      messages: [
        { role: "system", content: getPersona(user, intent, shift) },
        {
          role: "user",
          content: `
${getMemoryContext(user)}

Chat:
${buffer.map(m => m.content).join("\n")}
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

  processing.set(channelId, false);
}

// =========================
// MESSAGE HANDLER
// =========================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const user = getUser(message.author.id);
  updateUser(user, message);

  const buffer = getBuffer(message.channel.id);
  buffer.push({ content: message.content });
  if (buffer.length > 10) buffer.shift();

  const shouldReply =
    message.mentions.has(client.user) ||
    (Math.random() < 0.07 && message.content.length > 3);

  if (!shouldReply || !canSpeak()) return;

  const queue = getQueue(message.channel.id);
  queue.push({ message, user });

  if (!processing.get(message.channel.id)) {
    processQueue(message.channel.id);
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);