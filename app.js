const STORAGE_KEY = "our-little-kitchen-v1";
const categoryOrder = ["全部", "荤菜", "素菜", "汤类", "主食", "甜品"];
const categoryIcons = { "全部": "♡", "荤菜": "🍖", "素菜": "🥬", "汤类": "🥣", "主食": "🍚", "甜品": "🍮" };
const palettes = ["#f1d9c5", "#dce7d6", "#ead9cc", "#d9e5e6", "#eee2c5", "#e6d8e4"];
const chatEmojis = ["😀", "😄", "😂", "🥰", "😘", "😋", "🤔", "😭", "🥺", "😤", "😴", "🙈", "👍", "👏", "🙏", "❤️", "🎉", "🌹", "🍚", "🍗", "🍲"];

const initialState = {
  dishes: [
    { id: 1, name: "糖醋排骨", category: "荤菜", emoji: "🍖", description: "酸甜开胃，外酥里嫩" },
    { id: 2, name: "番茄炒蛋", category: "素菜", emoji: "🍳", description: "家里永远吃不腻的味道" },
    { id: 3, name: "香煎三文鱼", category: "荤菜", emoji: "🐟", description: "外皮焦香，鱼肉软嫩" },
    { id: 4, name: "蒜蓉西兰花", category: "素菜", emoji: "🥦", description: "清爽脆嫩，蒜香十足" },
    { id: 5, name: "冬瓜丸子汤", category: "汤类", emoji: "🍲", description: "清清爽爽的一碗热汤" },
    { id: 6, name: "咖喱鸡肉饭", category: "主食", emoji: "🍛", description: "浓郁咖喱，拌饭刚刚好" },
    { id: 7, name: "可乐鸡翅", category: "荤菜", emoji: "🍗", description: "甜咸入味，轻松光盘" },
    { id: 8, name: "桂花小圆子", category: "甜品", emoji: "🥣", description: "软糯香甜，饭后来一点" }
  ],
  todayMenu: [1, 2, 3, 4, 5, 6],
  draftMenu: [1, 2, 3, 4, 5, 6],
  selected: [],
  note: "",
  submission: null,
  status: "open",
  statusUpdatedAt: null,
  messages: [],
  chatAvailable: false,
  history: [
    { date: "2026-07-01", dishIds: [7, 4, 5], note: "鸡翅多留两个" },
    { date: "2026-06-29", dishIds: [6, 2], note: "咖喱不要太辣" },
    { date: "2026-06-27", dishIds: [3, 4, 8], note: "" }
  ]
};

let state = loadState();
let dinerCategory = "全部";
let adminCategory = "全部";
let pendingDishImage = "";
let cloudBusy = false;
let cloudInitialized = false;
let cloudPollTimer = null;
let draftDirty = false;
let chatOpen = false;
let chatUnread = false;
let emojiOpen = false;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...initialState, ...saved } : structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    toast("照片存储空间不足，换一张更小的图片试试");
    return false;
  }
}

