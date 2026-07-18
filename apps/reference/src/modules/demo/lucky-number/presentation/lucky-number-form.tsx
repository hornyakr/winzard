'use client';

import { useActionState } from 'react';

import { generateLuckyNumberAction } from './lucky-number.actions';
import { initialGenerateLuckyNumberActionState } from './lucky-number.action-state';

export function LuckyNumberForm() {
  const [state, formAction, pending] = useActionState(
    generateLuckyNumberAction,
    initialGenerateLuckyNumberActionState,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-zinc-800 p-5">
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={pending}>
        <label className="grid gap-2">
          <span>Minimum</span>
          <input className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2" defaultValue="10" name="minimum" />
          {state.fieldErrors?.minimum?.map((message) => <small key={message}>{message}</small>)}
        </label>
        <label className="grid gap-2">
          <span>Maximum</span>
          <input className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2" defaultValue="20" name="maximum" />
          {state.fieldErrors?.maximum?.map((message) => <small key={message}>{message}</small>)}
        </label>
      </fieldset>
      <button className="rounded-full bg-zinc-100 px-5 py-2 font-medium text-zinc-950" disabled={pending} type="submit">
        {pending ? 'Generálás…' : 'Generálás Server Actionnel'}
      </button>
      {state.formError ? <p role="alert">{state.formError}</p> : null}
      {state.result ? (
        <output className="block" aria-live="polite">
          Eredmény: {state.result.value} ({state.result.minimum}–{state.result.maximum})
        </output>
      ) : null}
    </form>
  );
}
