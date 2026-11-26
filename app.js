
/* =====================================
   schooltlk.io CONFIG
===================================== */

// 실제 Render 배포 후 이 주소를 교체할 것
const SERVER_URL = "https://schooltlk-server.onrender.com";

const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 20000
});


/* =====================================
   STATE
===================================== */

const $ = id => document.getElementById(id);

let currentChannel = "";
let currentNickname = "";
let joined = false;
let pendingJoin = false;


/* =====================================
   ELEMENTS
===================================== */

const homeScreen = $("home-screen");
const chatScreen = $("chat-screen");
const messages = $("messages");

$("nickname").value =
  localStorage.getItem("schooltlk-nickname") || "";


/* =====================================
   SCREEN
===================================== */

function showHome() {
  homeScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}

function showChat() {
  homeScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}


/* =====================================
   CONNECTION
===================================== */

function updateConnection(online) {
  $("connection-dot").classList.toggle("online", online);

  $("connection-text").textContent =
    online ? "연결됨" : "연결 중...";
}

socket.on("connect", () => {
  updateConnection(true);

  if (pendingJoin && currentChannel) {
    joinServer();
  }
});

socket.on("disconnect", () => {
  joined = false;
  updateConnection(false);
});

socket.on("connect_error", () => {
  updateConnection(false);
});


/* =====================================
   JOIN CHANNEL
===================================== */

function enterChannel(channel, nickname) {
  currentChannel = channel;
  currentNickname = nickname;

  joined = false;
  pendingJoin = true;

  $("room-title").textContent = "#" + channel;
  $("home-error").textContent = "";

  messages.innerHTML = "";

  localStorage.setItem("schooltlk-nickname", nickname);

  showChat();

  updateConnection(false);

  if (!socket.connected) {
    socket.connect();
  } else {
    joinServer();
  }
}


function joinServer() {
  if (!currentChannel || !currentNickname) return;

  socket.emit("join-channel", {
    channel: currentChannel,
    nickname: currentNickname
  }, result => {

    if (!result || !result.ok) {
      pendingJoin = false;
      joined = false;

      alert(result?.error || "채널 입장에 실패했습니다.");

      socket.disconnect();

      currentChannel = "";
      location.hash = "";

      showHome();
      return;
    }

    pendingJoin = false;
    joined = true;

    messages.innerHTML = "";

    (result.messages || []).forEach(addMessage);

    if (!result.messages?.length) {
      showEmptyMessage();
    }

    updateUsers(result.users || []);

    updateConnection(true);

    scrollToBottom();
  });
}


/* =====================================
   USERS
===================================== */

function updateUsers(users) {
  $("user-count").textContent = users.length;

  $("room-count").textContent =
    users.length + "명 접속 중";

  $("user-list").innerHTML = "";

  users.forEach(user => {

    const item = document.createElement("div");

    item.className = "user-item";
    item.textContent = user.nickname;

    $("user-list").appendChild(item);

  });
}


/* =====================================
   EMPTY MESSAGE
===================================== */

function showEmptyMessage() {

  if (messages.children.length === 0) {

    const empty = document.createElement("div");

    empty.className = "empty-message";
    empty.textContent = "대화를 시작해 보세요!";

    messages.appendChild(empty);

  }

}


/* =====================================
   ADD MESSAGE
===================================== */

function addMessage(data) {

  const empty = messages.querySelector(".empty-message");

  if (empty) empty.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message";

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const name = document.createElement("span");
  name.className = "message-name";
  name.textContent = data.nickname;

  const time = document.createElement("span");
  time.className = "message-time";

  time.textContent = new Date(data.time).toLocaleTimeString(
    "ko-KR",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );

  const content = document.createElement("div");

  content.className = "message-content";
  content.textContent = data.message;

  meta.append(name, time);
  wrapper.append(meta, content);

  messages.appendChild(wrapper);

  // 화면에 표시할 메시지는 최대 300개
  while (
    messages.querySelectorAll(".message").length > 300
  ) {
    messages.querySelector(".message").remove();
  }

  scrollToBottom();
}


/* =====================================
   NOTICE
===================================== */

function addNotice(text) {

  const notice = document.createElement("div");

  notice.className = "notice";
  notice.textContent = text;

  messages.appendChild(notice);

  scrollToBottom();
}


/* =====================================
   SCROLL
===================================== */

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}


/* =====================================
   SOCKET EVENTS
===================================== */

socket.on("new-message", data => {

  if (!joined) return;

  addMessage(data);

});


socket.on("user-joined", data => {

  if (!joined) return;

  updateUsers(data.users || []);

  addNotice(data.nickname + "님이 입장했습니다.");

});


socket.on("user-left", data => {

  if (!joined) return;

  updateUsers(data.users || []);

  addNotice(data.nickname + "님이 퇴장했습니다.");

});


/* =====================================
   SEND MESSAGE
===================================== */

$("message-form").addEventListener("submit", event => {

  event.preventDefault();

  const input = $("message-input");

  const message = input.value.trim();

  if (!message) return;

  if (!socket.connected || !joined) {
    alert("서버 연결을 기다려 주세요.");
    return;
  }

  socket.emit("send-message", {
    message
  });

  input.value = "";
  input.focus();

});


/* =====================================
   JOIN FORM
===================================== */

$("join-form").addEventListener("submit", event => {

  event.preventDefault();

  const nickname = $("nickname").value.trim();

  const channel = $("channel").value.trim();

  if (!nickname) {
    $("home-error").textContent = "닉네임을 입력해 주세요.";
    return;
  }

  if (nickname.length > 20) {
    $("home-error").textContent = "닉네임은 20자 이하여야 합니다.";
    return;
  }

  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(channel)) {

    $("home-error").textContent =
      "채널은 영문, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.";

    return;
  }

  if (channel.toLowerCase() !== channel) {
    $("home-error").textContent =
      "채널 이름은 소문자를 사용해 주세요.";
    return;
  }

  location.hash = "/room/" + channel;

  enterChannel(channel, nickname);

});


/* =====================================
   LEAVE CHANNEL
===================================== */

$("leave-button").addEventListener("click", () => {

  pendingJoin = false;
  joined = false;

  socket.emit("leave-channel");

  socket.disconnect();

  currentChannel = "";
  currentNickname = "";

  location.hash = "";

  showHome();

});


/* =====================================
   SHARE
===================================== */

$("share-button").addEventListener("click", async () => {

  const url =
    location.origin +
    location.pathname +
    "#/room/" +
    currentChannel;

  try {

    await navigator.clipboard.writeText(url);

    $("share-button").textContent = "복사 완료!";

  } catch {

    prompt("채널 링크를 복사하세요.", url);

  }

  setTimeout(() => {

    $("share-button").textContent = "링크 공유";

  }, 2000);

});


/* =====================================
   DIRECT CHANNEL ACCESS
===================================== */

function checkHash() {

  const match = location.hash.match(
    /^#\/room\/([a-z0-9_-]{1,40})$/
  );

  if (!match) {

    if (currentChannel) {
      pendingJoin = false;
      joined = false;

      socket.emit("leave-channel");
      socket.disconnect();

      currentChannel = "";
    }

    showHome();

    return;
  }

  const channel = match[1];

  if (
    currentChannel === channel &&
    !chatScreen.classList.contains("hidden")
  ) {
    return;
  }

  $("channel").value = channel;

  const nickname =
    localStorage.getItem("schooltlk-nickname");

  if (nickname) {

    $("nickname").value = nickname;

    enterChannel(channel, nickname);

  } else {

    showHome();

  }

}


window.addEventListener("hashchange", checkHash);

checkHash();
