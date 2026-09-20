import { getMinimumBid } from './bidHelpers';

describe('getMinimumBid', () => {
  test('uses the current market value when it has fallen below the listing price', () => {
    expect(getMinimumBid({
      salePrice: 3550012,
      playerMaster: { marketValue: 3461270 },
    })).toBe(3461270);
  });

  test('uses the current market value when it is above the listing price', () => {
    expect(getMinimumBid({
      salePrice: 3000000,
      playerMaster: { marketValue: 3461270 },
    })).toBe(3461270);
  });

  test('falls back to zero for missing or invalid market values', () => {
    expect(getMinimumBid({ salePrice: 1000000, playerMaster: {} })).toBe(0);
    expect(getMinimumBid(null)).toBe(0);
  });
});
