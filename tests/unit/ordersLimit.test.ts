import { describe, expect, it } from 'vitest';
import { listOrdersQuerySchema } from '../../src/modules/orders/orders.schema.js';

describe('listOrdersQuerySchema', () => {
  it('allows limit up to 500 including 250', () => {
    const parsed250 = listOrdersQuerySchema.parse({ limit: '250' });
    expect(parsed250.limit).toBe(250);

    const parsed500 = listOrdersQuerySchema.parse({ limit: '500' });
    expect(parsed500.limit).toBe(500);

    const parsedDefault = listOrdersQuerySchema.parse({});
    expect(parsedDefault.limit).toBe(10);
  });

  it('rejects limit greater than 500', () => {
    expect(() => listOrdersQuerySchema.parse({ limit: '501' })).toThrow();
  });
});

