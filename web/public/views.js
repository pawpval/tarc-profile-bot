
export const model = {
  data: null, catalog: null, cards: new Map(), page: "hub",
  collection: { term: "", rarity: "", faction: "", role: "", minLevel: "", scope: "owned", order: "newest", page: 0 },
  period: "daily", metric: "weekScore", rows: null, guildRows: null, opponent: null,
  busy: false, pending: null, settings: {}
};
export const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const fmt = new Intl.NumberFormat("en-GB");
export const n = value => fmt.format(value ?? 0);
const g = () => model.data;
const p = () => g().profile;
const meta = () => model.catalog;
const faction = id => meta().factions[id]?.name ?? "Unaffiliated";
const now = () => Date.now() + (model.clockOffset || 0);
const color = rarity => "#" + (meta().rarities[rarity]?.color ?? 0x92969c).toString(16).padStart(6, "0");
const ready = at => !at || at <= now();
const costs = (credits, scrap) => n(credits) + " Credits" + (scrap ? " · " + n(scrap) + " Scrap" : "");
const cta = (label, cmd, value = "", tone = "", disabled = false) =>
  `<button type="button" class="btn ${tone}" data-cmd="${cmd}" data-value="${esc(value)}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`;
export const move = (label, action, fields = {}, tone = "", disabled = false) =>
  cta(label, "action", JSON.stringify({ action, ...fields }), tone, disabled || model.busy || !!model.pending);
const confirm = (label, title, text, action, fields = {}, disabled = false) =>
  cta(label, "confirm", JSON.stringify({ title, text, body: { action, ...fields } }), "", disabled || model.busy || !!model.pending);
