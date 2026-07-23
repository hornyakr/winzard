import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  Field,
  FieldControl,
  FieldErrors,
  FieldHelp,
  FieldLabel,
} from '@/platform/ui/form';

describe('accessible form primitives', () => {
  it('supports semantic label lookup and user input', async () => {
    const user = userEvent.setup();

    render(
      <Field>
        <FieldLabel htmlFor="minimum">Minimum</FieldLabel>
        <FieldControl id="minimum" name="minimum" type="number" />
      </Field>,
    );

    const input = screen.getByRole('spinbutton', { name: 'Minimum' });
    await user.type(input, '10');

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).value).toBe('10');
  });

  it('connects help and validation errors to the field', () => {
    render(
      <Field>
        <FieldLabel htmlFor="maximum">Maximum</FieldLabel>
        <FieldControl
          aria-describedby="maximum-help maximum-errors"
          aria-invalid="true"
          id="maximum"
          name="maximum"
          type="number"
        />
        <FieldHelp id="maximum-help">Legfeljebb 10 000 értékkel lehet nagyobb.</FieldHelp>
        <FieldErrors
          errors={[{ id: 'maximum-range', message: 'A maximum túl nagy.' }]}
          id="maximum-errors"
        />
      </Field>,
    );

    const input = screen.getByRole('spinbutton', { name: 'Maximum' });
    expect(input.getAttribute('aria-describedby')).toBe('maximum-help maximum-errors');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('A maximum túl nagy.').closest('ul')?.id).toBe('maximum-errors');
  });
});
