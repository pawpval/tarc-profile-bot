import {createHash} from "node:crypto";

// Exact emoji tokens, in channel order, extracted from the user's second
// BSA_Regimental_Planning_Pack (1).zip. The old ZIP differs only in these
// 459 names and the new channel_naming_convention string. The fingerprint
// locks the per-category original names and order, preventing misalignment.
const EMOJI_SPECS = Object.freeze({
  RMP: {hash:"b2212a5d86c7c133", emojis:"👋 📜 📣 📌 ⭐ 📚 🪖 💬 📸 📌 📌 💡 🎓 🎓 📖 📝 🎓 📌 📖 📝 🎓 💬 🎓 🏋️ 📣 💬 🚓 📑 ⚙️ ⚙️ ⚙️ 🚨 🔗 🚨 🗂️ 📌 📅 📅 🎯 📅 👥 👥 👥 📋 📋 ⭐ ⭐ ⭐ 📌 ⭐ 💤 📤 🪖 📋 💬 📅 👥 ⭐ 📌"},
  ETS: {hash:"c7a0cd5cccd19c23", emojis:"👋 📜 📣 📌 ⭐ 📚 🪖 💬 📸 📌 📌 💡 📌 📅 🏋️ 📌 🎓 📣 🗓️ 📌 📅 📌 📌 📣 💬 🏋️ 📌 🏢 🏢 🏢 📅 📅 🎯 📅 👥 👥 👥 📋 📋 ⭐ ⭐ ⭐ 📌 ⭐ 💤 📤 🪖 📋 💬 📅 👥 ⭐ 📌"},
  RGG: {hash:"6ebccbe78986cd30", emojis:"👋 📜 📣 📌 ⭐ 📚 🪖 💬 📸 📌 📌 💡 🎓 🎓 📖 📌 🎓 📣 📌 📋 📌 👥 🏋️ 📌 🚀 🚓 📑 📅 📅 🎯 📅 👥 👥 👥 📋 📋 ⭐ ⭐ ⭐ 📌 ⭐ 💤 📤 🪖 📋 💬 📅 👥 ⭐ 📌"},
  RTR: {hash:"5f323e9365a54a72", emojis:"👋 📜 📣 📌 ⭐ 📚 🪖 💬 📸 📌 📌 💡 🏋️ 📌 📌 📌 📋 🚙 🚙 🚙 🚙 📑 📣 💬 ⚙️ 📋 ⚙️ 🚙 📌 📅 📅 🎯 📅 👥 👥 👥 📋 📋 ⭐ ⭐ ⭐ 📌 ⭐ 💤 📤 🪖 📋 💬 📅 👥 ⭐ 📌"},
  UKSF: {hash:"273b440d63b05085", emojis:"👋 📜 📣 📌 ⭐ 📚 🪖 💬 📸 📌 📌 💡 📌 📅 📌 📌 📌 📊 ⚙️ 🚀 📌 🚓 📣 💬 📅 📌 🚁 🚁 🚁 🚁 💬 🏋️ 🏋️ 📅 📅 🎯 📅 👥 👥 👥 📋 📋 ⭐ ⭐ ⭐ 📌 ⭐ 💤 📤 🪖 📋 💬 📅 👥 ⭐ 📌"},
  GR: {hash:"84102065342f8a76", emojis:"👋 📜 📣 📌 ⭐ 📚 🪖 💬 📸 📌 📌 💡 📌 🏋️ 🏋️ 📌 🎓 📌 🚓 🚀 📌 📌 🏋️ 🏋️ 📌 👥 📚 👥 📅 📅 🎯 📅 👥 👥 👥 📋 📋 ⭐ ⭐ ⭐ 📌 ⭐ 💤 📤 🪖 📋 💬 📅 👥 ⭐ 📌"},
  RIC: {hash:"e263f6e52153de86", emojis:"👋 📜 📣 📌 ⭐ 📚 🪖 💬 📸 📌 📌 💡 📋 🗂️ 🗂️ 👁️ 🚩 📋 📋 🚓 📅 🎯 🔎 📣 💬 🗂️ 📋 📣 💬 ⚙️ 📣 💬 📋 📣 💬 📌 📌 💤 📤 📋 📋 📅 📅 🎯 📅 👥 👥 👥 📋 📋 ⭐ ⭐ ⭐ 📌 ⭐ 💤 📤 🪖 📋 💬 📅 👥 ⭐ 📌"},
  OCA: {hash:"73e5a5ff0fc05acc", emojis:"👋 📜 📣 📌 📚 🎓 🎓 📨 📨 🎓 📖 📖 📖 📌 🎓 📣 💬 📝 📌 🎓 🎖️ 📌 📌 ⭐ ⭐ 👥 💬 🏋️ 👥 📌"},
  RICA: {hash:"a93b5cfee64a2f41", emojis:"👋 📜 📣 📌 📚 🎓 📨 📌 📊 🎓 📅 📅 📅 📝 🎓 👥 💬 📝 📌 🎓 ⭐ ⭐ 👥 💬 🏋️ 👥 📌"},
  RA: {hash:"556833c8c7285af6", emojis:"👋 📜 📑 ⚖️ 🎫 📌 📑 🔎 📌 📌 ⚖️ ⚖️ 🗂️ 🎫 🗂️ 👥 👥"}
});

export const REGIMENT_CHANNEL_NAMING="emoji│channel-name; emojis are literal Unicode and should be retained by builder";

// This source-to-source conversion was checked against all ten uploaded JSON
// proposals. Any future changes to original channel order/names fail closed.
export function applyRegimentalEmojiNames(originalPack){
  const mapped={};
  const codes=Object.keys(EMOJI_SPECS);
  if(Object.keys(originalPack).length!==codes.length)
    throw new Error("Regimental proposal count mismatch for emoji naming");
  for(const code of codes){
    const proposal=originalPack[code];
    const spec=EMOJI_SPECS[code];
    if(!proposal || proposal.server_code!==code)throw new Error("Missing source proposal "+code);
    const categoryEntries=proposal.categories_top_to_bottom.flatMap(cat=>
      cat.channels.map(ch=>[cat.name,ch.name]));
    const sourceHash=createHash("sha256").update(JSON.stringify(categoryEntries),"utf8")
      .digest("hex").slice(0,16);
    if(sourceHash!==spec.hash)
      throw new Error("Original channel layout/order has changed: refusing unsafe emoji mapping for "+code);
    const emojis=spec.emojis.split(" ");
    if(emojis.length!==categoryEntries.length)
      throw new Error("Emoji count mismatch for "+code);
    const transformed=structuredClone(proposal);
    let index=0;
    for(const cat of transformed.categories_top_to_bottom){
      for(const ch of cat.channels){
        const emoji=emojis[index++];
        if(!emoji || /[|│]/u.test(emoji))throw new Error("Invalid emoji token in "+code);
        ch.name=emoji+"│"+ch.name;
        if(ch.name.length>100)throw new Error("Discord channel name too long in "+code);
      }
    }
    transformed.channel_naming_convention=REGIMENT_CHANNEL_NAMING;
    mapped[code]=transformed;
  }
  return mapped;
}

export function regimentChannelAliases(name) {
  // Exact existing names are always allowed. Only the separator from the
  // authenticated owner-provided template authorizes a legacy plain-name alias.
  const boundary=String(name).indexOf("│");
  if(boundary<=0)return [name];
  return [name,name.slice(boundary+1)];
}
