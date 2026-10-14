const API_CONFIG = {
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  chatApiKey: "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",
  imageApiKey: "YOUR_IMAGE_API_KEY",
  imageEndpoint: "https://openrouter.ai/api/v1/images/generations",
  model: "openai/gpt-4o-mini",
  imageModel: "google/gemini-3.1-flash-lite-image"
};

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const chatWindow = document.querySelector("#chat-window");
const typingIndicator = document.querySelector("#typing-indicator");
const apiStatus = document.querySelector("#api-status");
const particleCanvas = document.querySelector("#particle-canvas");
const historyList = document.querySelector("#history-list");
const historyPanel = document.querySelector("#history-panel");
const activeSession = typeof getCurrentUser === "function" ? getCurrentUser() : null;
const userChatsKey = activeSession && activeSession.email ? `ai-explorer-chats_${activeSession.email}` : "ai-explorer-chats";
let chats = JSON.parse(localStorage.getItem(userChatsKey) || localStorage.getItem("ai-explorer-chats") || "[]");
let currentChatId = null;
let conversation = [];

const particleContext = particleCanvas.getContext("2d");
const cursor = { x: -1000, y: -1000, active: false };
let particles = [];
let animationFrame;

function setupParticles() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  particleCanvas.width = window.innerWidth * pixelRatio;
  particleCanvas.height = window.innerHeight * pixelRatio;
  particleCanvas.style.width = `${window.innerWidth}px`;
  particleCanvas.style.height = `${window.innerHeight}px`;
  particleContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const count = Math.min(180, Math.max(70, Math.floor((window.innerWidth * window.innerHeight) / 8500)));
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    size: Math.random() * 1.8 + .6,
    depth: Math.random() * .8 + .2,
    speedX: (Math.random() - .5) * .25,
    speedY: (Math.random() - .5) * .25,
    alpha: Math.random() * .45 + .15,
    phase: Math.random() * Math.PI * 2
  }));
}

function animateParticles(time = 0) {
  particleContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles.forEach((particle) => {
    particle.x += particle.speedX * particle.depth;
    particle.y += particle.speedY * particle.depth;
    if (particle.x < -10) particle.x = window.innerWidth + 10;
    if (particle.x > window.innerWidth + 10) particle.x = -10;
    if (particle.y < -10) particle.y = window.innerHeight + 10;
    if (particle.y > window.innerHeight + 10) particle.y = -10;
    const distanceX = cursor.x - particle.x;
    const distanceY = cursor.y - particle.y;
    const distance = Math.hypot(distanceX, distanceY);
    if (cursor.active && distance < 170 && distance > 0) {
      const force = (170 - distance) / 170;
      particle.x -= (distanceX / distance) * force * 1.25;
      particle.y -= (distanceY / distance) * force * 1.25;
    }
    const glow = Math.sin(time * .001 + particle.phase) * .14;
    const cursorGlow = cursor.active && distance < 170 ? (170 - distance) / 170 : 0;
    particleContext.beginPath();
    particleContext.arc(particle.x, particle.y, particle.size + cursorGlow * 1.4, 0, Math.PI * 2);
    particleContext.fillStyle = `rgba(98, 200, 255, ${Math.max(.08, particle.alpha + glow + cursorGlow * .45)})`;
    particleContext.fill();
  });
  for (let first = 0; first < particles.length; first += 1) {
    for (let second = first + 1; second < particles.length; second += 1) {
      const firstParticle = particles[first];
      const secondParticle = particles[second];
      const distance = Math.hypot(firstParticle.x - secondParticle.x, firstParticle.y - secondParticle.y);
      if (distance < 112) {
        const opacity = (1 - distance / 112) * .16;
        particleContext.beginPath();
        particleContext.moveTo(firstParticle.x, firstParticle.y);
        particleContext.lineTo(secondParticle.x, secondParticle.y);
        particleContext.strokeStyle = `rgba(98, 200, 255, ${opacity})`;
        particleContext.lineWidth = .6;
        particleContext.stroke();
      }
    }
  }
  if (cursor.active) {
    const halo = particleContext.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, 145);
    halo.addColorStop(0, "rgba(98, 200, 255, .14)");
    halo.addColorStop(1, "rgba(98, 200, 255, 0)");
    particleContext.fillStyle = halo;
    particleContext.fillRect(cursor.x - 145, cursor.y - 145, 290, 290);
  }
  animationFrame = requestAnimationFrame(animateParticles);
}

