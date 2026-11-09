// Generates original code-native faction portraits. These cover TARC-specific
// company/rank cards that have no licensed public character portraits.
// Run: npm install && node game/renderCardArt.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "assets");
const sketches = {
  clone: { base:"#527dc1", accent:"#a6c7ff", armor:"#e5edf4", helmet:"clone" },
  commander: { base:"#325e92", accent:"#fae4a8", armor:"#eef2f6", helmet:"clone" },
  droid: { base:"#a98b45", accent:"#ecd595", armor:"#d9cba1", helmet:"droid" },
  outlaw: { base:"#367367", accent:"#e9bf83", armor:"#607a74", helmet:"hunter" },
  jedi: { base:"#365f7c", accent:"#8fdbfc", armor:"#aaa18c", helmet:"hood" },
  sith: { base:"#663d59", accent:"#f98390", armor:"#555062", helmet:"hood" },
  vehicle: { base:"#4b607e", accent:"#b3e7f8", armor:"#cad1d9", helmet:"vehicle" }
};
const shape = {
  clone: (s) => `<path d="M196 448Q162 282 214 196Q350 94 486 196Q542 280 504 448L462 494L242 494Z" fill="${s.armor}" stroke="#24323f" stroke-width="13"/>
    <path d="M225 309Q350 265 475 309L451 375L373 391L350 465L327 391L248 375Z" fill="#172636"/>
    <path d="M230 210Q350 144 470 210" fill="none" stroke="${s.base}" stroke-width="36"/>
    <path d="M310 395L310 457M390 395L390 457" stroke="${s.base}" stroke-width="13"/>
    <rect x="185" y="346" width="52" height="90" rx="12" fill="${s.armor}" stroke="#24323f" stroke-width="8"/>
    <rect x="463" y="346" width="52" height="90" rx="12" fill="${s.armor}" stroke="#24323f" stroke-width="8"/>
    <path d="M250 235Q350 208 450 235" fill="none" stroke="${s.accent}" stroke-width="10" opacity=".9"/>`,
  droid: s => `<path d="M265 240Q350 193 435 240L480 305L437 380L268 380L223 305Z" fill="${s.armor}" stroke="#39352e" stroke-width="13"/>
    <rect x="274" y="271" width="152" height="36" rx="10" fill="#3c3832"/><circle cx="307" cy="289" r="10" fill="${s.accent}"/><circle cx="393" cy="289" r="10" fill="${s.accent}"/>
    <path d="M290 367L290 445M410 367L410 445" stroke="#342e23" stroke-width="15"/>
    <path d="M320 380L350 407L380 380" stroke="#a09370" fill="none" stroke-width="13"/>
    <rect x="331" y="215" width="38" height="35" rx="12" fill="${s.accent}"/>`,
  hunter: s => `<path d="M207 473L195 310Q195 171 350 150Q505 171 505 310L493 473L444 518L256 518Z" fill="${s.armor}" stroke="#1d2c2f" stroke-width="13"/>
    <path d="M237 305L465 305L425 356L368 366L350 474L332 366L275 356Z" fill="#131b23"/>
    <path d="M196 230L145 169L145 367" fill="none" stroke="${s.accent}" stroke-width="14"/>
    <path d="M250 209Q352 159 452 209" fill="none" stroke="${s.accent}" stroke-width="14"/>
    <path d="M258 419L270 485M443 419L432 485" stroke="${s.base}" stroke-width="23"/>`,
  hood: s => `<path d="M181 510Q175 160 350 130Q527 160 519 510L454 535L246 535Z" fill="#332c3a" stroke="${s.base}" stroke-width="25"/>
    <path d="M237 400Q210 245 350 218Q490 245 464 400L432 460L268 460Z" fill="#9c8c79"/>
    <path d="M256 357Q350 315 444 357" fill="none" stroke="#362c2d" stroke-width="18"/>
    <path d="M260 378L315 373M385 373L440 378" stroke="${s.accent}" stroke-width="9"/>
    <path d="M350 449L347 490" stroke="#66554c" stroke-width="8"/>
    <path d="M190 433Q246 176 350 160Q459 176 505 433" fill="none" stroke="${s.armor}" stroke-width="16" opacity=".5"/>
    <path d="M480 200L495 734" stroke="${s.accent}" stroke-width="19" opacity=".8"/>`,
  vehicle: s => `<path d="M350 135L492 327L553 576L465 635L350 573L235 635L147 576L208 327Z" fill="${s.armor}" stroke="#223345" stroke-width="14"/>
    <path d="M350 217L430 334L400 461L300 461L270 334Z" fill="#143348" stroke="${s.accent}" stroke-width="11"/>
    <path d="M230 541L118 678L245 649L350 598L455 649L582 678L470 541" fill="${s.base}" stroke="#203040" stroke-width="12"/>
    <path d="M304 370L396 370" stroke="${s.accent}" stroke-width="7"/><path d="M350 190L350 127" stroke="${s.accent}" stroke-width="10"/>`
};

function svgFor(style) {
  const body = style.helmet === "vehicle" ? "" : `<path d="M126 963Q105 664 214 572L280 534L420 534L486 572Q596 664 574 963Z" fill="${style.armor}" stroke="#202b3b" stroke-width="20"/>
    <path d="M168 675L258 603L350 672L442 603L532 675" stroke="${style.base}" stroke-width="28" fill="none"/>
    <path d="M330 744L370 744L360 863L340 863Z" fill="${style.base}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="980" viewBox="0 0 700 980">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#08101e"/><stop offset=".55" stop-color="${style.base}" stop-opacity=".93"/><stop offset="1" stop-color="#080e18"/></linearGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#101d2b"/><stop offset="1" stop-color="#070913"/></linearGradient></defs>
  <rect width="700" height="980" fill="url(#bg)"/>
  <g opacity=".4" stroke="${style.accent}" stroke-width="3"><path d="M0 290L700 90M0 630L700 440M0 790L700 590"/><path d="M140 0L140 980M570 0L570 980"/></g>
  <path d="M0 850L700 680L700 980L0 980Z" fill="url(#floor)" opacity=".82"/>
  <circle cx="350" cy="376" r="300" fill="${style.accent}" opacity=".12"/>
  ${body}<g>${shape[style.helmet](style)}</g>
  <path d="M28 27L138 27M28 27L28 148M672 27L564 27M672 27L672 148M28 953L138 953M28 953L28 830M672 953L564 953M672 953L672 830" stroke="${style.accent}" stroke-width="7" fill="none" opacity=".65"/>
  </svg>`;
}

await mkdir(outDir, {recursive:true});
for (const [key,style] of Object.entries(sketches)) {
  const png = new Resvg(svgFor(style),{ fitTo:{ mode:"width",value:420 } }).render().asPng();
  await writeFile(join(outDir,`${key}.png`),png);
  process.stdout.write(`${key}: ${png.length} bytes\n`);
}
