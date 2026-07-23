import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export function Field({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-2">{children}</div>;
}

export function FieldLabel({ children, ...props }: ComponentPropsWithoutRef<'label'>) {
  return <label className="font-medium" {...props}>{children}</label>;
}

export function FieldControl(props: ComponentPropsWithoutRef<'input'>) {
  return <input className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2" {...props} />;
}

export function FieldHelp({ children, ...props }: ComponentPropsWithoutRef<'p'>) {
  return <p className="text-sm text-zinc-400" {...props}>{children}</p>;
}

export function FieldErrors({ errors, id }: Readonly<{
  errors: readonly Readonly<{ id: string; message: string }>[];
  id: string;
}>) {
  if (errors.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-red-300" id={id}>
      {errors.map((formError) => <li key={formError.id}>{formError.message}</li>)}
    </ul>
  );
}

export function FormErrorSummary({ errors, title = 'Ellenőrizd a megadott adatokat.' }: Readonly<{
  errors: readonly Readonly<{ id: string; fieldId?: string; message: string }>[];
  title?: string;
}>) {
  if (errors.length === 0) return null;
  return (
    <section aria-labelledby="form-error-summary-title" className="rounded border border-red-800 p-4" tabIndex={-1}>
      <h2 className="font-semibold" id="form-error-summary-title">{title}</h2>
      <ul className="mt-2 list-disc pl-5">
        {errors.map((formError) => (
          <li key={formError.id}>
            {formError.fieldId ? <a className="underline" href={`#${formError.fieldId}`}>{formError.message}</a> : formError.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FormActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function Fieldset({ children, ...props }: ComponentPropsWithoutRef<'fieldset'>) {
  return <fieldset className="grid gap-4" {...props}>{children}</fieldset>;
}

export function Legend({ children, ...props }: ComponentPropsWithoutRef<'legend'>) {
  return <legend className="font-semibold" {...props}>{children}</legend>;
}
