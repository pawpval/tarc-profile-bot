
let context;
let musicTimer;
const tones = { Common: [220, 330], Uncommon: [247, 370], Rare: [262, 392, 523], Epic: [220, 330, 523, 659],
  Legendary: [196, 294, 392, 587, 784], Mythical: [220, 329, 494, 659, 988] };
const preference = { ui: false, effects: false, music: false, motion: true, volume: 40 };

export function loadSettings() {
  try { return { ...preference, ...JSON.parse(localStorage.getItem("gc-settings")) }; }
  catch { return { ...preference }; }
}
export function saveSettings(settings) {
  try { localStorage.setItem("gc-settings", JSON.stringify(settings)); } catch { /* storage unavailable */ }
  document.documentElement.classList.toggle("reduced", !settings.motion);
  clearInterval(musicTimer);
  musicTimer = undefined;
}

function play(notes, settings, volume, duration, spacing, type) {
  if (!context || context.state !== "running" || !settings.volume) return;
  const start = context.currentTime;
  notes.forEach((note, i) => {
    const at = start + i * spacing;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = note;
    oscillator.type = type;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume * settings.volume / 100), at + .035);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration);
  });
}
export function unlock(settings) {
  if (!(settings.ui || settings.effects || settings.music)) return;
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) return;
  context ||= new Audio();
  context.resume().then(() => {
    if (settings.music && !musicTimer) {
      const ambient = () => { if (!document.hidden) play([73.42, 110, 146.83, 164.81], settings, .035, 2.8, .42, "sine"); };
      ambient();
      musicTimer = setInterval(ambient, 5300);
    }
  }).catch(() => {});
}
export function clickSound(settings) {
  if (settings.ui) play([480], settings, .06, .09, .05, "sine");
}
export function effect(settings, rarity, won = true) {
  if (settings.effects) play(tones[rarity] || (won ? [196, 294, 392] : [247, 196, 147]), settings, .1, .35, .13, "triangle");
}
