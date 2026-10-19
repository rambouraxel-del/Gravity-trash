import { ITEMS, sumItems, type Items, type ResourceId } from '../config/items';

/** Soute : places entières, une place par unité de matière. Rien n'est créé ni détruit hors de ces méthodes. */
export class Cargo {
  private items: Items = {};
  used = 0;
  constructor(public readonly capacity: number) {}

  get free(): number {
    return this.capacity - this.used;
  }
  get isFull(): boolean {
    return this.used >= this.capacity;
  }
  count(res: ResourceId): number {
    return this.items[res] ?? 0;
  }
  tryAdd(res: ResourceId, n = 1): boolean {
    if (!Number.isInteger(n) || n < 1 || this.used + n > this.capacity) return false;
    this.items[res] = (this.items[res] ?? 0) + n;
    this.used += n;
    return true;
  }
  contents(): Items {
    return { ...this.items };
  }
  /** Remplace le contenu (reste après un dépôt partiel). */
  set(contents: Items): void {
    this.items = {};
    for (const i of ITEMS) if ((contents[i] ?? 0) > 0) this.items[i] = contents[i];
    this.used = sumItems(this.items);
  }
  /** Vide la soute et renvoie ce qu'elle contenait. */
  unload(): Items {
    const c = this.contents();
    this.items = {};
    this.used = 0;
    return c;
  }
}
