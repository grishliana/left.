// 🚨 crash protection (TOP)
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// 🔐 ENV CHECK
if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("❌ Missing DISCORD_TOKEN or GROQ_API_KEY");
  process.exit(1);
}

// 🤖 Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 🧠 Groq setup
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// 💘 OPTIONAL
const CRUSH_ID = "123456789012345678";

// 🧠 memory
let memory = [];

// 👥 track active users
let activeUsers = new Map();

// ⏱️ cooldown
let lastReplyTime = 0;

// 🎭 mood system
const moods = ["happy", "shy", "playful", "tired", "jealous"];
let currentMood = "shy";

setInterval(() => {
  currentMood = moods[Math.floor(Math.random() * moods.length)];
  console.log("Mood changed to:", currentMood);
}, 120000);

// 👥 helper
function getRandomActiveUser() {
  const now = Date.now();

  const recent = [...activeUsers.entries()]
    .filter(([_, time]) => now - time < 120000)
    .map(([id]) => id);

  if (recent.length === 0) return null;

  return recent[Math.floor(Math.random() * recent.length)];
}

// ✅ ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ⚠️ logging
client.on("error", console.error);
client.on("warn", console.warn);

// 💬 message handler
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    activeUsers.set(message.author.id, Date.now());

    let isReplyToBot = false;

    if (message.reference) {
      try {
        const repliedMsg = await message.fetchReference();
        if (repliedMsg.author.id === client.user.id) {
          isReplyToBot = true;
        }
      } catch {}
    }

    const isMentioned =
      message.content.includes(`<@${client.user.id}>`) ||
      message.content.includes(`<@!${client.user.id}>`);

    let shouldReply = isMentioned || isReplyToBot;

    // 🎯 rare random interaction
    if (!shouldReply) {
      let chance = 0.02;

      if (message.author.id === CRUSH_ID) {
        chance = 0.10;
      }

      const randomUserId = getRandomActiveUser();

      if (randomUserId && Math.random() < chance) {
        shouldReply = true;
      }
    }

    // ⏱️ cooldown (30–60 sec)
    const now = Date.now();
    if (now - lastReplyTime < 30000 + Math.random() * 30000) {
      shouldReply = false;
    }

    if (!shouldReply) return;

    const prompt = message.content.replace(/<@!?\d+>/g, "").trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length