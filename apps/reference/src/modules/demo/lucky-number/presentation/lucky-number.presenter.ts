import type { LuckyNumberDto } from '../application/dto/lucky-number.dto';
import { luckyNumberRoutes } from './lucky-number.routes';
import type { LuckyNumberViewModel } from './lucky-number.view-model';

export type LuckyNumberResponse = Readonly<{
  value: number;
  minimum: number;
  maximum: number;
}>;

export function presentLuckyNumber(dto: LuckyNumberDto): LuckyNumberViewModel {
  return Object.freeze({
    eyebrow: 'Winzard presentation referencia',
    heading: `A szerencseszámod: ${dto.value}`,
    rangeLabel: `A szám a ${dto.minimum}–${dto.maximum} tartományból származik.`,
    navigationLabel: 'Szerencseszám műveletek',
    navigation: Object.freeze([
      Object.freeze({
        id: 'refresh',
        label: 'Másik szám kérése',
        href: luckyNumberRoutes.index(),
        delivery: 'page',
      }),
      Object.freeze({
        id: 'range',
        label: 'Dinamikus 10–20 route',
        href: luckyNumberRoutes.range(10, 20),
        delivery: 'page',
      }),
      Object.freeze({
        id: 'api',
        label: 'JSON-válasz megnyitása',
        href: luckyNumberRoutes.api(),
        delivery: 'api',
      }),
    ]),
  });
}

export function toLuckyNumberResponse(dto: LuckyNumberDto): LuckyNumberResponse {
  return Object.freeze({
    value: dto.value,
    minimum: dto.minimum,
    maximum: dto.maximum,
  });
}
