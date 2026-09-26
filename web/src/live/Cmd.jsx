// A terminal command, set to wrap only between its words: a flag such as `--` or `--id` never splits,
// and only a long hex value (an identity commitment) may break inside, where nothing else would fit.
import { Fragment } from 'react';

const LONG = 24;

export default function Cmd({ children }) {
  const words = String(children).split(' ');
  return (
    <code className="lv-cmd" translate="no">
      {/* the spaces sit between the words, outside them: the only places a line may break */}
      {words.map((w, i) => (
        <Fragment key={i}>{i ? ' ' : null}<span className={w.length > LONG ? 'lv-w lv-w-long' : 'lv-w'}>{w}</span></Fragment>
      ))}
    </code>
  );
}
