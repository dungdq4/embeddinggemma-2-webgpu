import { MediaItem } from '../types';

export interface LayoutItem {
  id: string;
  item: MediaItem;
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
}

export interface AtlasLayout {
  items: LayoutItem[];
  width: number;
  height: number;
  gap: number;
  rows: number;
  columns: number;
}

export function computeLayout(items: MediaItem[], targetCols?: number): AtlasLayout {
  const n = items.length;
  const gap = 29.52;
  const aspects = items.map((it) => {
    const a = it.aspectRatio;
    return typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : 4 / 3;
  });

  const adjustedAspects = aspects.map((a) => a + gap / 492);
  const totalAspect = adjustedAspects.reduce((sum, a) => sum + a, 0);
  const avgAspect = n ? totalAspect / n : 4 / 3;
  const autoCols = Math.ceil(Math.sqrt((n * 1.06) / avgAspect));
  const columns = Math.max(1, Math.min(n || 1, Math.floor(targetCols ?? autoCols) || 1));
  const rows = Math.max(1, Math.ceil(n / columns));

  if (!n) {
    return { items: [], width: 685.52, height: 521.52, gap, rows, columns };
  }

  let totalWidth = (492 * totalAspect) / rows;
  const rowSlices: { start: number; end: number; h: number }[] = [];
  let startIndex = 0;
  let remainingAspect = totalAspect;

  for (let r = 0; r < rows; r++) {
    const rowsLeft = rows - r;
    let endIndex = n;

    if (rowsLeft > 1) {
      const targetAspect = remainingAspect / rowsLeft;
      const maxEnd = n - rowsLeft + 1;
      endIndex = startIndex + 1;
      let curAspect = adjustedAspects[startIndex];

      while (
        endIndex < maxEnd &&
        Math.abs(curAspect + adjustedAspects[endIndex] - targetAspect) <
          Math.abs(curAspect - targetAspect)
      ) {
        curAspect += adjustedAspects[endIndex++];
      }
    }

    const rowAspectSum = aspects.slice(startIndex, endIndex).reduce((s, a) => s + a, 0);
    const rowH = (totalWidth - gap * (endIndex - startIndex)) / rowAspectSum;
    rowSlices.push({ start: startIndex, end: endIndex, h: rowH });

    for (let i = startIndex; i < endIndex; i++) {
      remainingAspect -= adjustedAspects[i];
    }
    startIndex = endIndex;
  }

  if (rowSlices.some((r) => r.h <= 0)) {
    totalWidth = Math.max(
      totalWidth,
      gap * Math.max(...rowSlices.map((r) => r.end - r.start)) + 492 * Math.min(...aspects)
    );
    for (const r of rowSlices) {
      r.h =
        (totalWidth - gap * (r.end - r.start)) /
        aspects.slice(r.start, r.end).reduce((s, a) => s + a, 0);
    }
  }

  const totalHeight = rowSlices.reduce((sum, r) => sum + r.h + gap, 0);
  const layoutItems: LayoutItem[] = [];
  let curY = -totalHeight / 2 + gap / 2;

  for (let r = 0; r < rowSlices.length; r++) {
    const slice = rowSlices[r];
    let curX = -totalWidth / 2 + gap / 2;
    const staggeredOffset = r % 2 ? totalWidth / (slice.end - slice.start) / 2 : 0;

    for (let i = slice.start; i < slice.end; i++) {
      const itemW = slice.h * aspects[i];
      const wrappedX =
        (((curX + itemW / 2 + staggeredOffset + totalWidth / 2) % totalWidth) + totalWidth) %
          totalWidth -
        totalWidth / 2;

      layoutItems.push({
        id: items[i].id,
        item: items[i],
        x: wrappedX,
        y: curY + slice.h / 2,
        w: itemW,
        h: slice.h,
        row: r,
      });

      curX += itemW + gap;
    }

    curY += slice.h + gap;
  }

  return {
    items: layoutItems,
    width: totalWidth,
    height: totalHeight,
    gap,
    rows,
    columns,
  };
}

