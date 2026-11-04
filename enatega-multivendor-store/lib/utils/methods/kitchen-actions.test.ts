import { kitchenAction } from './kitchen-actions';

describe('kitchen final actions', () => {
  it('preparation has only the ready action', () => {
    expect(kitchenAction('ACCEPTED', false)).toBe('ready');
    expect(kitchenAction('ACCEPTED', true)).toBe('ready');
  });
  it('a ready delivery cannot be completed by the kitchen', () => {
    expect(kitchenAction('ASSIGNED', false)).toBeNull();
    expect(kitchenAction('PICKED', false)).toBeNull();
  });
  it('a ready takeaway requires actual customer handover', () => {
    expect(kitchenAction('ASSIGNED', true)).toBe('handover');
    expect(kitchenAction('DELIVERED', true)).toBeNull();
  });
});