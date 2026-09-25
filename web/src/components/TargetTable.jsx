// The four guardian designs against one attacker: /attacks draws it in full, and /demo's beat 5 draws
// the compact one inside its step. Each cell carries its column's name in data-label: where a phone
// has no room for six columns, each row is laid out as a card that labels its own figures (the
// labels are drawn by CSS and read as nothing; the table's own headers still name every cell).
export function TargetTable({ enumeration, compact = false }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Attack results by design">
      <table className={`targets ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            <th scope="col">Design</th>
            {!compact && <th scope="col">What the leaf is</th>}
            <th scope="col" className="num">Probes</th>
            <th scope="col" className="num">Guardians named</th>
            {!compact && <th scope="col" className="num">Votes linked</th>}
            <th scope="col" className="verdict">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {enumeration.results.map(({ t, r, verdict }) => (
            <tr key={t.view.id} data-target={t.view.id} data-verdict={verdict} data-named={r.named.size}>
              <th scope="row">{t.view.label.trim()}</th>
              {!compact && <td className="leaf" data-label="What the leaf is"><code>{t.view.scheme}</code></td>}
              <td className="num" data-label="Probes">{r.probes}</td>
              <td className="num" data-label="Guardians named">{r.named.size} of {t.truth.guardians}</td>
              {!compact && <td className="num" data-label="Votes linked">{r.votes} of {t.truth.votes}</td>}
              <td className="verdict" data-label="Verdict"><span className={`chip ${verdict === 'HELD' ? 'ok' : 'no'}`}>{verdict === 'HELD' ? 'held' : 'broken'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
