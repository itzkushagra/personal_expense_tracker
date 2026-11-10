/**
 * Start a page's data loader from an effect.
 *
 * The loader runs in a promise callback, so every state update it makes happens after the
 * effect has finished, never synchronously inside it (which would re-render straight away
 * and is what React's set-state-in-effect rule guards against). Resolves with the loader's result.
 */
export function startLoad<T>(load: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(load);
}
