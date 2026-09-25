// The 404: nothing at this address. The blackout's own pictogram (03-dark: a lantern with no flame,
// its seal still on the line). Lazy, with the /brand page's stylesheet, so the first load carries
// neither; the pictogram is the landing's own lazy chunk, drawn into a box CSS has already sized.
// (Imported lazily here as on the landing: a page that shares the router with /demo and /attacks and
// loads chunks the way they do keeps the router in their shared chunk, not a first-load chunk of
// its own.)
import { lazy, Suspense } from 'react';
import { Link } from '../lib/router.jsx';
import '../styles/brand-page.css';

const Pictogram = lazy(() => import('../brand/Pictogram.jsx'));

export default function NotFound() {
  return (
    <section className="page narrow nf">
      <div className="nf-art" aria-hidden="true"><Suspense fallback={null}><Pictogram name="03-dark" /></Suspense></div>
      <h1>Nothing here</h1>
      <p className="nf-out">This lantern is out.</p>
      <p><Link to="/" className="button">Back to the start</Link></p>
    </section>
  );
}
