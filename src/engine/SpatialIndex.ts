import { AtlasLayout } from './computeLayout';

export interface BoxBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SpatialEntry extends BoxBounds {
  rank: number;
}

export function intersects(a: BoxBounds, b: BoxBounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export class SpatialIndex {
  entries: SpatialEntry[];
  maxHeight: number = 0;
  bounds: BoxBounds = {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  };

  constructor(layout: AtlasLayout) {
    this.entries = layout.items
      .map((item, idx) => {
        const bounds: BoxBounds = {
          left: item.x - item.w / 2,
          right: item.x + item.w / 2,
          top: item.y - item.h / 2,
          bottom: item.y + item.h / 2,
        };

        this.maxHeight = Math.max(this.maxHeight, item.h);
        this.bounds.left = Math.min(this.bounds.left, bounds.left);
        this.bounds.right = Math.max(this.bounds.right, bounds.right);
        this.bounds.top = Math.min(this.bounds.top, bounds.top);
        this.bounds.bottom = Math.max(this.bounds.bottom, bounds.bottom);

        return { ...bounds, rank: idx };
      })
      .sort((a, b) => a.top - b.top);
  }

  query(bounds: BoxBounds): number[] {
    if (!this.entries.length || !intersects(bounds, this.bounds)) {
      return [];
    }

    const minY = bounds.top - this.maxHeight;
    let low = 0;
    let high = this.entries.length;

    // Binary search for lowest candidate entry
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.entries[mid].top < minY) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const results: number[] = [];
    for (let i = low; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.top > bounds.bottom) break;
      if (intersects(entry, bounds)) {
        results.push(entry.rank);
      }
    }

    return results.sort((a, b) => a - b);
  }
}

