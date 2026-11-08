import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder,
  StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, AttachmentBuilder
} from "discord.js";

const MAIN_GUILD_ID = String(process.env.TARC_MAIN_GUILD_ID || process.env.GUILD_ID || "");
const DATA_DIR = String(process.env.EMBED_DATA_DIR || process.env.TARC_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.BGC_CACHE_DIR || "./data");
const DATA_FILE = path.join(DATA_DIR, "tarc-embed-editor.json");
const MARSHAL_ROLE_ID = "1318201599365091408";
const ADMIN_ROLE_ID = "1433858724426158256";
const EXTRA_ROLE_IDS = String(process.env.EMBED_ALLOWED_ROLE_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
const LEADERSHIP_NAMES = new Set([
  "leadership", "senior leadership", "ownership", "co-owner", "owner", "group owner",
  "high command", "hicom", "supreme chancellor", "vice chancellor",
  "supreme commander", "grand marshal", "marshal commander",
  "administrator", "executive leadership"
]);
const MAX_DRAFTS = 150;
const MAX_POSTED = 500;
const state = { loaded: false, drafts: [], posted: [] };

function blankEmbed() {
  return {
    title: "", description: "", url: "", color: "#2b7fff",
    author: "", authorIcon: "", authorUrl: "",
    thumbnail: "", image: "", footer: "", footerIcon: "",
    timestamp: false, fields: []
  };
}
function newDraft(userId, guildId) {
  return {
    id: randomUUID().replace(/-/g, "").slice(0, 12),
    guildId: String(guildId), createdBy: String(userId), createdAt: Date.now(),
    updatedAt: Date.now(), content: "", embeds: [blankEmbed()],
    active: 0, links: [], published: []
  };
}
async function loadState() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const saved = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    if (Array.isArray(saved.drafts)) state.drafts = saved.drafts.slice(-MAX_DRAFTS);
    if (Array.isArray(saved.posted)) state.posted = saved.posted.slice(-MAX_POSTED);
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("[EMBED EDITOR] Could not load saved drafts:", error?.message || error);
  }
}
let saveQueue = Promise.resolve();
async function saveState() {
  const json = JSON.stringify({ version: 1, drafts: state.drafts.slice(-MAX_DRAFTS), posted: state.posted.slice(-MAX_POSTED) });
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temp = DATA_FILE + "." + randomUUID().slice(0, 8) + ".tmp";
    await fs.writeFile(temp, json, "utf8");
    await fs.rename(temp, DATA_FILE);
  });
  return saveQueue;
}
function touch(draft) { draft.updatedAt = Date.now(); }
function getDraft(id, guildId) {
  const draft = state.drafts.find(d => d.id === id && String(d.guildId) === String(guildId));
  if (!draft) throw new Error("Draft not found. It may have been removed, or Railway restarted without persistent storage.");
  if (!Array.isArray(draft.embeds) || !draft.embeds.length) draft.embeds = [blankEmbed()];
  if (!Array.isArray(draft.links)) draft.links = [];
  if (!Array.isArray(draft.published)) draft.published = [];
  draft.active = Math.min(draft.embeds.length - 1, Math.max(0, Number(draft.active) || 0));
  return draft;
}
function isUrl(value) {
  if (!value) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}
