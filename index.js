// =========================
// 🚨 CRASH PROTECTION
// =========================
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

// =========================
// ENV
// =========================
require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// =========================
// ENV CHECK
// =========================
if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("❌ Missing DISCORD_TOKEN or GROQ_API_KEY");
  process.exit(1);
}

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =========================
// GROQ CLIENT
// =========================
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// =========================
// CONFIG
// =========================
const ALLOWED_CHANNEL_ID = "YOUR_CHANNEL_ID_HERE";

// =========================
// STATE
// =========================
let memory = [];
let lastReply = "";
let recentReplies = [];
let botMessageTimestamps = [];

const MAX_MESSAGES_PER_MIN = 5;
const WINDOW = 60000;

// =========================
// READY
// =========================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =========================
// HELPERS
// =========================
function cleanBotHistory() {
  const now = Date.now();
  botMessageTimestamps = botMessageTimestamps.filter(
    (t) => now - t < WINDOW
  );
}

function makeDiscordLike(text) {
  if (!text) return "idk";

  let t = text.toLowerCase();

  const swaps = [
    ["i am", "im"],
    ["you are", "ur"],
    ["are you", "r u"],
    ["what is", "what's"],
    ["do not", "dont"],
    ["cannot", "cant"],
    ["because", "bc"],
  ];

  for (const [a, b] of swaps) {
    t = t.replaceAll(a, b);
  }

  const endings = [" lol", " idk", " tbh"];
  if (Math.random() < 0.3) {
    t += endings[Math.floor(Math.random() * endings.length)];
  }

  return t.replace(/\.$/, "").trim();
}

function isRepeating(reply) {
  const cleaned = reply.toLowerCase().trim();

  if (cleaned === lastReply.toLowerCase().trim()) return true;

  const spam = ["idk", "lol", "maybe", "hmm", "ok"];
  if (spam.includes(cleaned)) {
    if (recentReplies.slice(-3).every((r) => r === cleaned)) {
      return true;
    }
  }

  return false;
}

// =========================
// MESSAGE HANDLER
// =========================
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

    const now = Date.now();

    cleanBotHistory();
    if (botMessageTimestamps.length >= MAX_MESSAGES_PER_MIN) return;

    const shouldReply =
      message.content.includes(`<@${client.user.id}>`) ||
      Math.random() < 0.08;

    if (!shouldReply) return;

    const prompt = message.content.replace(/<@!?\d+>/g, "").trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length > 25) memory.shift();

    let response;

    try {
      response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 60,
        temperature: 1,
        messages: [
          {
            role: "system",
            content: `
You are a Discord user.

RULES:
- 1 sentence only
- no emotions
- no storytelling
- short casual replies
            `,
          },
          ...memory,
          {
            role: "user",
            content: prompt || "say something casual",
          },
        ],
      });
    } catch (err) {
      console.error(err);
      return message.reply("im kinda slow rn...");
    }

    let reply =
      response?.choices?.[0]?.message?.content || "hm...";

    reply = reply.toLowerCase().split(/[.!?]/)[0];
    reply = makeDiscordLike(reply);

    if (isRepeating(reply)) reply = "hm...";

    lastReply = reply;
    recentReplies.push(reply);
    if (recentReplies.length > 10) recentReplies.shift();

    await message.reply(reply);

    botMessageTimestamps.push(now);
  } catch (err) {
    console.error(err);
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);
