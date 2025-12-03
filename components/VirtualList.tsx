import React, { useRef, useState, useMemo } from 'react';

interface VirtualizedListProps<T> {
  items: T[];
  rowHeight: number;
  height: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export function VirtualizedList<T extends { _virtualId?: string | number }>({ 
  items, 
  rowHeight, 
  height, 
  renderRow,
  className = ""
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight) + 5; // buffer
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const endIndex = Math.min(items.length - 1, startIndex + visibleCount);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      item,
      originalIndex: startIndex + index,
    }));
  }, [items, startIndex, endIndex]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{ height, overflowY: "auto", overflowX: "hidden" }}
      className={`w-full relative custom-scrollbar ${className}`}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ 
          position: "absolute", 
          top: startIndex * rowHeight, 
          left: 0, 
          right: 0 
        }}>
          {visibleItems.map(({ item, originalIndex }) => (
            <div key={originalIndex} style={{ height: rowHeight }}>
              {renderRow(item, originalIndex)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}