function formatDate(dateString, withYear = false) {
  const date = dateString ? new Date(dateString) : new Date();
  const options = withYear
    ? { year: "numeric", month: "long", day: "numeric" }
    : { month: "long", day: "numeric", weekday: "short" };
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function getDish(id) { return state.dishes.find(d => String(d.id) === String(id)); }
function resolveDishId(value) {
  return state.dishes.find(d => String(d.id) === String(value))?.id ?? value;
}
function dishColor(id) {
  const text = String(id);
  const hash = [...text].reduce((total, char) => total + char.charCodeAt(0), 0);
  return palettes[hash % palettes.length];
}
function dishVisual(dish) {
  const imageValue = typeof dish.image === "string" ? dish.image.trim() : "";
  const isSupportedImage = /^data:image\/(?:jpeg|png|webp);base64,/i.test(imageValue)
    || /^https:\/\/[^\s"'<>]+$/i.test(imageValue)
    || /^assets\/[^\s"'<>]+$/i.test(imageValue);
  const image = isSupportedImage
    ? `<img src="${escapeHtml(imageValue)}" alt="${escapeHtml(dish.name || "菜品")}照片" loading="lazy">`
    : `<span>${escapeHtml(dish.emoji || "🍽️")}</span>`;
  return image;
}

function renderCategories(containerId, active, clickHandler, dishIds = null) {
  const container = document.getElementById(containerId);
  const source = dishIds ? state.dishes.filter(d => dishIds.includes(d.id)) : state.dishes;
  const available = categoryOrder.filter(c => c === "全部" || source.some(d => d.category === c));
  container.innerHTML = available.map(c => `<button class="${c === active ? "active" : ""}" data-category="${c}"><span aria-hidden="true">${categoryIcons[c] || "·"}</span> ${c}</button>`).join("");
  container.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => clickHandler(btn.dataset.category)));
}

function renderDiner() {
  document.getElementById("today-label").textContent = formatDate();
  const menuDishes = state.todayMenu.map(getDish).filter(Boolean);
  renderCategories("diner-categories", dinerCategory, category => {
    dinerCategory = category;
    renderDiner();
  }, state.todayMenu);

  const visible = menuDishes.filter(d => dinerCategory === "全部" || d.category === dinerCategory);
  const grid = document.getElementById("diner-dish-grid");
  grid.innerHTML = visible.map(d => `
    <article class="dish-card ${state.selected.includes(d.id) ? "selected" : ""}" data-id="${d.id}" tabindex="0" role="checkbox" aria-checked="${state.selected.includes(d.id)}">
      <span class="check">✓</span>
      <div class="dish-image" style="--dish-bg:${dishColor(d.id)}">${dishVisual(d)}</div>
      <div class="dish-info"><span class="dish-tag">${d.category}</span><h3>${escapeHtml(d.name)}</h3><p>${escapeHtml(d.description)}</p></div>
    </article>`).join("");
  grid.querySelectorAll(".dish-card").forEach(card => {
    const toggle = () => toggleDinerDish(resolveDishId(card.dataset.id));
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });

  document.getElementById("menu-empty").classList.toggle("hidden", state.todayMenu.length > 0);
  document.getElementById("diner-categories").classList.toggle("hidden", state.todayMenu.length === 0);
  document.getElementById("dish-count").textContent = `共 ${menuDishes.length} 道 · 可多选`;
  document.getElementById("selected-count").textContent = state.selected.length;
  document.getElementById("submit-choice").disabled = !state.selected.length || state.todayMenu.length === 0;
  document.getElementById("taste-note").value = state.note;
  document.getElementById("note-count").textContent = state.note.length;
  updateProgress();
  renderHistory();
}

function toggleDinerDish(id) {
  state.selected = state.selected.includes(id) ? state.selected.filter(item => item !== id) : [...state.selected, id];
  saveState();
  renderDiner();
}

function renderAdmin() {
  renderCategories("admin-categories", adminCategory, category => {
    adminCategory = category;
    renderAdmin();
  });
  const visible = state.dishes.filter(d => adminCategory === "全部" || d.category === adminCategory);
  document.getElementById("admin-dish-grid").innerHTML = visible.map(d => `
    <div class="admin-dish ${state.draftMenu.includes(d.id) ? "selected" : ""}" data-id="${d.id}">
      <span class="emoji" style="--dish-bg:${dishColor(d.id)}">${dishVisual(d)}</span>
      <div><strong>${escapeHtml(d.name)}</strong><small>${d.category}</small></div><i>✓</i>
    </div>`).join("");
  document.querySelectorAll(".admin-dish").forEach(card => card.addEventListener("click", () => {
    const id = resolveDishId(card.dataset.id);
    state.draftMenu = state.draftMenu.includes(id) ? state.draftMenu.filter(item => item !== id) : [...state.draftMenu, id];
    draftDirty = true;
    saveState();
    renderAdmin();
  }));
  document.getElementById("admin-select-count").textContent = `已选 ${state.draftMenu.length} 道`;
  document.getElementById("publish-menu").disabled = !state.draftMenu.length;
  document.getElementById("library-count").textContent = state.dishes.length;
  document.getElementById("mini-dishes").innerHTML = state.dishes.slice(-4).reverse().map(d => `
    <div class="mini-dish"><span style="--dish-bg:${dishColor(d.id)}">${dishVisual(d)}</span><strong>${escapeHtml(d.name)}</strong><small>${d.category}</small></div>`).join("");
  renderResult();
  renderHistory();
}

function renderManageLibrary() {
  const list = document.getElementById("library-manage-list");
  document.getElementById("manage-dish-count").textContent = state.dishes.length;
  if (!state.dishes.length) {
    list.innerHTML = `
      <div class="manage-empty">
        <span>🍽️</span>
        <strong>菜品库还是空的</strong>
        <p>先添一道家里常吃的菜吧。</p>
      </div>`;
    return;
  }
  list.innerHTML = state.dishes.map(d => `
    <article class="manage-dish-row" data-id="${d.id}">
      <span class="manage-dish-image" style="--dish-bg:${dishColor(d.id)}">${dishVisual(d)}</span>
      <div class="manage-dish-copy">
        <strong>${escapeHtml(d.name)}</strong>
        <span>${d.category} · ${escapeHtml(d.description)}</span>
      </div>
      <div class="manage-dish-actions">
        <button class="edit-dish-btn" type="button" data-edit-id="${d.id}" aria-label="修改这道菜">
          <span aria-hidden="true">✎</span> 修改
        </button>
        <button class="delete-dish-btn" type="button" data-delete-id="${d.id}" aria-label="删除这道菜">
          <span aria-hidden="true">⌫</span> 删除
        </button>
      </div>
    </article>`).join("");
  list.querySelectorAll(".edit-dish-btn").forEach(button => {
    button.addEventListener("click", () => openEditDish(resolveDishId(button.dataset.editId)));
  });
  list.querySelectorAll(".delete-dish-btn").forEach(button => {
    button.addEventListener("click", () => deleteDish(resolveDishId(button.dataset.deleteId)));
  });
}

function prepareDishForm(mode = "create", dish = null) {
  const form = document.getElementById("dish-form");
  form.reset();
  pendingDishImage = dish?.image || "";
  form.dataset.mode = mode;
  form.elements.dishId.value = dish?.id || "";
  form.elements.name.value = dish?.name || "";
  form.elements.category.value = dish?.category || "荤菜";
  form.elements.emoji.value = dish?.emoji || "";
  form.elements.description.value = dish?.description || "";

  const isEditing = mode === "edit";
  document.getElementById("dish-dialog-eyebrow").textContent = isEditing ? "EDIT DISH" : "NEW DISH";
  document.getElementById("dish-dialog-title").textContent = isEditing ? "修改这道菜" : "添一道家常菜";
  document.getElementById("dish-form-submit").textContent = isEditing ? "保存修改" : "保存到菜品库";
  const removeButton = document.getElementById("remove-dish-image");
  removeButton.classList.toggle("hidden", !pendingDishImage);
  if (pendingDishImage) {
    document.getElementById("upload-preview").innerHTML = `<img src="${pendingDishImage}" alt="当前菜品照片">`;
  } else {
    resetUploadPreview();
  }
}

function openEditDish(id) {
  const dish = getDish(id);
  if (!dish) return;
  document.getElementById("library-dialog").close();
  prepareDishForm("edit", dish);
  document.getElementById("dish-dialog").showModal();
}

async function deleteDish(id) {
  const dish = getDish(id);
  if (!dish) return;
  if (!window.confirm(`确定删除“${dish.name}”吗？\n它也会从今日菜单和历史记录中移除。`)) return;

  if (KitchenCloud.ready) {
    try {
      await KitchenCloud.deleteDish(id);
      await reloadCloudState();
      renderManageLibrary();
      toast(`${dish.name} 已从云端菜品库删除`);
    } catch (error) {
      toast(`删除失败：${friendlyCloudError(error)}`);
    }
    return;
  }

  const previousState = structuredClone(state);
  state = KitchenState.removeDishFromState(state, id);

  if (!saveState()) {
    state = previousState;
    return;
  }
  renderAll();
  renderManageLibrary();
  toast(`${dish.name} 已从菜品库删除`);
}

function renderResult() {
  const content = document.getElementById("result-content");
  const status = document.getElementById("result-status");
  const actions = document.getElementById("status-actions");
  if (!state.submission) {
    content.className = "result-empty";
    content.innerHTML = "<span>♡</span><p>发布菜单后，对方选好的菜会出现在这里。</p>";
    status.textContent = "还未提交";
    status.className = "pill neutral";
    actions.classList.add("hidden");
    return;
  }
  const selectedDishes = state.submission.dishIds.map(getDish).filter(Boolean);
  content.className = "result-filled";
  content.innerHTML = `
    <div class="result-meta"><strong>选了 ${selectedDishes.length} 道菜</strong><span>${formatTime(state.submission.time)}</span></div>
    <div class="chosen">${selectedDishes.map(d => `<span>${d.emoji} ${escapeHtml(d.name)}</span>`).join("")}</div>
    <p class="result-note">口味备注：${state.submission.note ? escapeHtml(state.submission.note) : "没有特别备注"}</p>`;
  const labels = { submitted: "新选择", seen: "已看到", preparing: "准备中", done: "已做好" };
  status.textContent = labels[state.status] || "新选择";
  status.className = `pill ${state.status === "done" ? "done" : state.status === "submitted" ? "alert" : "neutral"}`;
  actions.classList.remove("hidden");
  actions.querySelectorAll("button").forEach(btn => btn.classList.toggle("active", btn.dataset.status === state.status));
}

function updateProgress() {
  const order = ["open", "submitted", "preparing", "done"];
  const index = Math.max(0, order.indexOf(state.status === "seen" ? "submitted" : state.status));
  const labels = {
    open: "等你挑喜欢的菜呀", submitted: "我选好啦，等你看到", seen: "已经看到这份小心愿啦",
    preparing: "锅里开始咕嘟咕嘟啦", done: "饭菜做好啦，快来吃吧"
  };
  document.getElementById("diner-status").textContent = labels[state.status] || labels.open;
  document.querySelectorAll(".progress-step").forEach((step, i) => step.classList.toggle("active", i <= index));
  document.querySelector(".progress-track").style.setProperty("--progress", `${index / 3 * 100}%`);
  document.getElementById("status-time").textContent = state.statusUpdatedAt ? formatTime(state.statusUpdatedAt) : "今天";
}

function renderHistory() {
  const historyHtml = state.history.slice(0, 3).map(item => {
    const dishes = item.dishIds.map(getDish).filter(Boolean);
    return `<article class="history-item">
      <p class="date">${formatDate(item.date)}</p>
      <div class="history-emojis">${dishes.slice(0, 4).map(d => d.emoji).join("")}</div>
      <strong>${dishes.map(d => d.name).join("、") || "温暖的一餐"}</strong>
      <p>${item.note ? `“${escapeHtml(item.note)}”` : "一起好好吃饭"}</p>
    </article>`;
  }).join("");
  document.getElementById("diner-history").innerHTML = historyHtml || "<p class='muted'>第一顿饭，会从今天开始记录。</p>";
  document.getElementById("admin-history").innerHTML = state.history.slice(0, 5).map(item => {
    const dishes = item.dishIds.map(getDish).filter(Boolean);
    return `<div class="admin-history-item"><strong>${formatDate(item.date)} · ${dishes.length} 道</strong><p>${dishes.map(d => d.name).join("、")}</p></div>`;
  }).join("") || "<p class='muted'>还没有历史菜单</p>";
}

function renderChat() {
  const toggle = document.getElementById("chat-toggle");
  const panel = document.getElementById("chat-panel");
  const unread = document.getElementById("chat-unread");
  const setup = document.getElementById("chat-setup");
  const input = document.getElementById("chat-input");
  const submit = document.querySelector("#chat-form .chat-send");
  const messages = document.getElementById("chat-messages");
  const emojiPicker = document.getElementById("emoji-picker");
  const emojiToggle = document.getElementById("emoji-toggle");
  const loggedIn = KitchenCloud.ready;
  toggle.classList.toggle("hidden", !loggedIn);
  panel.classList.toggle("hidden", !loggedIn || !chatOpen);
  toggle.setAttribute("aria-expanded", String(loggedIn && chatOpen));
  unread.classList.toggle("hidden", !chatUnread || chatOpen);
  setup.classList.toggle("hidden", state.chatAvailable);
  input.disabled = !state.chatAvailable;
  submit.disabled = !state.chatAvailable;
  emojiToggle.disabled = !state.chatAvailable;
  emojiPicker.classList.toggle("hidden", !chatOpen || !emojiOpen || !state.chatAvailable);
  emojiToggle.setAttribute("aria-expanded", String(chatOpen && emojiOpen && state.chatAvailable));
  emojiPicker.innerHTML = chatEmojis.map(emoji =>
    `<button type="button" data-emoji="${emoji}" aria-label="发送表情 ${emoji}">${emoji}</button>`
  ).join("");

  if (!state.messages.length) {
    messages.innerHTML = `<div class="chat-empty"><span>♡</span><p>${state.chatAvailable ? "说句话吧，今晚吃饭也要有点仪式感。" : "运行聊天升级脚本后，就能在这里实时说话啦。"}</p></div>`;
  } else {
    messages.innerHTML = state.messages.map(message => {
      const mine = String(message.senderId) === String(KitchenCloud.profile?.user_id);
      const recalled = Boolean(message.recalledAt);
      const canRecall = mine && !recalled && Date.now() - new Date(message.time).getTime() <= 2 * 60 * 1000;
      return `<article class="chat-message ${mine ? "mine" : ""}">
        <div class="chat-meta"><strong>${escapeHtml(message.senderName)}</strong><span>${formatTime(message.time)}</span></div>
        ${recalled
          ? `<p class="chat-recalled">${mine ? "你" : escapeHtml(message.senderName)}撤回了一条消息</p>`
          : `<p class="chat-bubble">${escapeHtml(message.body)}</p>`}
        ${canRecall ? `<button class="chat-recall" type="button" data-recall-id="${message.id}">撤回</button>` : ""}
      </article>`;
    }).join("");
  }
  if (chatOpen) {
    chatUnread = false;
    unread.classList.add("hidden");
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  }
}

function setChatOpen(open) {
  chatOpen = open;
  if (!open) emojiOpen = false;
  if (open) chatUnread = false;
  renderChat();
  if (open && state.chatAvailable) document.getElementById("chat-input").focus();
}

async function sendChatMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message || !KitchenCloud.ready || !state.chatAvailable) return;
  const button = form.querySelector(".chat-send");
  button.disabled = true;
  try {
    await KitchenCloud.sendMessage(message);
    input.value = "";
    emojiOpen = false;
    await reloadCloudState();
    renderChat();
  } catch (error) {
    toast(`消息发送失败：${friendlyCloudError(error)}`);
  } finally {
    button.disabled = !state.chatAvailable;
  }
}

