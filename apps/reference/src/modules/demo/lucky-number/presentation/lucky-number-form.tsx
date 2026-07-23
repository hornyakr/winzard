'use client';

import { useActionState } from 'react';

import {
  Field,
  FieldControl,
  FieldErrors,
  FieldHelp,
  FieldLabel,
  Fieldset,
  FormActions,
  FormErrorSummary,
  Legend,
} from '@/platform/ui/form';

import { initialGenerateLuckyNumberActionState } from './lucky-number.action-state';
import { generateLuckyNumberAction } from './lucky-number.actions';
import { LuckyNumberSubmitButton } from './lucky-number-submit-button';

const minimumId = 'lucky-number-minimum';
const maximumId = 'lucky-number-maximum';
const minimumHelpId = 'lucky-number-minimum-help';
const maximumHelpId = 'lucky-number-maximum-help';
const minimumErrorId = 'lucky-number-minimum-errors';
const maximumErrorId = 'lucky-number-maximum-errors';

export function LuckyNumberForm() {
  const [state, formAction, pending] = useActionState(
    generateLuckyNumberAction,
    initialGenerateLuckyNumberActionState,
  );
  const minimumErrors = state.fieldErrors.minimum ?? [];
  const maximumErrors = state.fieldErrors.maximum ?? [];
  const summaryErrors = [
    ...minimumErrors.map((error) => ({ ...error, fieldId: minimumId })),
    ...maximumErrors.map((error) => ({ ...error, fieldId: maximumId })),
    ...state.formErrors,
  ];

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border border-zinc-800 p-5">
      <FormErrorSummary errors={summaryErrors} />

      <Fieldset className="grid gap-4 sm:grid-cols-2" disabled={pending}>
        <Legend className="sr-only">Szerencseszám-tartomány</Legend>

        <Field>
          <FieldLabel htmlFor={minimumId}>Minimum</FieldLabel>
          <FieldControl
            aria-describedby={[minimumHelpId, minimumErrors.length > 0 ? minimumErrorId : null].filter(Boolean).join(' ')}
            aria-invalid={minimumErrors.length > 0 || undefined}
            defaultValue={state.values.minimum}
            id={minimumId}
            inputMode="numeric"
            name="minimum"
            required
            step="1"
            type="number"
          />
          <FieldHelp id={minimumHelpId}>A tartomány alsó, biztonságos egész értéke.</FieldHelp>
          <FieldErrors errors={minimumErrors} id={minimumErrorId} />
        </Field>

        <Field>
          <FieldLabel htmlFor={maximumId}>Maximum</FieldLabel>
          <FieldControl
            aria-describedby={[maximumHelpId, maximumErrors.length > 0 ? maximumErrorId : null].filter(Boolean).join(' ')}
            aria-invalid={maximumErrors.length > 0 || undefined}
            defaultValue={state.values.maximum}
            id={maximumId}
            inputMode="numeric"
            name="maximum"
            required
            step="1"
            type="number"
          />
          <FieldHelp id={maximumHelpId}>Legfeljebb 10 000 értékkel lehet nagyobb a minimumnál.</FieldHelp>
          <FieldErrors errors={maximumErrors} id={maximumErrorId} />
        </Field>
      </Fieldset>

      <FormActions>
        <LuckyNumberSubmitButton />
      </FormActions>

      {state.status === 'success' ? (
        <output className="block" aria-live="polite">
          Eredmény: {state.result.value} ({state.result.minimum}–{state.result.maximum})
        </output>
      ) : null}
    </form>
  );
}
