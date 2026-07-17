export class InvalidLuckyNumberRangeError extends Error {
  readonly code = 'INVALID_LUCKY_NUMBER_RANGE';

  constructor(
    readonly minimum: number,
    readonly maximum: number,
    message = 'A szerencseszám-tartomány érvénytelen.',
  ) {
    super(message);
    this.name = 'InvalidLuckyNumberRangeError';
  }
}
