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
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {enumeration.results.map(({ t, r, verdict }) => (
            <tr key={t.view.id} data-target={t.view.id} data-verdict={verdict} data-named={r.named.size}>
              <th scope="row">{t.view.label.trim()}</th>
              {!compact && <td><code>{t.view.scheme}</code></td>}
              <td className="num">{r.probes}</td>
              <td className="num">{r.named.size} of {t.truth.guardians}</td>
              {!compact && <td className="num">{r.votes} of {t.truth.votes}</td>}
              <td><span className={`chip ${verdict === 'HELD' ? 'ok' : 'no'}`}>{verdict === 'HELD' ? 'held' : 'broken'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
