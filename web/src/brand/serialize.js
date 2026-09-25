// Serialise a marks.js drawing to an SVG document string (used by web/scripts/brand.mjs;
// not imported by the app). Presentation attributes only: it refuses a style attribute.

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function nodeToString(node) {
  if (typeof node === 'string') return esc(node);
  const { tag, attrs, children } = node;
  if (tag === 'style' || 'style' in attrs) throw new Error('no style in brand SVG');
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  if (!children || children.length === 0) return `<${tag}${a}/>`;
  return `<${tag}${a}>${children.map(nodeToString).join('')}</${tag}>`;
}

/**
 * @param {object[]} nodes
 * @param {{ viewBox: string, width?: number|string, height?: number|string, title?: string }} o
 */
export function svgDocument(nodes, { viewBox, width, height, title } = {}) {
  const attrs = { xmlns: 'http://www.w3.org/2000/svg', viewBox };
  if (width != null) attrs.width = width;
  if (height != null) attrs.height = height;
  if (title) {
    attrs.role = 'img';
    attrs['aria-label'] = title;
  }
  const head = Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const body = (title ? `<title>${esc(title)}</title>` : '') + nodes.map(nodeToString).join('');
  return `<svg${head}>${body}</svg>\n`;
}
