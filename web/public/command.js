
import { cardDetail, crateDetail, esc, gate, model, n, resultView, shell } from "./views.js";
import { clickSound, effect, loadSettings, saveSettings, unlock } from "./audio.js";

const app = document.querySelector("#app");
const modal = document.querySelector("#overlay");
const notice = document.querySelector("#notice");
const base = "/api/galactic";
let hideNotice;
let refreshInFlight;
let openModal;
let modalTrigger;
let confirmReturn;
let revision = 0;
model.settings = loadSettings();
saveSettings(model.settings);

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, { method = "GET", body, key } = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (method === "POST") {
    headers.set("Content-Type", "application/json");
    headers.set("X-CSRF-Token", model.data.csrf);
    if (key) headers.set("Idempotency-Key", key);
  }
  const response = await fetch(base + path, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(16000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new APIError(payload?.error || "Command uplink interrupted. Try again shortly.", response.status);
  return payload;
}

function announce(text, error = false) {
  clearTimeout(hideNotice);
  notice.textContent = text;
  notice.classList.toggle("error", error);
  hideNotice = setTimeout(() => { notice.textContent = ""; }, error ? 10000 : 5200);
}

function friendly(error) {
  return (error instanceof APIError ? error.message : "Command uplink interrupted. Try again shortly.")
    .replace(/<t:(\d+):R>/g, (_, time) => new Date(Number(time) * 1000).toLocaleString());
}

function showGate(message = "", retry = false) {
  revision++;
  model.data = null;
  model.catalog = null;
  model.cards = new Map();
  model.page = "hub";
  model.opponent = null;
  model.rows = null;
  model.guildRows = null;
  model.pending = null;
  if (modal.open) modal.close();
  app.innerHTML = gate(message, retry);
}

function draw({ focus = false } = {}) {
  if (!model.data || !model.catalog) return;
  const active = document.activeElement;
  const cmd = active?.dataset.cmd;
  const val = active?.dataset.value;
  const scroll = app.querySelector(".rail")?.scrollLeft || 0;
  app.innerHTML = shell();
  const rail = app.querySelector(".rail");
  if (rail) {
    rail.scrollLeft = scroll;
    const selected = rail.querySelector("[aria-current]");
    if (selected && rail.scrollWidth > rail.clientWidth) {
      const frame = rail.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      if (item.right > frame.right) rail.scrollLeft += item.right - frame.right + 10;
      if (item.left < frame.left) rail.scrollLeft += item.left - frame.left - 10;
    }
  }
  if (focus) document.querySelector("#main")?.focus({ preventScroll: true });
  else if (cmd && app.contains(document.activeElement) === false && !modal.open) {
    Array.from(app.querySelectorAll("[data-cmd]")).find(button => button.dataset.cmd === cmd && button.dataset.value === val && !button.disabled)?.focus({ preventScroll: true });
  }
  updateClocks();
}

function updateClocks() {
  const now = Date.now() + (model.clockOffset || 0);
  for (const time of document.querySelectorAll("[data-countdown]")) {
    const seconds = Math.ceil((Number(time.dataset.countdown) - now) / 1000);
    const remaining = seconds > 3600 ? Math.ceil(seconds / 3600) + "h" : seconds > 60 ? Math.ceil(seconds / 60) + "m" : seconds + "s";
    time.textContent = seconds > 0 ? "in " + remaining : "now";
  }
}

function dialog(view, key) {
  if (!view) return;
  if (!modal.open) modalTrigger = document.activeElement;
  openModal = key;
  modal.className = view.className || "";
  modal.innerHTML = `<div class="modal-head"><div><span class="eyebrow">Galactic command</span><h2 id="overlay-title">${esc(view.title)}</h2></div>
    <button type="button" class="btn icon-btn" data-cmd="close" aria-label="Close">×</button></div><div class="modal-body">${view.html}</div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("[data-cmd=close]").focus();
  updateClocks();
}

modal.addEventListener("close", () => {
  if (modal.open) return;
  openModal = null;
  if (modalTrigger?.isConnected && !modalTrigger.disabled) modalTrigger.focus();
  else document.querySelector("#main")?.focus({ preventScroll: true });
});
modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });

function confirmDialog(title, text, body, tone = "primary") {
  confirmReturn = openModal;
  dialog({ title, html: `<p>${esc(text)}</p><div class="actions"><button class="btn" data-cmd="close">Cancel</button>
    <button class="btn ${tone}" data-cmd="action" data-value="${esc(JSON.stringify(body))}">Confirm</button></div>` }, "confirm");
}

function storePending(value, id = model.data?.account.id) {
  model.pending = value;
  if (!id) return;
  try {
    if (value) sessionStorage.setItem("gc-pending-" + id, JSON.stringify(value));
    else sessionStorage.removeItem("gc-pending-" + id);
  } catch { /* optional storage */ }
}

async function refresh() {
  if (!refreshInFlight) {
    const stamp = revision;
    const running = api("/state").then(data => {
      if (stamp !== revision) return;
      model.data = data;
      model.clockOffset = data.now - Date.now();
    }).finally(() => { if (refreshInFlight === running) refreshInFlight = null; });
    refreshInFlight = running;
  }
  return refreshInFlight;
}

async function boot() {
  try {
    await refresh();
    if (!model.data) return;
    model.catalog = await api("/catalog");
    model.cards = new Map(model.catalog.cards.map(card => [card.id, card]));
    try { model.pending = JSON.parse(sessionStorage.getItem("gc-pending-" + model.data.account.id)); } catch { model.pending = null; }
    draw();
    if (model.data.profile.faction && model.data.profile.dailyReadyAt <= model.data.now && !model.pending) {
      await sendAction({ action: "enter" });
    }
  } catch (error) {
    const retryLogin = new URLSearchParams(location.search).has("login");
    showGate(error.status === 401 ? (retryLogin ? "Discord sign-in expired or was cancelled. Try again." : "") : friendly(error), error.status !== 401);
  }
}

const labels = {
  faction: "Faction selected. Your starter cards are deployed.", assign: "Assignment updated.",
  upgrade: result => "Card upgraded to level " + result.level + ".",
  train: result => "Ability trained to level " + result.level + ".",
  recycle: result => "Recycled " + result.name + " for " + n(result.scrap) + " Scrap.",
  salvage: result => "Recovered 85 Credits and " + n(result.scrap) + " Scrap.",
  quest: result => "Objective claimed. +" + n(result.rewards.credits) + " Credits and +" + n(result.rewards.xp) + " XP.",
  trade: "Trade offer sent. The recipient can respond in Commanders.",
  tradeAnswer: result => result.declined ? "Trade declined." : "Trade completed.",
  duel: "Challenge sent. The recipient can respond in Commanders.",
  duelAnswer: "Duel declined."
};
const rarityOrder = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythical"];

async function sendAction(body, retry = false) {
  if (model.busy || !model.data || (model.pending && !retry)) return;
  const id = model.data.account.id;
  const priorDialog = openModal === "confirm" ? confirmReturn : openModal;
  const order = retry ? model.pending : { body, key: Date.now() + (model.clockOffset || 0) + "-" + crypto.randomUUID() };
  const previousRefresh = refreshInFlight;
  const opening = ["roll", "crate", "deal"].includes(body.action);
  model.busy = true;
  storePending(order);
  if (modal.open && !opening) modal.close();
  draw();
  if (opening) dialog({ title: "Opening supply channel", html: '<div class="decode" role="status"><img src="/insignia.svg" alt=""><span>Waiting for command acknowledgement…</span></div>' }, "opening");
  else if (body.action !== "enter") announce("Sending command…");

  let result;
  try {
    result = await api("/action", { method: "POST", body: order.body, key: order.key });
  } catch (error) {
    model.busy = false;
    if (openModal === "opening" && modal.open) modal.close();
    if (error.status === 401) return showGate("Sign in again to recover your last command.");
    if ([400, 413].includes(error.status)) storePending(null, id);
    if (error.status === 403) {
      await refresh().catch(() => {});
    }
    draw();
    return announce(friendly(error), true);
  }

  storePending(null, id);
  let refreshError;
  try {
    await previousRefresh?.catch(() => {});
    await refresh();
    if (model.opponent && ["raid", "trade", "tradeAnswer", "assign", "recycle"].includes(body.action)) {
      model.opponent = await api("/opponent/" + model.opponent.id).catch(() => null);
    }
  } catch (error) {
    refreshError = error;
  } finally {
    model.busy = false;
  }
  if (refreshError?.status === 401) return showGate("Sign in again to reload your profile.");
  draw();
  if (!result.ok) {
    if (openModal === "opening" && modal.open) modal.close();
    if (body.action !== "enter") announce(result.error.replace(/<t:(\d+):R>/g, (_, time) => new Date(Number(time) * 1000).toLocaleString()), true);
    return;
  }
  const view = resultView(body, result);
  const highest = (result.found || (result.card && body.action === "enter" ? [result.card] : []))
    .reduce((best, x) => Math.max(best, rarityOrder.indexOf(x.rarity)), -1);
  effect(model.settings, rarityOrder[highest], view?.title !== "Battle lost" && view?.title !== "Squad withdrew");
  if (view) dialog(view, "result");
  else if (priorDialog?.startsWith("owned:") && body.action !== "recycle") {
    const key = priorDialog.slice(6);
    dialog(cardDetail(key, true), priorDialog);
  }
  const label = labels[body.action];
  if (refreshError) announce("Command completed. Reconnect to refresh your profile.", true);
  else announce(view ? view.title : typeof label === "function" ? label(result) : label || "Command completed.");
}

async function go(page) {
  const changed = model.page !== page;
  model.page = page;
  if (modal.open) modal.close();
  draw({ focus: changed });
  if (changed) window.scrollTo(0, 0);
  if (page === "rankings") {
    const metric = model.metric;
    const rows = await api("/leaders?metric=" + encodeURIComponent(metric));
    if (model.metric === metric) model.rows = rows;
    if (model.page === page && model.metric === metric) draw();
  }
  if (page === "guild") {
    model.guildRows = await api("/guilds");
    if (model.page === page) draw();
  }
}

async function lookup(target) {
  model.opponent = await api("/opponent/" + encodeURIComponent(target));
  await go("network");
}

function settings() {
  const s = model.settings;
  dialog({ title: "Settings", html: `<form class="stack" data-form="settings">
    ${[["music", "Ambient music"], ["effects", "Game effects"], ["ui", "Interface sounds"], ["motion", "Motion effects"]].map(([key,label]) =>
      `<label class="check"><input name="${key}" type="checkbox" ${s[key] ? "checked" : ""}> ${label}</label>`).join("")}
    <label>Volume<input type="range" name="volume" min="0" max="100" value="${Number(s.volume)}"></label>
    <button class="btn primary">Save settings</button></form>` }, "settings");
}

const commands = {
  reconnect: boot, nav: go, settings, close: () => modal.close(), action: value => sendAction(JSON.parse(value)),
  confirm: value => { const data = JSON.parse(value); confirmDialog(data.title, data.text, data.body); },
  retry: () => sendAction(model.pending.body, true),
  owned: key => dialog(cardDetail(key, true), "owned:" + key), card: key => dialog(cardDetail(key, false), "card:" + key),
  crate: key => dialog(crateDetail(key), "crate:" + key),
  period: value => { model.period = value; draw(); },
  collectionPage: value => { model.collection.page = Number(value); draw({ focus: true }); },
  opponent: lookup,
  skipReveal: () => {
    modal.classList.add("skip-reveal");
    modal.querySelector("[data-cmd=close]").focus();
    modal.querySelector("[data-cmd=skipReveal]")?.remove();
  },
  sync: async () => {
    if (model.busy) return;
    await refresh();
    draw();
    announce("Profile synced.");
  },
  logout: async () => {
    if (model.busy) return;
    await api("/auth/logout", { method: "POST" });
    showGate();
  }
};

function onError(error) {
  if (error.status === 401) showGate("Your session ended. Sign in again.");
  else announce(friendly(error), true);
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-cmd]");
  if (!button || button.disabled) return;
  const handler = commands[button.dataset.cmd];
  if (!handler) return;
  unlock(model.settings);
  clickSound(model.settings);
  Promise.resolve().then(() => handler(button.dataset.value)).catch(onError);
});

const forms = {
  collection: form => {
    model.collection = { ...Object.fromEntries(form), term: form.get("term").trim(), page: 0 };
    draw({ focus: true });
  },
  assignment: form => sendAction({ action: "assign", uid: form.get("uid"), role: form.get("role") }),
  opponent: form => lookup(form.get("target")),
  duel: form => sendAction({ action: "duel", target: model.opponent.id, ranked: form.has("ranked") }),
  trade: form => {
    const offer = model.data.profile.cards.find(x => x.uid === form.get("offer"));
    const wanted = model.opponent.reserve.find(x => x.uid === form.get("wanted"));
    if (!offer || !wanted) return;
    confirmDialog("Send trade offer", "Offer " + model.cards.get(offer.cardId)?.name + " for " +
      model.cards.get(wanted.cardId)?.name + ".", { action: "trade", target: model.opponent.id, offer: offer.uid, wanted: wanted.uid });
  },
  metric: form => {
    model.metric = form.get("metric");
    model.rows = null;
    return go("rankings");
  },
  guildJoin: form => sendAction({ action: "guildJoin", code: form.get("code") }),
  guildCreate: form => confirmDialog("Found a guild", "Create " + form.get("name").trim() + " for 10,000 Credits.", { action: "guildCreate", name: form.get("name").trim() }),
  guildDonate: form => confirmDialog("Donate to the guild", "Transfer " + n(Number(form.get("credits"))) + " Credits to the treasury.", { action: "guildDonate", credits: Number(form.get("credits")) }),
  guildTransfer: form => confirmDialog("Transfer ownership", "This member will control your guild and its treasury.", { action: "guildTransfer", target: form.get("target") }),
  settings: form => {
    model.settings = { music: form.has("music"), effects: form.has("effects"), ui: form.has("ui"), motion: form.has("motion"), volume: Number(form.get("volume")) };
    saveSettings(model.settings);
    unlock(model.settings);
    modal.close();
    announce("Settings saved.");
  }
};

document.addEventListener("submit", event => {
  const handler = forms[event.target.dataset.form];
  if (!handler) return;
  event.preventDefault();
  unlock(model.settings);
  const form = new FormData(event.target);
  Promise.resolve().then(() => handler(form)).catch(onError);
});
document.addEventListener("error", event => {
  if (event.target.matches?.(".portrait img")) {
    event.target.hidden = true;
    event.target.parentElement.classList.add("image-failed");
  }
}, true);

async function sync() {
  if (!model.data || !model.catalog || model.busy || modal.open || document.hidden ||
      document.activeElement?.matches("input, select, textarea") || document.activeElement?.closest("details[open]")) return;
  try {
    await refresh();
    if (!model.busy && !modal.open && !document.activeElement?.matches("input, select, textarea")) draw();
  } catch (error) {
    if (error.status === 401) onError(error);
  }
}

setInterval(updateClocks, 1000);
setInterval(sync, 40000);
document.addEventListener("visibilitychange", sync);
boot();
