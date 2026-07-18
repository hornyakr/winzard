import type { LuckyNumberDto } from '../application/dto/lucky-number.dto';

export type LuckyNumberResponse = Readonly<{
  value: number;
  minimum: number;
  maximum: number;
}>;

export function toLuckyNumberResponse(dto: LuckyNumberDto): LuckyNumberResponse {
  return {
    value: dto.value,
    minimum: dto.minimum,
    maximum: dto.maximum,
  };
}
