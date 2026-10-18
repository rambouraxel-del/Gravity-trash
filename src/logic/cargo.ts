/** Soute : places entières. Aucune place n'est créée ni détruite hors des méthodes ci-dessous. */
export class Cargo {
  used = 0;
  constructor(public readonly capacity: number) {}

  get free(): number {
    return this.capacity - this.used;
  }
  get isFull(): boolean {
    return this.used >= this.capacity;
  }
  /** Ajoute `n` places ; refuse (false) sans rien modifier si cela dépasse la capacité. */
  tryAdd(n = 1): boolean {
    if (!Number.isInteger(n) || n < 1 || this.used + n > this.capacity) return false;
    this.used += n;
    return true;
  }
  /** Vide la soute et renvoie le nombre de places qu'elle contenait. */
  unload(): number {
    const n = this.used;
    this.used = 0;
    return n;
  }
}
