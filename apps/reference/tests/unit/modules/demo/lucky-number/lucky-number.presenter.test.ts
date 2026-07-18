import { describe, expect, it } from 'vitest';

import {
  presentLuckyNumber,
  toLuckyNumberResponse,
} from '@/modules/demo/lucky-number/presentation/lucky-number.presenter';

describe('LuckyNumberView presentation contract', () => {
  it('minimális, immutable és route-builderrel előállított view modelt készít', () => {
    const model = presentLuckyNumber({ value: 17, minimum: 10, maximum: 20 });

    expect(model).toEqual({
      eyebrow: 'Winzard presentation referencia',
      heading: 'A szerencseszámod: 17',
      rangeLabel: 'A szám a 10–20 tartományból származik.',
      navigationLabel: 'Szerencseszám műveletek',
      navigation: [
        { id: 'refresh', label: 'Másik szám kérése', href: '/lucky/number', delivery: 'page' },
        { id: 'range', label: 'Dinamikus 10–20 route', href: '/lucky/number/range/10/20', delivery: 'page' },
        { id: 'api', label: 'JSON-válasz megnyitása', href: '/api/lucky/number', delivery: 'api' },
      ],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.navigation)).toBe(true);
    expect(model.navigation.every(Object.isFrozen)).toBe(true);
  });

  it('külön HTTP/action response projectiont ad', () => {
    const response = toLuckyNumberResponse({ value: 5, minimum: 1, maximum: 9 });
    expect(response).toEqual({ value: 5, minimum: 1, maximum: 9 });
    expect(Object.isFrozen(response)).toBe(true);
  });
});
