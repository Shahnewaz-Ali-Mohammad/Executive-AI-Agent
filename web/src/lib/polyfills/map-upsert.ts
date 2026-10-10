/**
 * Polyfill for Map/WeakMap `getOrInsert` and `getOrInsertComputed`.
 *
 * pdf.js 6 (used by the PDF viewer) calls these brand-new JavaScript methods.
 * Older browsers — including some Safari and Chrome versions still in use —
 * don't have them yet, which would crash the viewer. This adds them only
 * where missing. Safe to delete once all target browsers support them.
 */
type Upsertable = {
  has(key: unknown): boolean;
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown;
};

for (const Collection of [Map, WeakMap]) {
  const proto = Collection.prototype as unknown as Record<string, unknown>;

  if (typeof proto.getOrInsert !== "function") {
    Object.defineProperty(proto, "getOrInsert", {
      configurable: true,
      writable: true,
      value(this: Upsertable, key: unknown, value: unknown) {
        if (!this.has(key)) this.set(key, value);
        return this.get(key);
      },
    });
  }

  if (typeof proto.getOrInsertComputed !== "function") {
    Object.defineProperty(proto, "getOrInsertComputed", {
      configurable: true,
      writable: true,
      value(this: Upsertable, key: unknown, compute: (key: unknown) => unknown) {
        if (!this.has(key)) this.set(key, compute(key));
        return this.get(key);
      },
    });
  }
}

export {};
