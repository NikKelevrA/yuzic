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
 * A flag rather than `instanceof`: the error crosses module boundaries and is
 * rebuilt by Jest's module registry between suites, where a prototype check is
 * the kind of thing that silently answers `false`.
 */

const MARKER = 'codeAuthApproved';

type CodeAuthServerError = Error & { readonly [MARKER]: true };

/** Wrap the cause, keeping its message so the reason survives to a log. */
export function codeAuthServerError(cause: unknown): CodeAuthServerError {
  const message = cause instanceof Error ? cause.message : String(cause ?? 'Server rejected the account');
  return Object.assign(new Error(message), { [MARKER]: true } as const);
}

export function isCodeAuthServerError(error: unknown): error is CodeAuthServerError {
  return Boolean((error as Partial<CodeAuthServerError> | null | undefined)?.[MARKER]);
}
