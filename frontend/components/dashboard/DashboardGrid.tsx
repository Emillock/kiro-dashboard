"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DashboardBlock } from "./DashboardBlock";
import type { BlockState } from "@/lib/layout";

interface DashboardGridProps {
  blocks: BlockState[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleLock: (id: string) => void;
  renderBlock: (id: string) => React.ReactNode;
  blockTitles?: Record<string, string>;
}

export function DashboardGrid({
  blocks,
  onReorder,
  onToggleLock,
  renderBlock,
  blockTitles = {},
}: DashboardGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = sorted.findIndex((b) => b.id === active.id);
    const toIndex = sorted.findIndex((b) => b.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorder(fromIndex, toIndex);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sorted.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sorted.map((block) => (
            <DashboardBlock
              key={block.id}
              id={block.id}
              locked={block.locked}
              onToggleLock={() => onToggleLock(block.id)}
              title={blockTitles[block.id]}
            >
              {renderBlock(block.id)}
            </DashboardBlock>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
