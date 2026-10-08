// Shared: turn a pipe/comma-separated menu description into component chips (None / Extra).
const STOP_WORDS = /^(a|an|the|of|with|and|or|our|your|served|topped|drizzled|finished|fresh|freshly|house|homemade|home-made|made|delicious|classic|signature|choice|side|style|any|two|three|one|in|on|to|for|from|&|plus|all|day|perfect|rich|creamy|crispy|warm|hot|cold|chilled|iced|sweet|light|large|small|regular|mini|big|new)$/i;
export function ingredientsFromDescription(desc, name) {
  if (!desc) return [];
  let d = String(desc).toLowerCase().replace(/\([^)]*\)/g, " ");
  d = d.replace(/\b(served|topped|finished|drizzled|filled|stuffed|layered|garnished|paired|comes|accompanied)\s+(with|by)\b/g, ",").replace(/\bwith\b/g, ",").replace(/\s*&\s*/g, ",").replace(/\b(and|plus)\b/g, ",").replace(/[.;:!\/|•·\-–—]/g, ",").replace(/\n+/g, ",");
  const parts = d.split(",").map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (let part of parts) {
    part = part.replace(/\b(a|an|the|of|our|your|choice of|side of|fresh|freshly|house|homemade|home-made|crispy|creamy|warm|hot|cold|rich|delicious|classic|signature|two|three|one|double|triple|large|small|mini|big|new|your choice|hearty|generous|tasty|yummy|famous|favourite|favorite|best|loaded|ultimate|special|premium|authentic|traditional)\b/g, " ").replace(/\s+/g, " ").trim();
    if (/\b(breakfast|lunch|dinner|meal|dish|platter|plate|combo|feast|treat|dessert|experience|selection)\b/.test(part) && part.split(" ").length <= 2) continue; // "hearty breakfast" is not a component
    const words = part.split(" ").filter((w) => w && !STOP_WORDS.test(w));
    if (!words.length || words.length > 3) continue;
    const phrase = words.join(" ");
    if (phrase.length < 3 || phrase.length > 24) continue;
    if (name && name.toLowerCase().includes(phrase)) continue; // the dish itself isn't a component
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out.slice(0, 8);
}
export const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
