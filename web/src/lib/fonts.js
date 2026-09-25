// Every face the site uses, requested at boot. /demo promises no request once it has loaded, and a
// face first used mid-story (the mono in a chip, the italic in a caption) would be one. index.html
// preloads the same five files, so each request resolves from that response rather than a new fetch.
const FACES = [
  ['300 1em "Lantern Display"'],
  ['italic 300 1em "Lantern Display"'],
  ['400 1em "Lantern Sans"'],
  ['400 1em "Lantern Mono"'],
  // A face with a unicode-range loads only for text in that range.
  ['400 1em "Lantern KR"', '등불'],
];

// A face exists only once the stylesheet declaring it has been applied, which can come after this
// module runs (on a cold load, or in the dev server, where CSS arrives by script). load() then
// matches nothing and resolves with no faces: ask again on the next frames, for a few seconds.
function request(font, text, tries = 0) {
  document.fonts.load(font, text).then((faces) => {
    if (faces.length === 0 && tries < 300) requestAnimationFrame(() => request(font, text, tries + 1));
  }, () => {});
}

if (typeof document !== 'undefined' && document.fonts?.load) {
  for (const [font, text] of FACES) request(font, text);
}