function validateUrl(value, label) {
  const v = String(value || "").trim();
  if (!isUrl(v)) throw new Error(label + " must be a full http(s) URL.");
  return v;
}
function validateHex(value) {
  const hex = String(value || "").trim();
  if (!hex) return "";
  if (!/^#?[0-9a-f]{6}$/i.test(hex)) throw new Error("Colour must be a six-digit hex code, such as #2B7FFF.");
  return "#" + hex.replace("#", "").toLowerCase();
}
function bounded(value, maximum, label) {
  const t = String(value || "").trim();
  if (t.length > maximum) throw new Error(label + " is too long (maximum " + maximum + " characters).");
  return t;
}
function editableEmbed(draft) { return draft.embeds[draft.active]; }
function hasVisualContent(e) {
  return Boolean(e.title || e.description || e.author || e.footer || e.image || e.thumbnail || e.fields?.length);
}
function fromDiscordEmbed(raw = {}) {
  return {
    title: bounded(raw.title, 256, "Title"),
    description: bounded(raw.description, 4000, "Description"),
    url: validateUrl(raw.url, "Title URL"),
    color: raw.color == null ? "#2b7fff" : validateHex(typeof raw.color === "number" ? raw.color.toString(16).padStart(6, "0") : raw.color),
    author: bounded(raw.author?.name, 256, "Author"),
    authorIcon: validateUrl(raw.author?.icon_url, "Author icon"),
    authorUrl: validateUrl(raw.author?.url, "Author URL"),
    thumbnail: validateUrl(raw.thumbnail?.url, "Thumbnail"),
    image: validateUrl(raw.image?.url, "Image"),
    footer: bounded(raw.footer?.text, 2048, "Footer"),
    footerIcon: validateUrl(raw.footer?.icon_url, "Footer icon"),
    timestamp: Boolean(raw.timestamp),
    fields: (Array.isArray(raw.fields) ? raw.fields : []).slice(0, 25).map(f => ({
      name: bounded(f.name, 256, "Field name"),
      value: bounded(f.value, 1024, "Field value"),
      inline: Boolean(f.inline)
    }))
  };
}
function buildEmbed(e, createdAt) {
  const b = new EmbedBuilder();
  if (e.title) b.setTitle(bounded(e.title, 256, "Title"));
  if (e.description) b.setDescription(bounded(e.description, 4000, "Description"));
  if (e.url && e.title) b.setURL(validateUrl(e.url, "Title URL"));
  if (e.color) b.setColor(parseInt(validateHex(e.color).slice(1), 16));
  if (e.author) b.setAuthor({
    name: bounded(e.author, 256, "Author"),
    ...(e.authorIcon ? { iconURL: validateUrl(e.authorIcon, "Author icon") } : {}),
    ...(e.authorUrl ? { url: validateUrl(e.authorUrl, "Author URL") } : {})
  });
  if (e.thumbnail) b.setThumbnail(validateUrl(e.thumbnail, "Thumbnail"));
  if (e.image) b.setImage(validateUrl(e.image, "Image"));
  if (e.footer) b.setFooter({
    text: bounded(e.footer, 2048, "Footer"),
    ...(e.footerIcon ? { iconURL: validateUrl(e.footerIcon, "Footer icon") } : {})
  });
  if (e.timestamp) b.setTimestamp(new Date(createdAt || Date.now()));
  const fields = Array.isArray(e.fields) ? e.fields : [];
  if (fields.length > 25) throw new Error("Each embed may have at most 25 fields.");
  for (const f of fields) {
    if (!f.name?.trim() || !f.value?.trim()) throw new Error("Embed fields need both a name and a value.");
    b.addFields({ name: bounded(f.name, 256, "Field name"), value: bounded(f.value, 1024, "Field value"), inline: Boolean(f.inline) });
  }
  return b;
}
function compile(draft) {
  if ((draft.embeds || []).length > 10) throw new Error("Discord permits at most ten embeds per message.");
  if ((draft.links || []).length > 5) throw new Error("Up to five link buttons can be added.");
  const embeds = draft.embeds.filter(hasVisualContent).map(e => buildEmbed(e, draft.createdAt));
  let characters = 0;
  for (const e of draft.embeds) {
    characters += ["title", "description", "author", "footer"].reduce((sum, key) => sum + String(e[key] || "").length, 0);
    characters += (e.fields || []).reduce((sum, f) => sum + String(f.name || "").length + String(f.value || "").length, 0);
  }
  if (characters > 6000) throw new Error("All embed text combined must stay within Discord's 6,000-character limit.");
  const content = bounded(draft.content, 2000, "Message text");
  if (!embeds.length && !content) throw new Error("Add a title, description, image, field or message text before posting.");
  const buttons = (draft.links || []).map(link => {
    if (!link.label?.trim()) throw new Error("Link button labels cannot be empty.");
    return new ButtonBuilder().setStyle(ButtonStyle.Link)
      .setLabel(bounded(link.label, 80, "Button label"))
      .setURL(validateUrl(link.url, "Button URL"));
  });
  return {
    content, embeds, components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [],
    allowedMentions: { parse: [] }
  };
}
function btn(id, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}
function row(...buttons) { return new ActionRowBuilder().addComponents(...buttons); }
function editorPanel(draft, notice = "") {
  const active = Number(draft.active) + 1;
  const title = draft.embeds[draft.active]?.title || "(untitled)";
  const links = draft.links.length;
  const components = [
    row(btn("te:basic:" + draft.id, "Text & Title", ButtonStyle.Primary),
      btn("te:author:" + draft.id, "Author"),
      btn("te:media:" + draft.id, "Images"),
      btn("te:footer:" + draft.id, "Footer"),
      btn("te:fieldadd:" + draft.id, "+ Field")),
    row(btn("te:fields:" + draft.id, "Manage Fields"),
      btn("te:links:" + draft.id, "Link Buttons (" + links + ")"),
      btn("te:append:" + draft.id, "+ Embed", ButtonStyle.Success, draft.embeds.length >= 10),
      btn("te:prev:" + draft.id, "◀", ButtonStyle.Secondary, draft.embeds.length <= 1),
      btn("te:next:" + draft.id, "▶", ButtonStyle.Secondary, draft.embeds.length <= 1)),
    row(btn("te:post:" + draft.id, "Post Here", ButtonStyle.Success),
      btn("te:choose:" + draft.id, "Choose Channel", ButtonStyle.Primary),
      btn("te:update:" + draft.id, "Update Posted", ButtonStyle.Primary, !draft.published.length),
      btn("te:remove:" + draft.id, "Remove Embed", ButtonStyle.Danger, draft.embeds.length <= 1)),
    row(btn("te:json:" + draft.id, "Import JSON"),
      btn("te:export:" + draft.id, "Export JSON"),
      btn("te:list:" + draft.id, "All Drafts"),
      btn("te:published:" + draft.id, "Posted Messages"))
  ];
  let embeds = [];
  try { if (hasVisualContent(editableEmbed(draft))) embeds = [buildEmbed(editableEmbed(draft), draft.createdAt)]; }
  catch { embeds = []; }
  const label = "Embed " + active + "/" + draft.embeds.length + " — " + title;
  const header = ["**TARC Embed Editor**", label, "Edit the draft below, preview it here, then post or update it.", notice ? "**" + notice.slice(0, 350) + "**" : ""].filter(Boolean).join("\n");
  const content = (header + (draft.content ? "\n\n**Message text:**\n" + draft.content.slice(0, 800) : "")).slice(0, 1950);
  return { content, embeds, components, allowedMentions: { parse: [] } };
}
function input(id, label, value, max, paragraph = false) {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(false).setMaxLength(max);
  if (value) field.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(field);
}
function modal(id, title, ...inputs) {
  return new ModalBuilder().setCustomId(id).setTitle(title).addComponents(inputs);
}
function fieldSelector(draft, notice = "") {
  const e = editableEmbed(draft);
  if (!e.fields?.length) return editorPanel(draft, "No fields yet. Press + Field to add one.");
  const select = new StringSelectMenuBuilder().setCustomId("te:fieldpick:" + draft.id)
    .setPlaceholder("Select a field to edit or reorder")
    .addOptions(e.fields.map((field, i) => ({
      label: (i + 1) + ". " + String(field.name || "Untitled").slice(0, 75),
      value: String(i), description: String(field.value || "").slice(0, 90)
    })));
  return {
    content: "**Fields for embed " + (draft.active + 1) + "**" + (notice ? "\n" + notice : ""),
    embeds: [], components: [new ActionRowBuilder().addComponents(select), row(btn("te:fieldadd:" + draft.id, "Add Field", ButtonStyle.Success), btn("te:back:" + draft.id, "Back"))],
    allowedMentions: { parse: [] }
  };
}
function listPanel(guildId, mode) {
  const items = mode === "posted" ? state.posted.filter(p => p.guildId === guildId).slice(-25).reverse() : state.drafts.filter(d => d.guildId === guildId).slice(-25).reverse();
  if (!items.length) return {
    content: mode === "posted" ? "No recorded editor posts yet. You can import a bot message by link." : "No saved drafts yet.",
    embeds: [], components: [row(btn("te:home:0", "Back"), btn("te:import:0", "Import Bot Message"))]
  };
  const menu = new StringSelectMenuBuilder().setCustomId("te:select_" + mode)
    .setPlaceholder(mode === "posted" ? "Select a posted message" : "Open a saved draft")
    .addOptions(items.map(item => {
      const name = mode === "posted" ? (item.title || "Untitled message") : (item.embeds?.[0]?.title || "Untitled draft");
      return {
        label: String(name).slice(0, 90),
        value: mode === "posted" ? item.id : item.id,
        description: mode === "posted" ? ("Channel ID " + item.channelId).slice(0, 98) : ("By " + item.createdBy).slice(0, 98)
      };
    }));
  return {
    content: mode === "posted" ? "**Previously posted embeds**" : "**Saved embed drafts**",
    embeds: [],
    components: [new ActionRowBuilder().addComponents(menu), row(btn("te:home:0", "Home"), btn("te:import:0", "Import Bot Message"))],
    allowedMentions: { parse: [] }
  };
}
function homePanel(notice = "") {
  return {
    content: "**TARC Embed Studio**\nCreate bot-owned embeds with Discord webhook-style editing.\n\n" +
      "Choose **New Draft**, open a saved draft, browse posted embeds, or import a message link to edit an existing bot embed." +
      (notice ? "\n\n" + notice : ""),
    embeds: [], components: [
      row(btn("te:new:0", "New Draft", ButtonStyle.Success),
        btn("te:list:0", "Saved Drafts"),
        btn("te:published:0", "Posted Embeds"),
        btn("te:import:0", "Import Bot Message", ButtonStyle.Primary))
    ], allowedMentions: { parse: [] }
  };
}
async function verifyAccess(interaction) {
  if (!interaction.inGuild?.() || !interaction.guildId) return false;
  if (MAIN_GUILD_ID && String(interaction.guildId) !== MAIN_GUILD_ID) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  let member = interaction.member;
  if (!member?.roles?.cache) {
    try { member = await interaction.guild.members.fetch(interaction.user.id); } catch { return false; }
  }
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles.cache.has(ADMIN_ROLE_ID) || member.roles.cache.has(MARSHAL_ROLE_ID)) return true;
  if (EXTRA_ROLE_IDS.some(id => member.roles.cache.has(id))) return true;
  return member.roles.cache.some(role => LEADERSHIP_NAMES.has(String(role.name || "").toLowerCase().trim()));
}
function canPublish(interaction, channel) {
  if (!channel?.send || !channel.guild || channel.guildId !== interaction.guildId) throw new Error("Choose a text channel in this server.");
  const botPerms = channel.permissionsFor(interaction.client.user);
  const userPerms = channel.permissionsFor(interaction.member?.roles ? interaction.member : interaction.user);
  if (!botPerms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error("The bot needs View Channel, Send Messages and Embed Links in that channel.");
  if (!userPerms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error("You need permission to view and send messages in that channel.");
}
async function postDraft(interaction, draft, channel) {
  canPublish(interaction, channel);
  const payload = compile(draft);
  const sent = await channel.send(payload);
  const entry = {
    id: randomUUID().replace(/-/g, "").slice(0, 12),
    draftId: draft.id, guildId: interaction.guildId, channelId: channel.id, messageId: sent.id,
    title: draft.embeds[0]?.title || "", postedBy: interaction.user.id, updatedAt: Date.now()
  };
  draft.published.push(entry);
  state.posted.push(entry);
  state.posted = state.posted.slice(-MAX_POSTED);
  touch(draft);
  await saveState().catch(error => console.warn("[EMBED EDITOR] Posted, but metadata was not saved:", error));
  return sent;
}
async function fetchPosted(interaction, item) {
  const channel = await interaction.client.channels.fetch(item.channelId);
  canPublish(interaction, channel);
  const message = await channel.messages.fetch(item.messageId);
  if (message.author.id !== interaction.client.user.id) throw new Error("This message was not posted by the TARC bot.");
  return message;
}
async function updatePosted(interaction, draft) {
  const item = draft.published.at(-1);
  if (!item) throw new Error("This draft has not been posted yet.");
  const message = await fetchPosted(interaction, item);
  await message.edit(compile(draft));
  item.title = draft.embeds[0]?.title || "";
  item.updatedAt = Date.now();
  touch(draft);
  await saveState();
  return message;
}
function isEditorInteraction(interaction) {
  return (interaction.isChatInputCommand?.() && interaction.commandName === "embed") ||
    (typeof interaction.customId === "string" && interaction.customId.startsWith("te:"));
}
export function getEmbedCommands() {
  return [new SlashCommandBuilder().setName("embed").setDescription("Leadership+: create, post and edit rich bot embeds").toJSON()];
}

function getModalField(interaction, key) {
  try { return interaction.fields.getTextInputValue(key).trim(); } catch { return ""; }
}
async function showPanel(interaction, payload) {
  if (interaction.isButton?.() || interaction.isChannelSelectMenu?.() || interaction.isStringSelectMenu?.() ||
      (interaction.isModalSubmit?.() && interaction.isFromMessage?.())) {
    return interaction.update(payload);
  }
  return interaction.reply({ ...payload, ephemeral: true });
}
async function reportError(interaction, error) {
  console.error("[EMBED EDITOR]", error);
  const message = String(error?.message || "Couldn't complete that editor action.").slice(0, 1600);
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply({ content: message, embeds: [], components: [] });
    return await interaction.reply({ content: message, ephemeral: true, allowedMentions: { parse: [] } });
  } catch { /* the interaction may already have expired */ }
}
function createModal(draft, kind, index = "") {
  const e = editableEmbed(draft);
  const id = "te:save:" + kind + ":" + draft.id + (index === "" ? "" : ":" + index);
  if (kind === "basic") return modal(id, "Embed text and colour",
    input("content", "Message content (outside embed)", draft.content, 2000, true),
    input("title", "Embed title", e.title, 256),
    input("description", "Embed description (Markdown allowed)", e.description, 4000, true),
    input("url", "Clickable title URL", e.url, 2000),
    input("color", "Hex colour (#2B7FFF)", e.color, 7));
  if (kind === "author") return modal(id, "Embed author",
    input("author", "Author name", e.author, 256),
    input("authorIcon", "Author icon URL", e.authorIcon, 2000),
    input("authorUrl", "Clickable author URL", e.authorUrl, 2000));
  if (kind === "media") return modal(id, "Embed images",
    input("thumbnail", "Thumbnail image URL", e.thumbnail, 2000),
    input("image", "Large image URL", e.image, 2000));
  if (kind === "footer") return modal(id, "Embed footer and timestamp",
    input("footer", "Footer text", e.footer, 2048, true),
    input("footerIcon", "Footer icon URL", e.footerIcon, 2000),
    input("timestamp", "Show timestamp? yes or no", e.timestamp ? "yes" : "no", 5));
  if (kind === "fieldnew" || kind === "fieldedit") {
    const field = kind === "fieldedit" ? e.fields?.[Number(index)] : null;
    return modal(id, kind === "fieldedit" ? "Edit embed field" : "Add embed field",
      input("name", "Field name", field?.name || "", 256),
      input("value", "Field value (Markdown allowed)", field?.value || "", 1024, true),
      input("inline", "Inline? yes or no", field?.inline ? "yes" : "no", 5));
  }
  if (kind === "linknew") return modal(id, "Add link button",
    input("label", "Button label", "", 80),
    input("url", "HTTPS link target", "", 2000));
  if (kind === "json") return modal(id, "Import webhook JSON",
    input("raw", "JSON (content and embeds)", "", 4000, true));
  throw new Error("Unknown editor form.");
}
function parseBool(value) {
  const val = String(value || "").trim().toLowerCase();
  if (!val || val === "no" || val === "false" || val === "off" || val === "0") return false;
  if (["yes", "true", "on", "1"].includes(val)) return true;
  throw new Error("Enter yes or no.");
}
function parseLinks(rawComponents = []) {
  const result = [];
  for (const row of rawComponents || []) {
    for (const b of row.components || []) {
      if (Number(b.style) !== 5 || !b.label || !b.url) continue;
      if (result.length < 5) result.push({ label: bounded(b.label, 80, "Link label"), url: validateUrl(b.url, "Link URL") });
    }
  }
  return result;
}
async function importBotMessage(interaction, provided) {
  const inputValue = String(provided || "").trim();
  const match = inputValue.match(/(?:discord(?:app)?\.com\/channels\/)(\d+)\/(\d+)\/(\d+)/i);
  const guildId = match?.[1] || interaction.guildId;
  const channelId = match?.[2] || interaction.channelId;
  const messageId = match?.[3] || (/^\d{16,22}$/.test(inputValue) ? inputValue : "");
  if (!messageId) throw new Error("Enter a Discord message link, or a message ID from this channel.");
  if (String(guildId) !== String(interaction.guildId)) throw new Error("The message must be from the main TARC server.");
  const channel = await interaction.client.channels.fetch(channelId);
  canPublish(interaction, channel);
  const msg = await channel.messages.fetch(messageId);
  if (msg.author.id !== interaction.client.user.id) throw new Error("Only messages authored by this bot can be imported.");
  if (!msg.embeds?.length && !msg.content) throw new Error("That bot message has no content or embeds to edit.");
  const existing = state.posted.find(item => item.guildId === guildId && item.channelId === channelId && item.messageId === messageId);
  if (existing) {
    const prior = state.drafts.find(draft => draft.id === existing.draftId);
    if (prior) return prior;
  }
  const draft = newDraft(interaction.user.id, interaction.guildId);
  draft.content = String(msg.content || "").slice(0, 2000);
  draft.embeds = (msg.embeds || []).slice(0, 10).map(embed => fromDiscordEmbed(embed.toJSON ? embed.toJSON() : embed));
  if (!draft.embeds.length) draft.embeds.push(blankEmbed());
  draft.links = parseLinks(msg.components.map(row => row.toJSON ? row.toJSON() : row));
  const record = existing || {
    id: randomUUID().replace(/-/g, "").slice(0, 12),
    draftId: draft.id, guildId, channelId, messageId,
    title: draft.embeds[0]?.title || "", postedBy: interaction.user.id, updatedAt: Date.now()
  };
  record.draftId = draft.id;
  if (!existing) state.posted.push(record);
  draft.published.push(record);
  state.drafts.push(draft);
  state.drafts = state.drafts.slice(-MAX_DRAFTS);
  await saveState();
  return draft;
}
async function saveForm(interaction, parts) {
  const kind = parts[2];
  if (kind === "import") {
    const draft = await importBotMessage(interaction, getModalField(interaction, "message"));
    return showPanel(interaction, editorPanel(draft, "Imported existing bot message. Update Posted edits the original."));
  }
  const draft = getDraft(parts[3], interaction.guildId);
  const e = editableEmbed(draft);
  if (kind === "basic") {
    draft.content = bounded(getModalField(interaction, "content"), 2000, "Message text");
    e.title = bounded(getModalField(interaction, "title"), 256, "Title");
    e.description = bounded(getModalField(interaction, "description"), 4000, "Description");
    e.url = validateUrl(getModalField(interaction, "url"), "Title URL");
    e.color = validateHex(getModalField(interaction, "color")) || "#2b7fff";
  } else if (kind === "author") {
    e.author = bounded(getModalField(interaction, "author"), 256, "Author name");
    e.authorIcon = validateUrl(getModalField(interaction, "authorIcon"), "Author icon");
    e.authorUrl = validateUrl(getModalField(interaction, "authorUrl"), "Author URL");
  } else if (kind === "media") {
    e.thumbnail = validateUrl(getModalField(interaction, "thumbnail"), "Thumbnail");
    e.image = validateUrl(getModalField(interaction, "image"), "Image");
  } else if (kind === "footer") {
    e.footer = bounded(getModalField(interaction, "footer"), 2048, "Footer");
    e.footerIcon = validateUrl(getModalField(interaction, "footerIcon"), "Footer icon");
    e.timestamp = parseBool(getModalField(interaction, "timestamp"));
  } else if (kind === "fieldnew" || kind === "fieldedit") {
    if (!Array.isArray(e.fields)) e.fields = [];
    const field = {
      name: bounded(getModalField(interaction, "name"), 256, "Field name"),
      value: bounded(getModalField(interaction, "value"), 1024, "Field value"),
      inline: parseBool(getModalField(interaction, "inline"))
    };
    if (!field.name || !field.value) throw new Error("Field name and value are both required.");
    if (kind === "fieldnew") {
      if (e.fields.length >= 25) throw new Error("Discord only allows 25 fields per embed.");
      e.fields.push(field);
    } else {
      const index = Number(parts[4]);
      if (!Number.isInteger(index) || !e.fields[index]) throw new Error("Field not found.");
      e.fields[index] = field;
    }
  } else if (kind === "linknew") {
    if (draft.links.length >= 5) throw new Error("A message can have up to five link buttons.");
    const label = bounded(getModalField(interaction, "label"), 80, "Button label");
    const url = validateUrl(getModalField(interaction, "url"), "Button URL");
    if (!label || !url) throw new Error("Both a label and URL are required.");
    draft.links.push({ label, url });
  } else if (kind === "json") {
    let raw;
    try { raw = JSON.parse(getModalField(interaction, "raw")); }
    catch { throw new Error("Invalid JSON. Paste the webhook payload or one embed object."); }
    const source = Array.isArray(raw) ? { embeds: raw } : raw;
    if (!source || typeof source !== "object") throw new Error("Provide a webhook JSON object.");
    const embeds = Array.isArray(source.embeds) ? source.embeds : [source];
    if (!embeds.length || embeds.length > 10) throw new Error("Webhook JSON must contain between 1 and 10 embeds.");
    const parsed = embeds.map(fromDiscordEmbed);
    draft.embeds = parsed;
    draft.active = 0;
    if (typeof source.content === "string") draft.content = bounded(source.content, 2000, "Message text");
    draft.links = parseLinks(source.components || []);
  } else {
    throw new Error("Unknown form.");
  }
  touch(draft);
  await saveState();
  return showPanel(interaction, editorPanel(draft, kind === "json" ? "Webhook JSON imported." : "Draft saved."));
}
async function showLinkPanel(interaction, draft) {
  const rows = [];
  if (draft.links.length) {
    const select = new StringSelectMenuBuilder().setCustomId("te:linkpick:" + draft.id)
      .setPlaceholder("Select a link button to remove")
      .addOptions(draft.links.map((link, i) => ({ label: String(link.label).slice(0, 90), value: String(i), description: String(link.url).slice(0, 95) })));
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(row(btn("te:linknew:" + draft.id, "Add Link Button", ButtonStyle.Success, draft.links.length >= 5),
    btn("te:back:" + draft.id, "Back")));
  return showPanel(interaction, {
    content: "**Link Buttons**\nAdd clickable URL buttons below the published embed. Select an existing button to remove it.",
    embeds: [], components: rows, allowedMentions: { parse: [] }
  });
}
async function handleSelect(interaction, parts) {
  const action = parts[1];
  if (action === "select_drafts") return showPanel(interaction, editorPanel(getDraft(interaction.values[0], interaction.guildId)));
  if (action === "select_posted") {
    const item = state.posted.find(p => p.id === interaction.values[0] && p.guildId === interaction.guildId);
    if (!item) throw new Error("Posted message entry not found.");
    const previous = state.drafts.find(draft => draft.id === item.draftId);
    if (previous) {
      const index = previous.published.findIndex(p => p.messageId === item.messageId && p.channelId === item.channelId);
      if (index >= 0) previous.published.push(...previous.published.splice(index, 1));
      await saveState();
      return showPanel(interaction, editorPanel(previous, "Selected posted message in <#" + item.channelId + ">. Update Posted edits this one."));
    }
    const draft = await importBotMessage(interaction, "https://discord.com/channels/" + item.guildId + "/" + item.channelId + "/" + item.messageId);
    return showPanel(interaction, editorPanel(draft, "Recovered posted embed."));
  }
  const draft = getDraft(parts[2], interaction.guildId);
  if (action === "fieldpick") {
    const index = Number(interaction.values[0]);
    const f = editableEmbed(draft).fields?.[index];
    if (!f) throw new Error("Field not found.");
    return showPanel(interaction, {
      content: "**Field " + (index + 1) + ": " + f.name + "**\n" + f.value.slice(0, 700) + "\nInline: " + (f.inline ? "Yes" : "No"),
      embeds: [], allowedMentions: { parse: [] },
      components: [row(btn("te:fieldedit:" + draft.id + ":" + index, "Edit", ButtonStyle.Primary),
        btn("te:fieldup:" + draft.id + ":" + index, "Move Up", ButtonStyle.Secondary, index === 0),
        btn("te:fielddown:" + draft.id + ":" + index, "Move Down", ButtonStyle.Secondary, index === editableEmbed(draft).fields.length - 1),
        btn("te:fielddelete:" + draft.id + ":" + index, "Delete", ButtonStyle.Danger),
        btn("te:fields:" + draft.id, "Back"))]
    });
  }
  if (action === "linkpick") {
    const index = Number(interaction.values[0]);
    if (!draft.links[index]) throw new Error("Link button not found.");
    draft.links.splice(index, 1);
    touch(draft);
    await saveState();
    return showLinkPanel(interaction, draft);
  }
  if (action === "channel") {
    const channel = interaction.channels.first();
    if (!channel) throw new Error("No channel selected.");
    await interaction.deferUpdate();
    const message = await postDraft(interaction, draft, channel);
    return interaction.editReply(editorPanel(draft, "Posted in <#" + channel.id + ">: " + message.url));
  }
  throw new Error("Unknown editor selection.");
}
async function handleButton(interaction, parts) {
  const action = parts[1], id = parts[2];
  if (action === "new") {
    const draft = newDraft(interaction.user.id, interaction.guildId);
    state.drafts.push(draft);
    state.drafts = state.drafts.slice(-MAX_DRAFTS);
    await saveState();
    return showPanel(interaction, editorPanel(draft, "New draft created."));
  }
  if (action === "home") return showPanel(interaction, homePanel());
  if (action === "list") return showPanel(interaction, listPanel(interaction.guildId, "drafts"));
  if (action === "published") return showPanel(interaction, listPanel(interaction.guildId, "posted"));
  if (action === "import") return interaction.showModal(modal("te:save:import:0", "Import bot message",
    input("message", "Discord message link or ID", "", 250)));
  const draft = getDraft(id, interaction.guildId);
  if (["basic", "author", "media", "footer"].includes(action)) return interaction.showModal(createModal(draft, action));
  if (action === "json") return interaction.showModal(createModal(draft, "json"));
  if (action === "fieldadd") return interaction.showModal(createModal(draft, "fieldnew"));
  if (action === "linknew") return interaction.showModal(createModal(draft, "linknew"));
  if (action === "fieldedit") return interaction.showModal(createModal(draft, "fieldedit", parts[3]));
  if (action === "fields") return showPanel(interaction, fieldSelector(draft));
  if (action === "links") return showLinkPanel(interaction, draft);
  if (action === "back") return showPanel(interaction, editorPanel(draft));
  if (action === "choose") {
    const select = new ChannelSelectMenuBuilder().setCustomId("te:channel:" + draft.id)
      .setPlaceholder("Choose where to post this embed")
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    return showPanel(interaction, { content: "Choose a channel to post your embed in.", embeds: [],
      components: [new ActionRowBuilder().addComponents(select), row(btn("te:back:" + draft.id, "Back"))] });
  }
  if (action === "prev" || action === "next" || action === "append" || action === "remove") {
    if (action === "prev") draft.active = (draft.active - 1 + draft.embeds.length) % draft.embeds.length;
    if (action === "next") draft.active = (draft.active + 1) % draft.embeds.length;
    if (action === "append") {
      if (draft.embeds.length >= 10) throw new Error("Discord only permits 10 embeds per message.");
      draft.embeds.push(blankEmbed()); draft.active = draft.embeds.length - 1;
    }
    if (action === "remove") {
      if (draft.embeds.length <= 1) throw new Error("Keep at least one embed in the editor.");
      draft.embeds.splice(draft.active, 1);
      draft.active = Math.max(0, draft.active - 1);
    }
    touch(draft); await saveState();
    return showPanel(interaction, editorPanel(draft));
  }
  if (["fieldup", "fielddown", "fielddelete"].includes(action)) {
    const index = Number(parts[3]), fields = editableEmbed(draft).fields || [];
    if (!Number.isInteger(index) || !fields[index]) throw new Error("Field not found.");
    if (action === "fielddelete") fields.splice(index, 1);
    if (action === "fieldup" && index > 0) [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
    if (action === "fielddown" && index + 1 < fields.length) [fields[index + 1], fields[index]] = [fields[index], fields[index + 1]];
    touch(draft); await saveState();
    return showPanel(interaction, fieldSelector(draft, "Field updated."));
  }
  if (action === "post") {
    await interaction.deferUpdate();
    const channel = await interaction.client.channels.fetch(interaction.channelId);
    const message = await postDraft(interaction, draft, channel);
    return interaction.editReply(editorPanel(draft, "Published: " + message.url));
  }
  if (action === "update") {
    await interaction.deferUpdate();
    const message = await updatePosted(interaction, draft);
    return interaction.editReply(editorPanel(draft, "Updated original message: " + message.url));
  }
  if (action === "export") {
    const payload = {
      content: draft.content,
      embeds: draft.embeds.filter(hasVisualContent).map(e => buildEmbed(e, draft.createdAt).toJSON()),
      components: draft.links.length ? [{ type: 1, components: draft.links.map(link => ({ type: 2, style: 5, label: link.label, url: link.url })) }] : []
    };
    const file = new AttachmentBuilder(Buffer.from(JSON.stringify(payload, null, 2), "utf8"), { name: "tarc-embed.json" });
    return interaction.reply({ content: "Your webhook-compatible embed JSON:", files: [file], ephemeral: true });
  }
  throw new Error("Unknown editor action.");
}
export async function handleEmbedInteraction(interaction) {
  if (!isEditorInteraction(interaction)) return false;
  try {
    if (!(await verifyAccess(interaction))) {
      await interaction.reply({ content: "Only TARC Leadership+ may use /embed in the main server.", ephemeral: true });
      return true;
    }
    await loadState();
    if (interaction.isChatInputCommand?.()) {
      await interaction.reply({ ...homePanel(), ephemeral: true });
      return true;
    }
    const parts = String(interaction.customId).split(":");
    if (interaction.isModalSubmit?.() && parts[1] === "save") await saveForm(interaction, parts);
    else if (interaction.isChannelSelectMenu?.() || interaction.isStringSelectMenu?.()) await handleSelect(interaction, parts);
    else if (interaction.isButton?.()) await handleButton(interaction, parts);
    else await interaction.reply({ content: "Unsupported editor interaction.", ephemeral: true });
  } catch (error) {
    await reportError(interaction, error);
  }
  return true;
}
