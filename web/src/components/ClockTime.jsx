import { clockText } from '../lib/format.js';

/**
 * The simulated clock's time, "2026-09-21 14:13 UTC", as two halves that never break, with a space
 * between: on one line where it fits (the clock sizes it to), and the date over the time where it does
 * not, as when a reader widens the letter and word spacing (WCAG 1.4.12). Never clipped.
 */
export default function ClockTime({ at }) {
  const text = clockText(at);
  const i = text.indexOf(' ');
  if (i < 0) return text;
  return <><span className="nb">{text.slice(0, i)}</span> <span className="nb">{text.slice(i + 1)}</span></>;
}
