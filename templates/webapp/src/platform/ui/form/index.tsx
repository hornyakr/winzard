import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export function Field({ children }: Readonly<{ children: ReactNode }>) { return <div className="grid gap-2">{children}</div>; }
export function FieldLabel({ children, ...props }: ComponentPropsWithoutRef<'label'>) { return <label className="font-medium" {...props}>{children}</label>; }
export function FieldControl(props: ComponentPropsWithoutRef<'input'>) { return <input className="rounded border px-3 py-2" {...props} />; }
export function FieldHelp({ children, ...props }: ComponentPropsWithoutRef<'p'>) { return <p className="text-sm opacity-75" {...props}>{children}</p>; }
export function FieldErrors({ errors, id }: Readonly<{ errors: readonly Readonly<{ id: string; message: string }>[]; id: string }>) {
  if (errors.length === 0) return null;
  return <ul id={id}>{errors.map((formError) => <li key={formError.id}>{formError.message}</li>)}</ul>;
}
export function FormErrorSummary({ errors }: Readonly<{ errors: readonly Readonly<{ id: string; fieldId?: string; message: string }>[] }>) {
  if (errors.length === 0) return null;
  return <section aria-labelledby="form-error-summary-title" tabIndex={-1}><h2 id="form-error-summary-title">Ellenőrizd a megadott adatokat.</h2><ul>{errors.map((formError) => <li key={formError.id}>{formError.fieldId ? <a href={`#${formError.fieldId}`}>{formError.message}</a> : formError.message}</li>)}</ul></section>;
}
export function FormActions({ children }: Readonly<{ children: ReactNode }>) { return <div className="flex gap-3">{children}</div>; }
export function Fieldset({ children, ...props }: ComponentPropsWithoutRef<'fieldset'>) { return <fieldset {...props}>{children}</fieldset>; }
export function Legend({ children, ...props }: ComponentPropsWithoutRef<'legend'>) { return <legend {...props}>{children}</legend>; }