const nav = (label, page, tone) => cta(label, "nav", page, tone);
const linkLabel = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
const countdown = at => `<time data-countdown="${at}" datetime="${new Date(at).toISOString()}"></time>`;
const info = (label, value) => `<div class="readout"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
const empty = text => `<p class="empty">${esc(text)}</p>`;
const section = (tag, title, desc = "") => `<header class="section-head"><span class="eyebrow">${esc(tag)}</span><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}</header>`;
const pane = (title, content) => `<section class="pane"><h2>${esc(title)}</h2>${content}</section>`;
const names = [["hub", "Command", "⌂"], ["collection", "Collection", "▧"], ["squad", "Squad", "◇"],
  ["operations", "Operations", "⌖"], ["shop", "Supply", "⬡"], ["network", "Commanders", "◎"],
  ["rankings", "Rankings", "▥"], ["guild", "Guild", "⬢"], ["profile", "Profile", "◈"]];
const purposes = { combat: "Fighting squad", production: "Income workers", reserve: "Storage" };
const role = owned => p().combat.includes(owned.uid) ? "combat" : p().production.includes(owned.uid) ? "production" : "reserve";
const cardName = key => model.cards.get(key)?.name || "Card unavailable";
const shownName = key => esc(cardName(key));

export function cardTile(card, owned, isButton = true) {
  const img = card.image ? `<img loading="lazy" decoding="async" src="${esc(card.image)}" alt="">` : "";
  const attrs = isButton ? ` type="button" data-cmd="${owned ? "owned" : "card"}" data-value="${esc(owned?.uid || card.id)}"` : "";
  const tag = isButton ? "button" : "article";
  return `<${tag}${attrs} class="unit" style="--rarity:${color(card.rarity)}">
    <div class="portrait${img ? "" : " image-failed"}"><span class="unavailable">Portrait unavailable</span>${img}<span class="rarity">${esc(card.rarity)}</span></div>
    <div class="unit-body"><strong>${esc(card.name)}</strong><span>${esc(card.role)} · ${owned ? "Lv " + owned.level : esc(meta().factions[card.faction]?.short)}</span>
    ${owned ? `<span class="assignment-label">${esc(purposes[role(owned)])}</span>` : ""}
    <span class="unit-stats"><span>ATK ${n(Math.round(owned?.stats?.attack ?? card.attack ?? 0))}</span><span>DEF ${n(Math.round(owned?.stats?.defense ?? card.defense ?? 0))}</span></span></div></${tag}>`;
}

const cardPlaceholder = owned => ({ id: owned.cardId, name: "Archived card", rarity: "Common", role: "Legacy", faction: p().faction });
const byUid = uid => p().cards.find(x => x.uid === uid);
const tileFor = uid => {
  const owned = byUid(uid);
  return owned ? cardTile(model.cards.get(owned.cardId) || cardPlaceholder(owned), owned) : "";
};

export function gate(message = "", retry = false) {
  return `<main id="main" class="access" tabindex="-1">
    <header class="access-bar"><span class="brand"><img src="/insignia.svg" alt="">TARC <small>NETWORK</small></span><span class="eyebrow">Command terminal</span></header>
    <section class="entry"><span class="eyebrow signal">SECURE CHANNEL · V2</span>
      <h1>Galactic<br><em>Command</em></h1><p>Recruit cards, deploy your squad and compete for weekly command.</p>
      ${retry ? cta("Reconnect", "reconnect", "", "primary") : '<a class="btn primary" href="/api/galactic/auth/login">Sign in with Discord <span aria-hidden="true">↗</span></a>'}
      ${message ? `<p class="status-error" role="alert">${esc(message)}</p>` : '<p class="quiet">Your Discord collection and progress carry over.</p>'}
    </section>
    <footer class="access-foot"><span>GALACTIC COMMAND</span><span>TARC COMMUNITY</span></footer>
  </main>`;
}

function welcome() {
  const copy = { republic: "Clone legions, Jedi and Republic specialists.", cis: "Droid armies and Separatist commanders.", independent: "Mandalorians, bounty hunters and outlaws." };
  return `<section class="allegiance">${section("First deployment", "Choose your faction", "Start with five cards. Your faction shapes regular rolls, and supply crates can add cards from across the galaxy.")}
    <div class="grid three">${Object.entries(meta().factions).map(([key, f]) =>
      `<article class="pane faction-option ${key}"><img src="/insignia.svg" alt=""><h2>${esc(f.name)}</h2><p>${esc(copy[key])}</p>
      ${confirm("Enlist", f.name, "This sets your faction and grants your five starter cards.", "faction", { faction: key })}</article>`).join("")}</div></section>`;
}

export function shell() {
  const state = g(), player = p(), unread = [...state.trades, ...state.duels].filter(x => x.incoming).length;
  const content = player.faction ? (screens[model.page] || hub)() : welcome();
  return `<div class="console ${esc(player.faction || "republic")}">
    <header class="mast"><button type="button" class="brand" data-cmd="nav" data-value="hub"><img src="/insignia.svg" alt=""><span>GALACTIC <small>COMMAND</small></span></button>
      <div class="balances">${info("Credits", n(player.credits))}${info("Scrap", n(player.scrap))}${info("Level", player.level)}</div>
      <div class="utilities">${cta("Sync", "sync")}${cta("Settings", "settings")}${cta("Log out", "logout")}</div>
    </header>
    ${player.faction ? `<nav class="rail" aria-label="Command navigation">${names.map(([page,label,icon]) => `<button type="button" data-cmd="nav" data-value="${page}" ${model.page === page ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}${page === "network" && unread ? `<b aria-label="${unread} incoming">${unread}</b>` : ""}</button>`).join("")}<div class="rail-foot"><i></i> DISCORD LINKED</div></nav>` : ""}
    <main id="main" tabindex="-1">
      ${model.pending ? `<aside class="retry"><span>Command acknowledgement pending. Retry to recover its result.</span>${cta("Retry command", "retry", "", "primary", model.busy)}</aside>` : ""}
      ${content}
    </main>
  </div>`;
}

function hub() {
  const player = p(), state = g(), distinct = new Set(player.cards.map(x => x.cardId)).size;
  const next = player.missions.find(m => ready(m.readyAt));
  const lead = player.combat.slice(0, 3).map(tileFor).join("");
  return `<section class="hero"><div class="hero-content"><span class="eyebrow signal">${esc(faction(player.faction))} · HEADQUARTERS</span>
    <h1>Command<br><em>Deck</em></h1><p>Welcome, ${esc(state.account.name)}. Your squad is standing by.</p>
    <div class="actions">${move("Roll card · " + n(meta().rollPrice) + " Credits", "roll", {}, "primary", player.credits < meta().rollPrice)}${nav("Open collection", "collection")}</div>
    ${player.credits < meta().rollPrice ? '<p class="quiet">Run an operation to earn more Credits.</p>' : ""}
    </div><div class="coordinates" aria-hidden="true">SECTOR 07 <span>●</span><br>TACTICAL UPLINK</div></section>
    <div class="ticker">${info("Rank", player.rank)}${info("Weekly CP", n(player.weekScore))}${info("Worker income", n(player.income) + " / hr")}${info("Catalogue", distinct + " / " + meta().cards.length)}</div>
    <div class="grid hub-grid">
      ${pane("Fighting squad", `<div class="mini-units">${lead || empty("Assign a fighter from your collection.")}</div><div class="pane-foot"><span>${player.combat.length} / 5 deployed</span>${nav("Manage squad", "squad")}</div>`)}
      ${pane("Operations briefing", `<p class="eyebrow">${state.doubleXp ? "DOUBLE XP ACTIVE" : "MISSION CONTROL"}</p><h3>${esc(next?.name || "Squad on standby")}</h3>
        <p>${next ? "Deploy to earn Credits, Scrap and experience." : "Check Operations for upcoming deployments."}</p>
        <div class="pane-foot">${nav("View operations", "operations", "primary")}</div>
        ${state.drop ? `<p class="bulletin"><strong>Community drop</strong><br>${shownName(state.drop.cardId)} · ${state.drop.remaining} left<br>Claim in the Discord drops channel.</p>` : ""}
      `)}
    </div>`;
}

function collection() {
  const f = model.collection, owned = p().cards;
  const rows = (f.scope === "catalogue" ? meta().cards.map(card => ({ card })) :
    owned.map(o => ({ owned: o, card: model.cards.get(o.cardId) || cardPlaceholder(o) })))
    .filter(({ card, owned }) => (!f.rarity || card.rarity === f.rarity) &&
      (!f.faction || card.faction === f.faction) && (!f.role || card.role === f.role) &&
      (!owned || !f.minLevel || owned.level >= Number(f.minLevel)) &&
      card.name.toLowerCase().includes(f.term.toLowerCase()));
  if (f.order === "name") rows.sort((a, b) => a.card.name.localeCompare(b.card.name));
  if (f.order === "level") rows.sort((a, b) => (b.owned?.level || 1) - (a.owned?.level || 1));
  if (f.order === "attack") rows.sort((a, b) => (b.owned?.stats?.attack ?? b.card.attack ?? 0) - (a.owned?.stats?.attack ?? a.card.attack ?? 0));
  const max = Math.max(0, Math.ceil(rows.length / 18) - 1);
  f.page = Math.min(f.page, max);
  return `${section("Personnel archive", "Collection", "Inspect a card to upgrade it or change its assignment.")}
    <form data-form="collection" class="filters"><label>Search cards<input type="search" name="term" maxlength="60" value="${esc(f.term)}" placeholder="Name or unit"></label>
      <label>Rarity<select name="rarity">${linkLabel("", "All rarities", f.rarity)}${Object.keys(meta().rarities).map(r => linkLabel(r, r, f.rarity)).join("")}</select></label>
      <label>Show<select name="scope">${linkLabel("owned", "My cards", f.scope)}${linkLabel("catalogue", "Full catalogue", f.scope)}</select></label>
      <button class="btn">Apply filters</button>
      <details class="advanced" ${f.faction || f.role || f.minLevel || f.order !== "newest" ? "open" : ""}><summary>More filters and sorting</summary>
        <div class="filters"><label>Faction<select name="faction">${linkLabel("", "All factions", f.faction)}
          ${Object.entries(meta().factions).map(([key, value]) => linkLabel(key, value.short, f.faction)).join("")}</select></label>
        <label>Role<select name="role">${linkLabel("", "All roles", f.role)}
          ${[...new Set(meta().cards.map(c => c.role))].sort().map(key => linkLabel(key, key, f.role)).join("")}</select></label>
        <label>Minimum owned level<input type="number" name="minLevel" min="1" max="20" value="${esc(f.minLevel)}" placeholder="Any"></label>
        <label>Sort by<select name="order">${Object.entries({ newest: "Acquisition order", name: "Name", level: "Highest level", attack: "Highest attack" })
          .map(([key, value]) => linkLabel(key, value, f.order)).join("")}</select></label></div>
      </details></form>
    <div class="card-grid">${rows.slice(f.page * 18, (f.page + 1) * 18).map(({ card, owned: o }) => cardTile(card, o)).join("")}</div>
    ${rows.length ? `<div class="pager">${cta("Previous", "collectionPage", f.page - 1, "", !f.page)}<span>Page ${f.page + 1} of ${max + 1} · ${n(rows.length)} cards</span>${cta("Next", "collectionPage", f.page + 1, "", f.page === max)}</div>` : empty("No cards match these filters.")}`;
}

function squad() {
  const player = p();
  return `${section("Deployment roster", "Your squad", "Fighters handle missions and battles. Workers earn Credits automatically.")}
    <div class="ticker">${info("Attack", player.stats.attack)}${info("Defence", player.stats.defense)}${info("Squad HP", player.stats.hp)}${info("Worker income", n(player.income) + " / hr")}</div>
    ${["combat", "production"].map(key => pane(purposes[key], `<div class="slot-grid">${player[key].map(tileFor).join("")}
      ${Array.from({ length: Math.max(0, 5 - player[key].length) }, () => '<div class="slot">Open slot</div>').join("")}</div>`)).join("")}
    <p>${nav("Assign from collection", "collection", "primary")}</p>`;
}

export function cardDetail(key, ownedMode) {
  const owned = ownedMode ? byUid(key) : null;
  const card = owned ? model.cards.get(owned.cardId) || cardPlaceholder(owned) : model.cards.get(key);
  if (!card) return null;
  const costsView = owned?.costs;
  const assigned = owned ? role(owned) : "";
  const count = owned ? p().cards.filter(x => x.cardId === card.id).length : 0;
  const duplicate = owned && p().cards.some(x => x.cardId === card.id && x.uid !== owned.uid && role(x) === "reserve");
  return { title: card.name, html: `<div class="detail"><div>${cardTile(card, owned, false)}</div><div>
    <p class="eyebrow">${esc(faction(card.faction))}</p><p>${esc(meta().abilities[card.ability] || "No ability data available.")}</p>
    ${owned ? `<p>Ability Lv ${owned.abilityLevel} · ${n(count)} in collection<br>${esc(purposes[assigned])}
      ${owned.stats ? `<br>${n(Math.round(owned.stats.hp))} HP before squad bonuses` : ""}</p>` : ""}
    ${owned && costsView ? `<form data-form="assignment" class="filters compact"><input type="hidden" name="uid" value="${esc(owned.uid)}"><label>Assignment<select name="role">
        ${Object.entries(purposes).map(([id, title]) => linkLabel(id, title, assigned)).join("")}</select></label><button class="btn" ${model.pending || model.busy ? "disabled" : ""}>Assign</button></form>
      <div class="stack">
        ${confirm(owned.level >= 20 ? "Level maxed" : "Upgrade · " + costs(costsView.upgrade.credits, costsView.upgrade.scrap),
          "Upgrade " + card.name, "Spend " + costs(costsView.upgrade.credits, costsView.upgrade.scrap) + " to reach level " + (owned.level + 1) + ".",
          "upgrade", { uid: key, fuse: false, level: owned.level }, owned.level >= 20)}
        ${confirm(owned.abilityLevel >= 5 ? "Ability maxed" : "Train · " + costs(costsView.train.credits, costsView.train.scrap),
          "Train ability", "Spend " + costs(costsView.train.credits, costsView.train.scrap) + " to train this ability.",
          "train", { uid: key, level: owned.abilityLevel }, owned.abilityLevel >= 5)}
        ${duplicate ? confirm("Fuse duplicate", "Fuse duplicate", "Consume a stored copy to gain up to two levels.", "upgrade", { uid: key, fuse: true, level: owned.level }, owned.level >= 20) : ""}
        ${assigned === "reserve" ? confirm("Recycle", "Recycle " + card.name, "This removes the card and grants " + costsView.recycle + " Scrap.", "recycle", { uid: key }) : ""}
      </div>` : ""}
    </div></div>` };
}

function operations() {
  const player = p(), state = g(), event = state.event;
  const activeQuests = player.quests[model.period];
  return `${section("Field command", "Operations", "Deploy your fighting squad and complete rotating objectives.")}
    <section class="pane event"><div><span class="eyebrow">${event.active ? "LIVE EVENT" : "EVENT STANDBY"}${state.doubleXp ? " · DOUBLE XP" : ""}</span><h2>${esc(event.active ? event.name : "Rotating operations")}</h2>
    <p>${event.active ? "Mission rewards boosted while this event runs." : "Next event " + countdown((event.id + 1) * 4 * 3600000) + "."}</p></div>
    ${event.active ? (ready(player.eventReadyAt) ? move("Deploy to event", "event", {}, "primary") : countdown(player.eventReadyAt)) : ""}</section>
    <div class="grid three">${player.missions.map(m => `<article class="pane mission"><span class="eyebrow">${m.id === "contract" ? "Daily contract" : "Field mission"}</span>
      <h2>${esc(m.name)}</h2><p>${n(m.credits[0])}–${n(m.credits[1])} Credits · ${n(m.xp)} XP</p><p class="quiet">Base success rewards · Difficulty ${n(m.difficulty)}</p>
      ${ready(m.readyAt) ? move("Deploy squad", "mission", { mission: m.id }, "", !player.combat.length) : countdown(m.readyAt)}</article>`).join("")}</div>
    <section class="pane salvage"><div><h2>Salvage run</h2><p>Recover Scrap and Credits.</p></div>${ready(player.salvageReadyAt) ? move("Send recovery team", "salvage") : countdown(player.salvageReadyAt)}</section>
    ${pane("Objectives", `<div class="tabs">${["daily", "weekly", "monthly"].map(x => cta(x, "period", x, model.period === x ? "selected" : "")).join("")}</div>
      <div class="grid three">${activeQuests.map(q => `<article class="objective"><h3>${esc(q.label)}</h3>
        <progress max="${q.target}" value="${Math.min(q.progress, q.target)}" aria-label="${esc(q.label)} progress"></progress>
        <p>${n(q.progress)} / ${n(q.target)} · ${n(q.credits)} Credits</p>
        ${q.claimed ? '<span class="tag">Claimed</span>' : move("Claim reward", "quest", { period: model.period, quest: q.id }, "", q.progress < q.target)}</article>`).join("")}</div>`)}`;
}

function shop() {
  const state = g();
  const crateTile = (key, crate, discount = false) => `<article class="pane crate"><div class="crate-art" aria-hidden="true">⬡</div><span class="eyebrow">${discount ? "Daily offer" : crate.pool ? esc(faction(crate.pool)) : "Mixed factions"}</span>
    <h2>${esc(crate.name)}</h2><p>${crate.count} cards · ${n(crate.price)} Credits</p>
    ${discount && p().dealBought ? '<span class="tag">Purchased</span>' : cta("Review crate", "crate", discount ? "deal" : key)}</article>`;
  return `${section("Quartermaster", "Supply", "Preview each crate's drop odds and price before buying.")}
    <div class="grid three">${crateTile(state.deal.id, { ...state.deal.crate, price: state.deal.price }, true)}
    ${Object.entries(meta().crates).map(([key, crate]) => crateTile(key, crate)).join("")}</div>`;
}

export function crateDetail(key) {
  const offer = g().deal;
  const daily = key === "deal";
  const crate = daily ? offer.crate : meta().crates[key];
  if (!crate) return null;
  const price = daily ? offer.price : crate.price;
  const odds = p().odds[daily ? offer.id : key];
  const percent = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 2 });
  return { title: crate.name, html: `<p>${crate.count} cards · ${crate.pool ? esc(faction(crate.pool)) : "Mixed factions"}</p>
    <h3>Drop odds per card</h3><dl class="odds">${Object.entries(odds).map(([r, chance]) => `<div><dt style="--rarity:${color(r)}">${esc(r)}</dt><dd>${percent.format(chance)}</dd></div>`).join("")}</dl>
    ${move("Open crate · " + costs(price), daily ? "deal" : "crate", daily ? { day: offer.key } : { crate: key }, "primary", p().credits < price || (daily && p().dealBought))}
    ${p().credits < price ? '<p class="quiet">You need more Credits to open this crate.</p>' : ""}` };
}


function tradePick(name, label, cards) {
  return `<label>${label}<select name="${name}" required><option value="">Select a card</option>
    ${cards.map(c => linkLabel(c.uid, cardName(c.cardId) + " · Lv " + c.level + " · " + c.uid.slice(0, 4))).join("")}</select></label>`;
}

function offerRows(type, entries) {
  const describe = card => card ? cardName(card.cardId) + " · Lv " + card.level : "Card unavailable";
  return entries.map(t => `<article class="offer"><div><span class="eyebrow">${t.incoming ? "Incoming" : "Sent"} · ${type === "duel" && t.ranked ? "Ranked duel" : type}</span>
    <h3>${esc(t.other)}</h3>
    ${type === "trade" ? `<p>Offered <strong>${esc(describe(t.offer))}</strong><br>Requested <strong>${esc(describe(t.wanted))}</strong></p>` : ""}
    <p>Expires ${countdown(t.expiresAt)}</p></div>
    ${t.incoming ? `<div class="actions">${confirm("Accept", "Accept " + type, type === "trade"
      ? "Exchange " + describe(t.wanted) + " for " + describe(t.offer) + "." : "Deploy your current fighting squad.",
    type + "Answer", { offer: t.id, accept: true }, type === "trade" && (!t.offer || !t.wanted))}${move("Decline", type + "Answer", { offer: t.id, accept: false })}</div>` : '<span class="tag">Awaiting response</span>'}
    </article>`).join("");
}

function network() {
  const state = g(), player = p(), rival = model.opponent;
  const own = player.cards.filter(c => role(c) === "reserve" && model.cards.has(c.cardId));
  const raidAvailable = rival && ready(rival.protectionUntil) && ready(rival.raidReadyAt) && player.combat.length;
  const offers = offerRows("trade", state.trades) + offerRows("duel", state.duels);
  return `${section("Fleet communications", "Commanders", "Find a rival, challenge a squad or exchange stored cards.")}
    ${pane("Dispatch inbox", offers || empty("No open trades or duel invitations."))}
    ${state.tradeHistory.length ? pane("Recent trades", `<ul class="records">${state.tradeHistory.map(t =>
      `<li>${esc(t.name)} · ${esc(t.status)} · ${esc(new Date(t.at).toLocaleDateString())}</li>`).join("")}</ul>`) : ""}
    ${pane("Find a commander", `<form data-form="opponent" class="filters compact">
      <label>Discord user ID<input name="target" inputmode="numeric" pattern="[0-9]{16,22}" value="${esc(rival?.id)}" required placeholder="Discord user ID"></label><button class="btn">Find commander</button></form>
      <p class="quiet">You can also select a commander in Rankings.</p>`)}
    ${rival ? `<div class="grid two">
      ${pane(rival.name, `<p>${esc(faction(rival.faction))} · Level ${rival.level} · ${rival.squadSize} fighters</p>
        <div class="ticker">${info("Your raid power", rival.ownPower)}${info("Rival defence", rival.rivalPower)}</div>
        ${rival.strong ? '<p class="warning">This defence is much stronger than your squad.</p>' : ""}
        ${!ready(rival.protectionUntil) ? `<p>New-player protection ends ${countdown(rival.protectionUntil)}.</p>` : ""}
        ${!ready(rival.raidReadyAt) ? `<p>Raid available ${countdown(rival.raidReadyAt)}.</p>` : ""}
        <div class="actions">${confirm("Launch raid", "Raid " + rival.name, rival.strong ? "This rival is much stronger. Deploy anyway?" : "Deploy against their defending squad. Defenders keep their cards and Credits.", "raid", { target: rival.id }, !raidAvailable)}</div>
        <form data-form="duel" class="inline-form"><label class="check"><input type="checkbox" name="ranked"> Ranked duel</label>
          <button class="btn" ${!player.combat.length || model.pending || model.busy ? "disabled" : ""}>Send challenge</button></form>`)}
      ${pane("Propose trade", own.length && rival.reserve.length ? `<form data-form="trade" class="stack">
        ${tradePick("offer", "You offer", own)}${tradePick("wanted", "You request", rival.reserve)}
        <button class="btn primary" ${model.pending || model.busy ? "disabled" : ""}>Review trade</button></form>
        <p class="quiet">Both cards must stay in Storage until accepted.</p>` : empty("Both commanders need a card in Storage to trade."))}
    </div>` : ""}`;
}

const metrics = { weekScore: "Weekly CP", seasonScore: "Season CP", xp: "Experience", cards: "Cards", raidsWon: "Raid wins", credits: "Credits" };
function rankings() {
  const history = g().history.filter(w => w.winners.length);
  return `${section("Fleet records", "Rankings", "The weekly board resets Monday at 00:00 UTC.")}
    <form class="filters compact" data-form="metric"><label>Board<select name="metric">${Object.entries(metrics).map(([key, label]) => linkLabel(key, label, model.metric)).join("")}</select></label>
      <button class="btn">Load standings</button></form>
    <div class="table-wrap"><table><thead><tr><th>Rank</th><th>Commander</th><th>Faction</th><th>League</th><th>${esc(metrics[model.metric])}</th></tr></thead><tbody>
    ${model.rows?.map((row, i) => `<tr><td>${String(i + 1).padStart(2, "0")}</td>
      <td>${row.id === g().account.id ? esc(row.name) + ' <span class="tag">You</span>' : cta(row.name, "opponent", row.id, "text-btn")}</td>
      <td>${esc(faction(row.faction))}</td><td>${esc(row.league)}</td><td>${n(row.score)}</td></tr>`).join("") || `<tr><td colspan="5">${model.rows ? "No commanders ranked yet." : "Standings are loading."}</td></tr>`}</tbody></table></div>
    ${pane("Previous winners", history.length ? history.slice(0, 8).map(w => `<details><summary>Week of ${esc(w.week)}</summary><ol>
      ${w.winners.slice(0, 3).map(x => `<li>${esc(x.name)} · ${n(x.score)} CP</li>`).join("")}</ol></details>`).join("") : empty("No archived winners yet."))}`;
}

function profile() {
  const player = p(), { account } = g();
  return `${section("Service record", account.name, faction(player.faction))}
    <div class="grid two">${pane("Commander identity", `<div class="profile-id"><img src="${esc(account.avatar || "/insignia.svg")}" alt=""><div>
      <h3>${esc(player.rank)} · Level ${player.level}</h3><p>${esc(player.league)} league · ${n(player.xp)} XP</p></div></div>
      <div class="ticker">${info("Discord ID", account.id)}${info("Credits", n(player.credits))}${info("Scrap", n(player.scrap))}</div>
      <p>Daily streak ${player.dailyStreak} · ${ready(player.dailyReadyAt) ? "Daily reward ready on next entry" : "Next daily reward " + countdown(player.dailyReadyAt)}</p>`)}
      ${pane("Career log", `<div class="ticker">${info("Cards", n(player.cards.length))}${info("Rolls", n(player.rolls))}${info("Raid wins", n(player.raidsWon))}
        ${info("Raid losses", n(player.raidsLost))}${info("Duels won", n(player.duelsWon))}${info("Ranked rating", n(player.rankedRating))}${info("Ranked wins", n(player.rankedWins))}${info("Ranked losses", n(player.rankedLosses))}</div>`)}</div>`;
}

function guild() {
  const state = g(), team = state.guild;
  const owner = team?.ownerId === state.account.id;
  return `${section("Allied command", "Guild", "Coordinate with a guild while keeping your personal faction and squad.")}
    ${team ? pane(team.name, `<div class="ticker">${info("Join code", team.code)}${info("Members", team.members.length + " / 20")}${info("Treasury", costs(team.treasury))}
      ${info("Weekly CP", n(team.weekScore))}</div>
      <form class="filters compact" data-form="guildDonate"><label>Donate Credits<input name="credits" type="number" min="100" max="20000" step="1" required></label>
      <button class="btn" ${model.pending || model.busy ? "disabled" : ""}>Review donation</button></form>
      <p>Economy research ${team.upgrades.economy}/10 · War tactics ${team.upgrades.war}/10</p>
      ${owner ? `<div class="actions">${["economy", "war"].map(type => confirm("Research " + type, "Fund guild research", "Spend " + costs((team.upgrades[type] + 1) * 2500) + " from the guild treasury.", "guildResearch", { type }, team.upgrades[type] >= 10)).join("")}</div>
      ${team.members.length > 1 ? `<form class="filters compact" data-form="guildTransfer"><label>Transfer to member<select name="target" required>
      ${team.members.filter(x => x !== state.account.id).map(x => linkLabel(x, x)).join("")}</select></label><button class="btn" ${model.pending || model.busy ? "disabled" : ""}>Review transfer</button></form>` : ""}` : ""}
      ${confirm("Leave guild", "Leave " + team.name, "You will lose access to this guild's bonuses and treasury.", "guildLeave", {}, owner && team.members.length > 1)}`) :
      `<div class="grid two">${pane("Join a guild", `<form class="stack" data-form="guildJoin"><label>Guild code<input name="code" pattern="[A-Fa-f0-9]{6}" maxlength="6" required></label>
        <button class="btn" ${model.pending || model.busy ? "disabled" : ""}>Join guild</button></form>`)}
        ${pane("Found a guild", `<form class="stack" data-form="guildCreate"><label>Guild name<input name="name" minlength="3" maxlength="28" required></label>
        <button class="btn" ${model.pending || model.busy ? "disabled" : ""}>Review founding cost</button></form>`)}</div>`}
    ${pane("Guild standings", model.guildRows?.length ? `<ol class="records">${model.guildRows.map(x => `<li>${esc(x.name)} · ${n(x.score)} CP · ${x.count} members</li>`).join("")}</ol>` : empty(model.guildRows ? "No ranked guilds." : "Loading guild standings."))}`;
}

export function resultView(body, result) {
  const found = result.found || (body.action === "enter" && result.card ? [result.card] : null);
  if (found) return {
    title: body.action === "enter" ? "Daily supplies delivered" : found.length === 1 ? "Recruit secured" : "Supply crate opened",
    className: "reveal",
    html: `<div class="reveal-grid">${found.map((x, i) => {
      const owned = byUid(x.uid);
      return `<div class="reveal-${esc(x.rarity.toLowerCase())}" style="--delay:${i * 115}ms">${cardTile(model.cards.get(x.id) || x, owned, !!owned)}</div>`;
    }).join("")}</div>
      <p>${body.action === "enter" ? "+" + costs(result.credits) : costs(result.spent) + " spent"}</p>
      <div class="actions">${body.action === "roll" ? move("Roll again · " + costs(meta().rollPrice), "roll", {}, "primary", p().credits < meta().rollPrice) : ""}
      ${nav("Collection", "collection")}${cta("Skip animation", "skipReveal")}</div>`
  };
  if (["mission", "event", "raid", "duelAnswer"].includes(body.action) && !result.declined) {
    const mission = body.action === "mission" || body.action === "event";
    const win = body.action === "duelAnswer" ? result.winner === g().account.id : result.win;
    const r = mission ? result : body.action === "duelAnswer" ? (win ? result.winnerRewards : result.loserRewards) : result.rewards;
    return { title: mission ? (win ? "Mission succeeded" : "Squad withdrew") : (win ? "Battle won" : "Battle lost"),
      className: "battle", html: `<div class="report"><span class="eyebrow">After-action report</span>
      ${mission ? `<h3>${esc(result.name)}</h3><p>Deployment success chance ${Math.round(result.chance * 100)}%</p>` :
        `<div class="scoreline">${info("Attacker roll", n(result.attackRoll))}<b>VS</b>${info("Defender roll", n(result.defenseRoll))}</div>
          <p>Attacker strength ${n(result.attackerPower)} · Defender strength ${n(result.defenderPower)}${result.upset ? " · Tactical upset" : ""}</p>
          ${body.action === "duelAnswer" && result.ranked ? "<p>" + (win ? "+" + result.ratingChange : "−" + result.ratingLoss) + " rating</p>" : ""}`}
      ${r ? `<div class="ticker">${info("Credits", "+" + n(r.credits))}${info("XP", "+" + n(r.xp))}${r.scrap ? info("Scrap", "+" + n(r.scrap)) : ""}${info("Command Points", "+" + n(r.points))}</div>` : ""}
      </div>` };
  }
  return null;
}

const screens = { hub, collection, squad, operations, shop, network, rankings, guild, profile };