function insertChatEmoji(emoji) {
  const input = document.getElementById("chat-input");
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  const cursor = start + emoji.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
}

async function recallChatMessage(id) {
  if (!id || !window.confirm("确定撤回这条消息吗？")) return;
  try {
    await KitchenCloud.recallMessage(id);
    await reloadCloudState();
    toast("这条消息已撤回");
  } catch (error) {
    toast(friendlyCloudError(error));
  }
}

async function publishMenu() {
  if (KitchenCloud.ready) {
    if (cloudBusy) return;
    cloudBusy = true;
    try {
      await KitchenCloud.publishMenu(state.draftMenu);
      draftDirty = false;
      await reloadCloudState();
      toast(`今日菜单已同步，共 ${state.todayMenu.length} 道菜`);
    } catch (error) {
      toast(`发布失败：${friendlyCloudError(error)}`);
    } finally {
      cloudBusy = false;
    }
    return;
  }
  state.todayMenu = [...state.draftMenu];
  state.selected = [];
  state.note = "";
  state.submission = null;
  state.status = "open";
  state.statusUpdatedAt = new Date().toISOString();
  draftDirty = false;
  saveState();
  renderAll();
  toast(`今日菜单发布啦，共 ${state.todayMenu.length} 道菜`);
}

async function submitChoice() {
  if (KitchenCloud.ready) {
    if (cloudBusy) return;
    cloudBusy = true;
    try {
      await KitchenCloud.submitChoice([...state.selected], state.note.trim());
      await reloadCloudState();
      document.querySelector(".notification-dot").classList.remove("hidden");
      toast("选好啦，已经实时送到对方手机 ♡");
      setTimeout(() => document.querySelector("#progress-card").scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    } catch (error) {
      toast(`提交失败：${friendlyCloudError(error)}`);
    } finally {
      cloudBusy = false;
    }
    return;
  }
  const now = new Date().toISOString();
  state.submission = { dishIds: [...state.selected], note: state.note.trim(), time: now };
  state.status = "submitted";
  state.statusUpdatedAt = now;
  const today = new Date().toISOString().slice(0, 10);
  state.history = [{ date: today, dishIds: [...state.selected], note: state.note.trim() }, ...state.history.filter(h => h.date !== today)];
  saveState();
  renderAll();
  document.querySelector(".notification-dot").classList.remove("hidden");
  toast("选好啦，已经把小心愿送过去 ♡");
  setTimeout(() => document.querySelector("#progress-card").scrollIntoView({ behavior: "smooth", block: "center" }), 300);
}

async function setStatus(status) {
  if (KitchenCloud.ready) {
    try {
      await KitchenCloud.setStatus(status);
      await reloadCloudState();
      const cloudText = { seen: "看到这份小心愿啦 ♡", preparing: "厨房开始咕嘟咕嘟啦", done: "饭菜做好啦，快来吃吧" };
      toast(cloudText[status]);
    } catch (error) {
      toast(`状态更新失败：${friendlyCloudError(error)}`);
    }
    return;
  }
  state.status = status;
  state.statusUpdatedAt = new Date().toISOString();
  saveState();
  renderAll();
  const text = { seen: "看到这份小心愿啦 ♡", preparing: "厨房开始咕嘟咕嘟啦", done: "饭菜做好啦，快来吃吧" };
  toast(text[status]);
}

async function addDish(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const editingId = Number(data.get("dishId")) || null;
  const isEditing = form.dataset.mode === "edit" && editingId;
  const dishValues = {
    name: data.get("name").trim(),
    category: data.get("category"),
    emoji: data.get("emoji").trim() || "🍽️",
    description: data.get("description").trim() || "家里的熟悉味道",
    image: pendingDishImage
  };
  if (!dishValues.name) return;

  if (isEditing) {
    if (KitchenCloud.ready) {
      try {
        await KitchenCloud.updateDish(editingId, dishValues);
        form.reset();
        pendingDishImage = "";
        document.getElementById("dish-dialog").close();
        await reloadCloudState();
        renderManageLibrary();
        document.getElementById("library-dialog").showModal();
        toast(`${dishValues.name} 已同步保存`);
      } catch (error) {
        toast(`保存失败：${friendlyCloudError(error)}`);
      }
      return;
    }
    const previousState = structuredClone(state);
    state = KitchenState.updateDishInState(state, editingId, dishValues);
    if (!saveState()) {
      state = previousState;
      return;
    }
    form.reset();
    pendingDishImage = "";
    document.getElementById("dish-dialog").close();
    renderAll();
    renderManageLibrary();
    document.getElementById("library-dialog").showModal();
    toast(`${dishValues.name} 已保存修改`);
    return;
  }

  if (KitchenCloud.ready) {
    try {
      await KitchenCloud.createDish(dishValues);
      form.reset();
      pendingDishImage = "";
      prepareDishForm();
      document.getElementById("dish-dialog").close();
      await reloadCloudState();
      toast(`${dishValues.name} 已加入云端菜品库`);
    } catch (error) {
      toast(`新增失败：${friendlyCloudError(error)}`);
    }
    return;
  }

  const maxId = state.dishes.reduce((max, d) => Math.max(max, Number(d.id) || 0), 0);
  const dish = {
    id: maxId + 1,
    ...dishValues
  };
  state.dishes.push(dish);
  state.draftMenu.push(dish.id);
  if (!saveState()) {
    state.dishes = state.dishes.filter(item => item.id !== dish.id);
    state.draftMenu = state.draftMenu.filter(id => id !== dish.id);
    return;
  }
  form.reset();
  pendingDishImage = "";
  resetUploadPreview();
  document.getElementById("dish-dialog").close();
  renderAll();
  toast(`${dish.name} 已加入菜品库`);
}

function compressImage(file, maxSize = 1000, quality = .82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法识别这张图片"));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function resetUploadPreview() {
  document.getElementById("upload-preview").innerHTML = "<b>＋</b><small>点击上传家里的菜品照片</small>";
}

async function handleDishImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    event.target.value = "";
    toast("图片太大啦，请选择 12MB 以内的照片");
    return;
  }
  const preview = document.getElementById("upload-preview");
  preview.innerHTML = "<small>正在把照片装进菜谱…</small>";
  try {
    pendingDishImage = await compressImage(file);
    preview.innerHTML = `<img src="${pendingDishImage}" alt="菜品照片预览">`;
    document.getElementById("remove-dish-image").classList.remove("hidden");
  } catch (error) {
    pendingDishImage = "";
    resetUploadPreview();
    toast(error.message);
  }
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

