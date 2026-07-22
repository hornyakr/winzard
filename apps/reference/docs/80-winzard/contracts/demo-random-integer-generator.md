# RandomIntegerGenerator contract

Contract ID: `demo.random-integer-generator`

Owner: `demo.lucky-number`

## Compile-time surface

```ts
export interface RandomIntegerGenerator {
  betweenInclusive(minimum: number, maximum: number): number;
}
```

## Behavioral semantics

- `minimum` and `maximum` are inclusive safe-integer bounds validated by the application operation.
- A successful provider result is a safe integer in the closed interval `[minimum, maximum]`.
- The operation is synchronous, reentrant and free of externally observable mutable state.
- Repeated invocations are idempotent with respect to side effects, but intentionally return non-deterministic values.
- Cancellation, timeout, tenant scope and runtime input validation are not applicable to this module-local port.
- Provider-specific errors must not escape as application-level business results. The validating decorator maps an invalid provider result to `RangeError`.

## Proven providers

- `demo.random.node-crypto`: Node.js cryptographic random provider.
- `demo.random.validated`: postcondition-enforcing decorator.

Both providers use the same reference suite at `tests/unit/contracts/random-integer-generator.test.ts`.
