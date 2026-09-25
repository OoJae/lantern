// Turn marks.js nodes into React elements (SVG presentation attributes as React props).
import { createElement } from 'react';

const prop = (k) => {
  if (k === 'class') return 'className';
  if (k.startsWith('aria-') || k.startsWith('data-')) return k;
  return k.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
};

function props(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs)) out[prop(k)] = v;
  return out;
}

export function renderNodes(nodes, key = 'n') {
  return nodes.map((n, i) =>
    createElement(
      n.tag,
      { key: `${key}${i}`, ...props(n.attrs) },
      n.children && n.children.length ? renderNodes(n.children, `${key}${i}.`) : undefined,
    ),
  );
}

/** aria props: decorative by default; a title makes it an image with that name. */
export function a11y(title) {
  return title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: 'false' };
}