let toastTimer;
function toast(message) {
  const el = document.getElementById("toast");
  el.querySelector("p").textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function switchView(view) {
  document.querySelectorAll(".switch-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  document.querySelectorAll(".app-view").forEach(section => section.classList.toggle("active", section.id === `${view}-view`));
  if (view === "admin") document.querySelector(".notification-dot").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function friendlyCloudError(error) {
  const message = error?.message || String(error || "未知错误");
  if (message.includes("Failed to fetch")) return "无法连接 Supabase，请检查网络";
  if (message.includes("row-level security")) return "当前账号没有这个操作权限，请检查 profiles 身份和 RLS";
  if (message.includes("relation") && message.includes("does not exist")) return "云端数据表尚未创建，请先运行 schema.sql";
  return message;
}

async function reloadCloudState(fromRealtime = false) {
  if (!KitchenCloud.ready) return;
  const previousSubmissionTime = state.submission?.time || null;
  const previousLastMessageId = state.messages?.[state.messages.length - 1]?.id || null;
  const previousSelected = [...state.selected];
  const previousNote = state.note;
  const previousDraftMenu = [...state.draftMenu];
  try {
    const remoteState = await KitchenCloud.fetchState();
    state = {
      ...state,
      ...remoteState,
      draftMenu: draftDirty
        ? previousDraftMenu.filter(id => remoteState.dishes.some(dish => String(dish.id) === String(id)))
        : remoteState.draftMenu,
      selected: previousSelected.filter(id => remoteState.todayMenu.some(menuId => String(menuId) === String(id))),
      note: previousNote
    };
    const latestMessage = state.messages?.[state.messages.length - 1] || null;
    const receivedMessage = Boolean(
      fromRealtime &&
      latestMessage &&
      latestMessage.id !== previousLastMessageId &&
      String(latestMessage.senderId) !== String(KitchenCloud.profile?.user_id)
    );
    if (receivedMessage && !chatOpen) chatUnread = true;
    renderAll();
    if (receivedMessage) toast(`${latestMessage.senderName} 发来一条厨房悄悄话`);
    if (
      fromRealtime &&
      KitchenCloud.profile?.role === "cook" &&
      state.submission?.time &&
      state.submission.time !== previousSubmissionTime
    ) {
      document.querySelector(".notification-dot").classList.remove("hidden");
      toast("收到一份新的点餐小心愿 ♡");
    }
  } catch (error) {
    document.getElementById("cloud-status").textContent = "同步失败";
    document.getElementById("cloud-status").className = "cloud-status error";
    toast(`同步失败：${friendlyCloudError(error)}`);
  }
}

function startCloudPolling() {
  clearInterval(cloudPollTimer);
  cloudPollTimer = setInterval(() => {
    if (!cloudBusy && document.visibilityState === "visible") reloadCloudState(true);
  }, 6000);
}

function stopCloudPolling() {
  clearInterval(cloudPollTimer);
  cloudPollTimer = null;
}

function applyCloudProfile(profile) {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("logout-btn").classList.remove("hidden");
  document.querySelector(".view-switch").classList.add("hidden");
  const status = document.getElementById("cloud-status");
  status.textContent = `${profile.nickname || (profile.role === "cook" ? "做饭人" : "点餐人")} · 已同步`;
  status.className = "cloud-status online";
  switchView(profile.role === "cook" ? "admin" : "diner");
  document.getElementById("chat-toggle").classList.remove("hidden");
  startCloudPolling();
}

function showLogin(message = "") {
  document.getElementById("auth-screen").classList.remove("hidden");
  const error = document.getElementById("auth-error");
  error.textContent = message;
  error.classList.toggle("hidden", !message);
}

async function initializeCloud() {
  const status = document.getElementById("cloud-status");
  status.textContent = "正在连接云端…";
  try {
    const result = await KitchenCloud.initialize(() => reloadCloudState(true));
    cloudInitialized = result.available;
    if (!result.available) {
      status.textContent = "云端未连接";
      status.className = "cloud-status error";
      toast(result.reason || "云端连接组件未加载");
      return;
    }
    if (!result.authenticated) {
      status.textContent = "等待登录";
      showLogin();
      return;
    }
    applyCloudProfile(result.profile);
    await reloadCloudState();
  } catch (error) {
    status.textContent = "连接失败";
    status.className = "cloud-status error";
    showLogin(friendlyCloudError(error));
  }
}

function renderAll() {
  renderDiner();
  renderAdmin();
  renderChat();
}

document.querySelectorAll(".switch-btn").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
document.getElementById("taste-note").addEventListener("input", event => {
  state.note = event.target.value;
  document.getElementById("note-count").textContent = state.note.length;
  saveState();
});
document.querySelectorAll(".quick-notes button").forEach(btn => btn.addEventListener("click", () => {
  const text = btn.textContent;
  state.note = state.note.includes(text) ? state.note : [state.note.trim(), text].filter(Boolean).join("，");
  saveState();
  renderDiner();
}));
document.getElementById("submit-choice").addEventListener("click", submitChoice);
document.getElementById("publish-menu").addEventListener("click", publishMenu);
document.querySelectorAll("#status-actions button").forEach(btn => btn.addEventListener("click", () => setStatus(btn.dataset.status)));
document.getElementById("open-add-dish").addEventListener("click", () => {
  prepareDishForm();
  document.getElementById("dish-dialog").showModal();
});
document.getElementById("manage-library").addEventListener("click", () => {
  renderManageLibrary();
  document.getElementById("library-dialog").showModal();
});
document.getElementById("dish-dialog-close").addEventListener("click", () => {
  document.getElementById("dish-dialog").close();
  prepareDishForm();
});
document.getElementById("library-dialog-close").addEventListener("click", () => document.getElementById("library-dialog").close());
document.getElementById("library-add-another").addEventListener("click", () => {
  document.getElementById("library-dialog").close();
  prepareDishForm();
  document.getElementById("dish-dialog").showModal();
});
document.getElementById("dish-form").addEventListener("submit", addDish);
document.getElementById("dish-image-input").addEventListener("change", handleDishImage);
document.getElementById("remove-dish-image").addEventListener("click", () => {
  pendingDishImage = "";
  document.getElementById("dish-image-input").value = "";
  document.getElementById("remove-dish-image").classList.add("hidden");
  resetUploadPreview();
  toast("当前照片已移除，保存后会显示表情");
});
document.getElementById("copy-link").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href.split("#")[0]); toast("点餐链接已复制"); }
  catch { toast("当前链接就是点餐链接，可以从地址栏复制"); }
});
document.getElementById("show-all-history").addEventListener("click", () => toast(`一共记下了 ${state.history.length} 顿饭`));
document.querySelector(".notification-btn").addEventListener("click", () => {
  switchView("admin");
  document.getElementById("latest-result").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!cloudInitialized || cloudBusy) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = document.getElementById("login-btn");
  const error = document.getElementById("auth-error");
  error.classList.add("hidden");
  button.disabled = true;
  button.textContent = "正在回家…";
  cloudBusy = true;
  try {
    const profile = await KitchenCloud.login(
      data.get("email").trim(),
      data.get("password"),
      () => reloadCloudState(true)
    );
    form.reset();
    applyCloudProfile(profile);
    await reloadCloudState();
  } catch (loginError) {
    error.textContent = friendlyCloudError(loginError);
    error.classList.remove("hidden");
  } finally {
    cloudBusy = false;
    button.disabled = false;
    button.textContent = "进入小厨房";
  }
});
document.getElementById("logout-btn").addEventListener("click", async () => {
  stopCloudPolling();
  setChatOpen(false);
  await KitchenCloud.logout();
  document.getElementById("chat-toggle").classList.add("hidden");
  document.getElementById("logout-btn").classList.add("hidden");
  document.getElementById("cloud-status").textContent = "等待登录";
  showLogin();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && KitchenCloud.ready && !cloudBusy) {
    reloadCloudState(true);
  }
});
window.addEventListener("focus", () => {
  if (KitchenCloud.ready && !cloudBusy) reloadCloudState(true);
});
document.getElementById("chat-toggle").addEventListener("click", () => setChatOpen(!chatOpen));
document.getElementById("chat-close").addEventListener("click", () => setChatOpen(false));
document.getElementById("chat-form").addEventListener("submit", sendChatMessage);
document.getElementById("emoji-toggle").addEventListener("click", () => {
  emojiOpen = !emojiOpen;
  renderChat();
});
document.getElementById("emoji-picker").addEventListener("click", event => {
  const button = event.target.closest("[data-emoji]");
  if (!button) return;
  insertChatEmoji(button.dataset.emoji);
});
document.getElementById("chat-messages").addEventListener("click", event => {
  const button = event.target.closest("[data-recall-id]");
  if (button) recallChatMessage(button.dataset.recallId);
});

renderAll();
initializeCloud();