window.addEventListener("pointermove", (event) => { cursor.x = event.clientX; cursor.y = event.clientY; cursor.active = true; });
window.addEventListener("pointerleave", () => { cursor.active = false; });
window.addEventListener("resize", setupParticles);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAnimationFrame(animationFrame);
  else animationFrame = requestAnimationFrame(animateParticles);
});
setupParticles();
animateParticles();

function createChat() {
  const chat = { id: Date.now().toString(), title: "New conversation", messages: [] };
  chats.unshift(chat);
  currentChatId = chat.id;
  conversation = chat.messages;
  saveChats();
  renderHistory();
  renderConversation();
}

function saveChats() {
  localStorage.setItem(userChatsKey, JSON.stringify(chats));
}

function renderHistory() {
  historyList.innerHTML = chats.map((chat) => `
    <div class="history-item ${chat.id === currentChatId ? "active" : ""}">
      <button type="button" data-chat-id="${chat.id}">${escapeHtml(chat.title)}</button>
      <button class="delete-chat" type="button" data-delete-id="${chat.id}" aria-label="Delete ${escapeHtml(chat.title)}">×</button>
    </div>`).join("");
}

function renderConversation() {
  chatWindow.innerHTML = "";
  if (!conversation.length) {
    addMessage("assistant", "Hi, I’m your AI Explorer! Ask me anything and let’s learn something wonderful together. ✨", true);
    return;
  }
  conversation.forEach((message) => {
    addMessage(message.role, message.content);
    if (message.image) addImage(message.image);
  });
}

function selectChat(id) {
  const chat = chats.find((item) => item.id === id);
  if (!chat) return;
  currentChatId = id;
  conversation = chat.messages;
  renderHistory();
  renderConversation();
  historyPanel.classList.remove("open");
}

