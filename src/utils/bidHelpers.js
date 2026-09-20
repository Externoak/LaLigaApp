/**
 * The market API's salePrice is the listing price captured when the player
 * entered the market. It can be older than the player's current value, so it
 * must not be used as the minimum bid.
 */
export const getMinimumBid = (marketItem) => {
  const marketValue = Number(marketItem?.playerMaster?.marketValue);
  return Number.isFinite(marketValue) && marketValue > 0 ? marketValue : 0;
};
