
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const allowedOrigins = (
  process.env.CORS_ORIGIN || ""
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const io = new Server(server, {

  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },

  transports: ["websocket", "polling"],

  pingInterval: 25000,
  pingTimeout: 20000

});


/* =====================================
   MEMORY STORAGE
===================================== */

const channels = new Map();

const MAX_CHANNELS = 500;
const MAX_MESSAGES = 100;

const EMPTY_CHANNEL_TTL = 30 * 60 * 1000;


/* =====================================
   HTTP
===================================== */

app.get("/", (req, res) => {

  res.json({
    name: "schooltlk.io",
    status: "online"
  });

});

app.get("/health", (req, res) => {

  res.json({
    status: "ok"
  });

});


/* =====================================
   VALIDATION
===================================== */

function validChannel(value) {

  return (
    typeof value === "string" &&
    /^[a-z0-9_-]{1,40}$/.test(value)
  );

}

function cleanText(value, maxLength) {

  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);

}


/* =====================================
   CHANNEL
===================================== */

function getChannel(name) {

  if (!channels.has(name)) {

    if (channels.size >= MAX_CHANNELS) {
      return null;
    }

    channels.set(name, {

      users: new Map(),

      messages: [],

      cleanupTimer: null

    });

  }

  return channels.get(name);

}


/* =====================================
   USERS
===================================== */

function publicUsers(channel) {

  return Array.from(
    channel.users.entries()
  ).map(([id, nickname]) => ({

    id,
    nickname

  }));

}


/* =====================================
   CLEANUP
===================================== */

function cancelCleanup(channel) {

  if (channel.cleanupTimer) {

    clearTimeout(channel.cleanupTimer);

    channel.cleanupTimer = null;

  }

}


function scheduleCleanup(name, channel) {

  cancelCleanup(channel);

  if (channel.users.size !== 0) return;

  channel.cleanupTimer = setTimeout(() => {

    if (
      channel.users.size === 0 &&
      channels.get(name) === channel
    ) {

      channels.delete(name);

      console.log("Channel deleted:", name);

    }

  }, EMPTY_CHANNEL_TTL);

}


/* =====================================
   LEAVE CHANNEL
===================================== */

function leaveChannel(socket) {

  const name = socket.data.channel;

  if (!name) return;

  const channel = channels.get(name);

  socket.data.channel = null;

  if (!channel) return;

  const nickname = channel.users.get(socket.id);

  channel.users.delete(socket.id);

  socket.leave(name);

  if (nickname) {

    io.to(name).emit("user-left", {

      nickname,

      users: publicUsers(channel)

    });

  }

  if (channel.users.size === 0) {

    scheduleCleanup(name, channel);

  }

}


/* =====================================
   SOCKET CONNECTION
===================================== */

io.on("connection", socket => {

  console.log("Connected:", socket.id);


  /* JOIN */

  socket.on("join-channel", (data, callback) => {

    const reply =
      typeof callback === "function"
        ? callback
        : () => {};

    const channelName = cleanText(data?.channel, 40);

    const nickname = cleanText(data?.nickname, 20);

    if (!validChannel(channelName)) {

      return reply({

        ok: false,

        error: "올바르지 않은 채널 이름입니다."

      });

    }

    if (!nickname) {

      return reply({

        ok: false,

        error: "닉네임을 입력해 주세요."

      });

    }

    if (socket.data.channel === channelName) {

      return reply({

        ok: true,

        channel: channelName

      });

    }

    leaveChannel(socket);

    const channel = getChannel(channelName);

    if (!channel) {

      return reply({

        ok: false,

        error: "현재 채널 수 제한에 도달했습니다."

      });

    }

    cancelCleanup(channel);

    socket.join(channelName);

    socket.data.channel = channelName;

    channel.users.set(socket.id, nickname);

    reply({

      ok: true,

      channel: channelName,

      messages: channel.messages,

      users: publicUsers(channel)

    });

    socket.to(channelName).emit("user-joined", {

      nickname,

      users: publicUsers(channel)

    });

    console.log(
      nickname + " joined #" + channelName
    );

  });


  /* SEND MESSAGE */

  socket.on("send-message", data => {

    const channelName = socket.data.channel;

    if (!channelName) return;

    const channel = channels.get(channelName);

    if (!channel) return;

    const nickname = channel.users.get(socket.id);

    if (!nickname) return;

    const content = cleanText(data?.message, 1000);

    if (!content) return;

    // 전송 간격 제한
    const now = Date.now();

    const lastMessage = socket.data.lastMessage || 0;

    if (now - lastMessage < 500) return;

    socket.data.lastMessage = now;

    const message = {

      id: `${now}-${socket.id}`,

      nickname,

      message: content,

      time: now

    };

    channel.messages.push(message);

    if (channel.messages.length > MAX_MESSAGES) {

      channel.messages.shift();

    }

    io.to(channelName).emit("new-message", message);

  });


  /* LEAVE */

  socket.on("leave-channel", () => {

    leaveChannel(socket);

  });


  /* DISCONNECT */

  socket.on("disconnect", () => {

    leaveChannel(socket);

    console.log("Disconnected:", socket.id);

  });

});


/* =====================================
   START SERVER
===================================== */

server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `schooltlk.io server running on port ${PORT}`
  );

});
