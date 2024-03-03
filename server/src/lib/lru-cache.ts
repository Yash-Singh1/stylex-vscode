class LRUCache<K, V> extends Map<K, V> {
  private capacity: number;
  private keyList: K[];

  constructor(capacity: number) {
    super();
    this.capacity = capacity;
    this.keyList = [];
  }

  get(key: K) {
    if (!super.has(key)) return undefined;
    this.keyList = [...this.keyList.filter((k) => k !== key), key];
    return super.get(key);
  }

  set(key: K, val: V) {
    super.delete(key);
    super.set(key, val);

    this.keyList = [...this.keyList.filter((k) => k !== key), key];
    if (this.keyList.length > this.capacity) {
      super.delete(this.keyList[0]);
      this.keyList.shift();
    }

    return this;
  }
}

export default LRUCache;
