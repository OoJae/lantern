import { Component } from 'react';

/**
 * A part of the page that is its own chunk (a lazy page, a picture below the fold) and failed to load:
 * a tab opened before a redeploy asks for hashed files the new deployment no longer serves, or the
 * connection drops. Without a boundary React unmounts the whole app, header and footer included, and
 * leaves a blank page. With one, only this part is replaced: by `fallback` (nothing, if none).
 *
 * `resetKey` (App.jsx passes the path) clears a failure when it changes, so another page still draws.
 * It is a prop, not a React key, on purpose: a new key would mount a new Suspense boundary at every
 * route change, and a newly mounted boundary shows its loading line at once instead of the old page
 * being held while the new one's chunk arrives (lib/router.jsx).
 */
export class ChunkBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