function addMessage(role, text, animate = false) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.innerHTML = `<span class="message-label">${role === "user" ? "You" : "AI Explorer"}</span><p></p>`;
  chatWindow.appendChild(message);
  const paragraph = message.querySelector("p");
  if (animate) typeResponse(paragraph, text);
  else renderAssistantContent(paragraph, text);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addImage(url) {
  const image = document.createElement("img");
  image.className = "generated-image";
  image.src = url;
  image.alt = "AI generated image";
  image.addEventListener("error", () => {
    image.replaceWith(Object.assign(document.createElement("p"), {
      className: "image-error",
      textContent: "The image service returned a link that could not be loaded. Please try the image request again."
    }));
  });
  chatWindow.appendChild(image);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function typeResponse(element, text) {
  let position = 0;
  const typeNext = () => {
    element.textContent = text.slice(0, position);
    position += 2;
    chatWindow.scrollTop = chatWindow.scrollHeight;
    if (position <= text.length) window.setTimeout(typeNext, 16);
    else renderAssistantContent(element, text);
  };
  typeNext();
}

function renderAssistantContent(element, text) {
  if (!element.closest(".assistant")) {
    element.textContent = text;
    return;
  }
  const fencePattern = /```([a-zA-Z0-9_-]*)\s*\n?([\s\S]*?)```/g;
  let lastPosition = 0;
  element.innerHTML = "";
  let match;
  while ((match = fencePattern.exec(text))) {
    appendAnswerText(element, text.slice(lastPosition, match.index));
    const language = match[1].toLowerCase();
    const code = match[2].trim();
    if (language === "mermaid") {
      const diagram = document.createElement("div");
      diagram.className = "mermaid";
      diagram.textContent = code;
      element.appendChild(diagram);
    } else {
      const codeBlock = document.createElement("pre");
      codeBlock.className = "code-block";
      const codeElement = document.createElement("code");
      codeElement.dataset.language = language || "code";
      codeElement.textContent = code;
      const copyButton = document.createElement("button");
      copyButton.className = "copy-code-button";
      copyButton.type = "button";
      copyButton.textContent = "Copy";
      copyButton.setAttribute("aria-label", `Copy ${language || "code"} block`);
      codeBlock.appendChild(copyButton);
      codeBlock.appendChild(codeElement);
      element.appendChild(codeBlock);
    }
    lastPosition = fencePattern.lastIndex;
  }
  appendAnswerText(element, text.slice(lastPosition));
  if (window.mermaid) window.mermaid.run({ nodes: element.querySelectorAll(".mermaid") });
}

function appendAnswerText(element, text) {
  if (!text.trim()) return;
  const imagePattern = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastPosition = 0;
  let match;
  while ((match = imagePattern.exec(text))) {
    appendFormattedText(element, text.slice(lastPosition, match.index));
    const image = document.createElement("img");
    image.className = "generated-image";
    image.src = match[2];
    image.alt = match[1] || "AI generated image";
    element.appendChild(image);
    lastPosition = imagePattern.lastIndex;
  }
  appendFormattedText(element, text.slice(lastPosition));
}

function appendFormattedText(element, text) {
  if (!text.trim()) return;
  const paragraph = document.createElement("span");
  paragraph.className = "answer-text";
  paragraph.innerHTML = escapeHtml(text.trim())
    .replace(/^### (.*)$/gm, "<strong class=\"answer-heading\">$1</strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  element.appendChild(paragraph);
}

async function askAssistant(question) {
  if (!question.trim()) return;
  addMessage("user", question);
  conversation.push({ role: "user", content: question });
  const currentChat = chats.find((chat) => chat.id === currentChatId);
  if (currentChat && currentChat.title === "New conversation") currentChat.title = question.trim().slice(0, 35) + (question.trim().length > 35 ? "..." : "");
  saveChats();
  renderHistory();
  input.value = "";
  typingIndicator.hidden = false;
  try {
    const wantsImage = /\b(image|picture|illustration|poster|logo|photo|artwork)\b/i.test(question)
      && /\b(generate|create|make|draw|design|produce|give|show|send)\b/i.test(question);
    const selectedApiKey = wantsImage ? API_CONFIG.imageApiKey : API_CONFIG.chatApiKey;
    const selectedEndpoint = wantsImage ? API_CONFIG.imageEndpoint : API_CONFIG.endpoint;
    if (selectedEndpoint.includes("YOUR_") || selectedApiKey.includes("YOUR_") || (wantsImage && API_CONFIG.imageModel.includes("YOUR_"))) throw new Error("API_NOT_CONFIGURED");
    const selectedModel = wantsImage ? API_CONFIG.imageModel : API_CONFIG.model;
    const requestBody = wantsImage
      ? { model: selectedModel, prompt: question, n: 1, size: "1024x1024" }
      : {
        model: selectedModel,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are AI Explorer, a joyful teaching friend. Explain clearly, patiently, and use a few relevant emojis naturally. Ask one friendly, useful question at the very end of every normal teaching answer so the learner can continue. When the user asks for a flowchart, flow diagram, process, steps, workflow, lifecycle, or sequence, include a valid Mermaid diagram in a fenced block. When the user asks for an image, use the image-generation capability and return a real generated image payload; never invent placeholder URLs, via.placeholder.com links, or Markdown image links. Briefly describe the generated image. Keep answers accurate, encouraging, and easy to understand."
          },
          ...conversation
        ]
      };
    const response = await fetch(selectedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${selectedApiKey}`,
        "HTTP-Referer": window.location.href,
        "X-Title": "AI Explorer"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `OpenRouter request failed (${response.status})`;
      if (/insufficient credits|purchase more/i.test(errorMessage)) throw new Error("INSUFFICIENT_CREDITS");
      if (/user not found|invalid api key|authentication/i.test(errorMessage)) throw new Error("INVALID_API_KEY");
      throw new Error(errorMessage);
    }
    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message || {};
    const imageData = data.data?.[0] || {};
    const answerContent = wantsImage ? (imageData.revised_prompt || "Here is your image! 🎨") : (assistantMessage.content || data.answer || data.response);
    const answer = typeof answerContent === "string" ? answerContent : "Here is your image! 🎨";
    const markdownImage = answer.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1];
    const imageUrl = imageData.url || (imageData.b64_json ? `data:image/png;base64,${imageData.b64_json}` : null) || assistantMessage.images?.[0]?.image_url?.url || assistantMessage.images?.[0]?.url || markdownImage;
    if (wantsImage && !imageUrl) throw new Error("IMAGE_NOT_RETURNED");
    if (!answer) throw new Error("The API returned no answer");
    conversation.push({ role: "assistant", content: answer, ...(imageUrl ? { image: imageUrl } : {}) });
    saveChats();
    addMessage("assistant", answer, true);
    if (imageUrl) addImage(imageUrl);
  } catch (error) {
    const message = error.message === "API_NOT_CONFIGURED"
      ? "Your chatbot is ready. Add your API endpoint, key, and model name at the top of script.js to start chatting."
      : error.message === "IMAGE_NOT_RETURNED"
        ? "I could not create an image with the selected model. Please check that your OpenRouter image model supports image generation, then try again. 🎨"
      : error.message === "INSUFFICIENT_CREDITS"
        ? "Your OpenRouter account has no credits for this request. Add credits at https://openrouter.ai/settings/credits, then try again. 💳"
      : error.message === "INVALID_API_KEY"
        ? "Your OpenRouter key is invalid or belongs to a different account. Create a new key in OpenRouter and add it to chatApiKey in script.js. 🔑"
      : `I could not get an answer from the AI service. ${error.message}`;
    addMessage("assistant", message, true);
  } finally {
    typingIndicator.hidden = true;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

async function copyCode(button) {
  const code = button.parentElement.querySelector("code").textContent;
  try {
    await navigator.clipboard.writeText(code);
  } catch (error) {
    const helper = document.createElement("textarea");
    helper.value = code;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  button.textContent = "Copied!";
  button.classList.add("copied");
  window.setTimeout(() => { button.textContent = "Copy"; button.classList.remove("copied"); }, 1600);
}

form.addEventListener("submit", (event) => { event.preventDefault(); askAssistant(input.value); });
document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => askAssistant(button.dataset.query)));
document.querySelector("#clear-chat").addEventListener("click", () => { conversation = []; const chat = chats.find((item) => item.id === currentChatId); if (chat) { chat.messages = []; chat.title = "New conversation"; } saveChats(); renderHistory(); renderConversation(); });
document.querySelector("#new-chat").addEventListener("click", createChat);
document.querySelector("#toggle-history").addEventListener("click", () => historyPanel.classList.toggle("open"));
chatWindow.addEventListener("click", (event) => { if (event.target.classList.contains("copy-code-button")) copyCode(event.target); });
historyList.addEventListener("click", (event) => { if (event.target.dataset.chatId) selectChat(event.target.dataset.chatId); if (event.target.dataset.deleteId) { chats = chats.filter((chat) => chat.id !== event.target.dataset.deleteId); if (!chats.length) createChat(); else if (currentChatId === event.target.dataset.deleteId) selectChat(chats[0].id); else { saveChats(); renderHistory(); } } });
if (!API_CONFIG.endpoint.includes("YOUR_") && !API_CONFIG.chatApiKey.includes("YOUR_")) apiStatus.innerHTML = '<span class="status-dot"></span> Chat API connected';
if (chats.length) selectChat(chats[0].id); else createChat();

// Display active logged-in user in topbar
if (activeSession) {
  const userNameEl = document.querySelector("#user-name");
  if (userNameEl) userNameEl.textContent = activeSession.name || "Explorer";
}

// Wire up logout button
const logoutBtn = document.querySelector("#logout-button");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    if (typeof logoutUser === "function") {
      logoutUser();
    } else {
      localStorage.removeItem("ai_explorer_session");
      window.location.href = "login.html";
    }
  });
}
