export class Queue {
  #head = null;
  #tail = null;
  #size = 0;

  get size() {
    return this.#size;
  }

  enqueue(value) {
    const node = {
      value: value,
      next: null
    };

    if (this.#tail !== null) {
      this.#tail.next = node;
    } else {
      this.#head = node;
    }

    this.#tail = node;
    this.#size++;
  }

  dequeue() {
    if (this.#head === null) {
      return undefined;
    }

    const value = this.#head.value;

    this.#head = this.#head.next;
    this.#size--;

    if (this.#head === null) {
      this.#tail = null;
    }

    return value;
  }

  peek() {
    if (this.#head === null) {
      return undefined;
    }

    return this.#head.value;
  }
}