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
const CRUSH_ID = "123456789012345678"; // replace if needed

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

    // track active users
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
      let chance = 0.02; // VERY LOW

      if (message.author.id === CRUSH_ID) {
        chance = 0.10; // slightly higher
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

    // clean message
    const prompt = message.content.replace(/<@!?\d+>/g, "").trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length > 6) memory.shift();

    // ⏳ typing delay
    await new Promise((res) =>
      setTimeout(res, 1000 + Math.random() * 2000)
    );

    const response = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      max_tokens: 60,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `
You are a Volga Tatar girl chatting on Discord.

Current mood: ${currentMood}

Personality:
- short replies (1 sentence, max 2)
- casual, lowercase sometimes
- playful, slightly shy
- loves volleyball
- has a crush on one boy (acts different with him)

Mood behavior:
- happy: energetic
- shy: soft, awkward
- playful: teasing
- jealous: slightly annoyed
- tired: dry, low energy

Never sound like AI. Never write long messages.
          `,
        },
        ...memory,
        {
          role: "user",
          content: prompt || "say something casual",
        },
      ],
    });

    let reply =
      response.choices?.[0]?.message?.content || "idk what to say lol";

    memory.push({ role: "assistant", content: reply });
    if (memory.length > 6) memory.shift();

    reply = reply.slice(0, 2000);

    const randomUserId = getRandomActiveUser();

    // 🎯 VERY rare direct ping
    if (randomUserId && Math.random() < 0.1) {
      await message.channel.send(`<@${randomUserId}> ${reply}`);
    } else {
      await message.reply(reply);
    }

    // update cooldown
    lastReplyTime = Date.now();

  } catch (error) {
    console.error("❌ Message handler error:", error);
  }
});

// 🚀 login
client.login(process.env.DISCORD_TOKEN);