// Based off https://github.com/trekhleb/javascript-algorithms/blob/master/src/data-structures/lru-cache/LRUCacheOnMap.js

class LRUCache<K, V> extends Map<K, V> {
  private capacity: number;

  constructor(capacity: number) {
    super();
    this.capacity = capacity;
  }

  get(key: K) {
    if (!super.has(key)) return undefined;
    const val = super.get(key)!;
    super.delete(key);
    super.set(key, val);
    return val;
  }

  set(key: K, val: V) {
    super.delete(key);
    super.set(key, val);

    if (super.size > this.capacity) {
      super.delete(super.keys().return!().value as K);
    }

    return this;
  }
}

export default LRUCache;
