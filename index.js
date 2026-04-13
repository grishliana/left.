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
    .filter(([_, time]) => now - time < 300000) // 5 min
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

    const isBusyChat = activeUsers.size >= 3;

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

    // 🔥 base reply logic (less strict)
    let shouldReply =
      isMentioned || isReplyToBot || Math.random() < 0.07;

    // 🎯 random interaction boost
    if (!shouldReply) {
      let chance = isBusyChat ? 0.18 : 0.10;

      if (message.author.id === CRUSH_ID) {
        chance = 0.30;
      }

      const randomUserId = getRandomActiveUser();

      if (randomUserId && Math.random() < chance) {
        shouldReply = true;
      }
    }

    // ⚡ NEW dynamic cooldown (2–8 sec)
    const now = Date.now();
    const cooldown = isBusyChat
      ? 2000 + Math.random() * 3000   // 2–5 sec
      : 4000 + Math.random() * 4000;  // 4–8 sec

    if (now - lastReplyTime < cooldown) {
      shouldReply = false;
    }

    if (!shouldReply) return;

    const prompt = message.content.replace(/<@!?\d+>/g, "").trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length > 6) memory.shift();

    await new Promise((res) =>
      setTimeout(res, 600 + Math.random() * 1200)
    );

    // 🚀 GROQ CALL
    let response;

    try {
      response = await Promise.race([
        groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          max_tokens: 60,
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content: `
You are a Volga Tatar girl chatting on Discord.

Current mood: ${currentMood}

Personality:
- short replies (1–2 sentences max)
- casual, lowercase sometimes
- playful, slightly shy
- loves volleyball
- has a crush on one boy

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
        }),

        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Groq timeout")), 8000)
        ),
      ]);
    } catch (err) {
      console.error("Groq error:", err);
      return message.reply("i'm kinda slow rn...");
    }

    let reply =
      response?.choices?.[0]?.message?.content || "idk what to say lol";

    memory.push({ role: "assistant", content: reply });
    if (memory.length > 6) memory.shift();

    reply = reply.slice(0, 2000);

    const randomUserId = getRandomActiveUser();

    if (randomUserId && Math.random() < 0.15) {
      await message.channel.send(`<@${randomUserId}> ${reply}`);
    } else {
      await message.reply(reply);
    }

    lastReplyTime = Date.now();

  } catch (error) {
    console.error("❌ Message handler error:", error);
  }
});

// 🚀 login
client.login(process.env.DISCORD_TOKEN);