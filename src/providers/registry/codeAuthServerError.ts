/**
 * The marker for "the user approved, and what came after that failed."
 *
 * A code sign-in is two steps: the provider approves the account, then the app
 * checks that account against the server the user picked. `useCodeAuth` retries
 * a thrown poll on purpose, because the first step is a network call that is
 * allowed to blink and the code is still good a second later.
 *
 * The second step is not like that. Once a token exists the approval is a
 * settled fact, so a failure after it means the server refused the account or
 * could not be reached — retrying re-fails every couple of seconds until the
 * timeout reports `expired`, which is untrue twice over: the code was used, and
 * the thing actually wrong is the address. Marking that failure lets the hook
 * stop and say so.
 *
 * The two ways it fails are told apart here rather than at the screen, because
 * they need opposite advice. A server that answers 401/403 *refused the
 * account* — the address was right, which is why saying "check the address"
 * sends the user to correct the one thing that was already correct. Anything
 * else means the server was not reached, where the address is exactly what to
 * look at.
 *
 * A flag rather than `instanceof`: the error crosses module boundaries and is
 * rebuilt by Jest's module registry between suites, where a prototype check is
 * the kind of thing that silently answers `false`.
 */

const MARKER = 'codeAuthApproved';

/** `refused` — the server answered "no". `unreachable` — it did not answer. */
type CodeAuthServerFailure = 'refused' | 'unreachable';

type CodeAuthServerError = Error & { readonly [MARKER]: CodeAuthServerFailure };

/**
 * A status off the error where one is carried (`PlexRequestError.status`), and
 * otherwise off its text: Quick Connect reports the code in its message rather
 * than as a field, and a status is worth having from both.
 */
function classify(cause: unknown): CodeAuthServerFailure {
  const status = (cause as { status?: unknown } | null | undefined)?.status;
  if (status === 401 || status === 403) return 'refused';
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return /(?:^|[^0-9])(401|403)(?:[^0-9]|$)/.test(message) ? 'refused' : 'unreachable';
}

/** Wrap the cause, keeping its message so the reason survives to a log. */
export function codeAuthServerError(cause: unknown): CodeAuthServerError {
  const message = cause instanceof Error ? cause.message : String(cause ?? 'Server rejected the account');
  return Object.assign(new Error(message), { [MARKER]: classify(cause) } as const);
}

export function codeAuthServerFailure(error: unknown): CodeAuthServerFailure | null {
  return (error as Partial<CodeAuthServerError> | null | undefined)?.[MARKER] ?? null;
}
