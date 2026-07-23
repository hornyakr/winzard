'use client';

import { useFormStatus } from 'react-dom';

export function LuckyNumberSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      aria-disabled={pending}
      className="rounded-full bg-zinc-100 px-5 py-2 font-medium text-zinc-950 disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      name="intent"
      type="submit"
      value="generate"
    >
      {pending ? 'Generálás…' : 'Generálás Server Actionnel'}
    </button>
  );
}
