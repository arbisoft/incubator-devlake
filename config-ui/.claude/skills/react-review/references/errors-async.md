<!--
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# Error Handling & Async

## Contents
1. One error pipeline
2. Rules
3. Reference shapes (to recommend when missing)
4. Async correctness
5. Hooks rules

## 1. One error pipeline

Error handling is middleware-style and central. Nothing is handled ad hoc in components.

1. **Axios interceptors** (`shared/api`, registered in `app/`) — global concerns: 401 → refresh/logout, 403 → permission page, network errors, normalizing the error shape, reporting.
2. **`useErrorHandler`** (`shared/hooks`) — the single place feature code handles errors: normalizes, shows a toast, reports, then runs caller callbacks (`onError`, `onFinally`) for anything feature-specific.
3. **`useFetch` / `useAxios`** — built on `useErrorHandler`; own `data`, `loading`, `error`; abort on unmount and on param change.
4. **`useConfirmClick`** — wraps async click handlers: optional confirmation, `loading`, double-submit guard, errors through `useErrorHandler`.
5. **Error Boundary** — at the app root, plus around independent regions (dashboard widgets, side panels) so one crash doesn't blank the page. Async errors that should show the boundary are forwarded with `showBoundary` (react-error-boundary). Boundaries have a fallback UI and a reset.

## 2. Rules

- **No `try/catch` in components, hooks or services.** It's bloat and scatters error policy. Fix: wrap with `useErrorHandler` and pass what's special as callbacks.

  ```tsx
  // before
  const [loading, setLoading] = useState(false);
  const save = async () => {
    setLoading(true);
    try {
      await saveUser(form);
      toast.success('Saved');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // after
  const { run: save, loading } = useConfirmClick(() => saveUser(form), {
    onSuccess: () => { toast.success(MESSAGES.USER_SAVED); onClose(); },
  });
  ```
- **Services don't catch.** Let errors propagate to the interceptor / handler.
- **No swallowing:** `.catch(() => {})`, empty `catch {}`, or `console.error` as the only handling.
- **Manual loading triplets** (`loading`/`error`/`data` useStates around a request) → `useFetch` or `useConfirmClick`.
- **Not flagged:** non-error control flow in pure utils — e.g. `JSON.parse` with a fallback value, feature detection. These aren't error *handling*.
- **Every data view handles loading, empty and error states**, using shared components (`<Loading/>`, `<EmptyState/>`, `<ErrorState onRetry/>`) — not ad hoc spinners and messages per screen.

## 3. Reference shapes (to recommend when missing)

Recommend these once under "Suggested shared building blocks" if the project doesn't have them.

```ts
// shared/hooks/use-error-handler.ts
type HandlerOptions = { onError?: (e: AppError) => void; onFinally?: () => void; silent?: boolean };
type HandlerResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const useErrorHandler = () => {
  const toast = useToast();
  const { showBoundary } = useErrorBoundary();

  return useCallback(
    async <T,>(task: () => Promise<T>, { onError, onFinally, silent }: HandlerOptions = {}): Promise<HandlerResult<T>> => {
      try {
        return { ok: true, data: await task() };
      } catch (raw) {
        const error = toAppError(raw);           // normalize once
        if (!isAbort(error)) {
          if (error.fatal) showBoundary(error);
          else if (!silent) toast.error(error.message);
          reportError(error);
          onError?.(error);
        }
        return { ok: false, error };
      } finally {
        onFinally?.();
      }
    },
    [toast, showBoundary],
  );
};
```

(The only `try/catch` in the app lives here and in the interceptor.)

```ts
// shared/hooks/use-fetch.ts
export const useFetch = <T,>(fetcher: (signal: AbortSignal) => Promise<T>, deps: DependencyList) => {
  const handle = useErrorHandler();
  const [state, setState] = useState<{ data?: T; loading: boolean }>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    handle(() => fetcher(controller.signal)).then((result) => {
      if (controller.signal.aborted) return;     // stale response — ignore
      setState((s) => ({ data: result.ok ? result.data : s.data, loading: false }));
    });
    return () => controller.abort();
  }, deps);

  return state;
};
```

```ts
// shared/hooks/use-confirm-click.ts
type ConfirmClickOptions<T> = {
  confirm?: string;
  onSuccess?: (data: T) => void;
  onError?: (e: AppError) => void;
};

export const useConfirmClick = <A extends unknown[], T>(
  action: (...args: A) => Promise<T>,
  { confirm, onSuccess, onError }: ConfirmClickOptions<T> = {},
) => {
  const handle = useErrorHandler();
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (...args: A) => {
    if (loading) return;                          // double-submit guard
    if (confirm && !(await confirmDialog(confirm))) return;
    setLoading(true);
    const result = await handle(() => action(...args), { onError, onFinally: () => setLoading(false) });
    if (result.ok) onSuccess?.(result.data);
  }, [loading, confirm, action, onSuccess, onError, handle]);

  return { run, loading };
};
```

Adapt names to the project; the point is that loading, errors and aborts are written once.

## 4. Async correctness

These are bugs, usually 🔴 or 🟠:

- **Races**: an effect fetches on param change without aborting or ignoring stale responses → older response can overwrite newer data. Fix: `AbortController` (built into `useFetch`).
- **State update after unmount**: no abort/cleanup on unmount.
- **Missing cleanup**: event listeners, intervals, timeouts, subscriptions, observers not removed in the effect's cleanup.
- **Double submit**: async button without a loading guard → `useConfirmClick`.
- **Floating promises**: async calls in handlers neither awaited nor routed through the handler → errors vanish.
- **Unbounded requests**: search-as-you-type without debounce.
- **Sequential awaits** for independent requests → `Promise.all`.

## 5. Hooks rules

- `react-hooks/exhaustive-deps` violations: missing deps cause stale closures; suppressing the lint rule needs a written reason.
- Stale closures in intervals/callbacks → functional `setState(prev => …)` or a ref.
- Effects used for derived data or event responses ("when X changes, set Y") → compute during render or do it in the event handler. Effects are for synchronizing with external systems.
- Hooks called conditionally or in loops.
- Custom hooks that return a new object/array every render that callers put in deps → memoize the return value.
