import { Fragment, useState, type DragEvent, type KeyboardEvent } from "react";
import type { DraftMode, Team } from "../types";
import { dropGapToIndex } from "./useSetupState";

interface DraftOrderStepProps {
  stepNumber: number;
  teams: Team[];
  mode: DraftMode;
  userTeamIndex: number | null;
  onMoveTeam: (index: number, direction: -1 | 1) => void;
  onMoveTeamTo: (from: number, to: number) => void;
}

export default function DraftOrderStep({
  stepNumber,
  teams,
  mode,
  userTeamIndex,
  onMoveTeam,
  onMoveTeamTo,
}: DraftOrderStepProps) {
  // `draggingIndex` is the row being dragged; `dropGap` is the gap the row
  // would land in if dropped now (0..teams.length, gap i = "before row i").
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const announceMove = (name: string, to: number) => {
    setAnnouncement(`${name} moved to position ${to + 1} of ${teams.length}`);
  };

  const handleDragStart = (e: DragEvent<HTMLLIElement>, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Firefox requires drag data to be set for the drag to start at all.
    e.dataTransfer.setData("text/plain", teams[index].name);
  };

  const handleDragOver = (e: DragEvent<HTMLLIElement>, index: number) => {
    if (draggingIndex === null) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const isTopHalf = e.clientY - rect.top < rect.height / 2;
    setDropGap(isTopHalf ? index : index + 1);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (draggingIndex === null || dropGap === null) return;
    const to = dropGapToIndex(dropGap, draggingIndex);
    if (to !== draggingIndex) {
      const name = teams[draggingIndex].name;
      onMoveTeamTo(draggingIndex, to);
      announceMove(name, to);
    }
    setDraggingIndex(null);
    setDropGap(null);
  };

  // Rows cover the whole list visually, but the <ol> itself is only as
  // tall as its content — this catches a drop released in any blank space
  // below the last row (rather than on the last row's bottom half) and
  // treats it the same as dropping after the last row.
  const handleContainerDragOver = (e: DragEvent<HTMLOListElement>) => {
    if (draggingIndex === null || e.target !== e.currentTarget) return;
    e.preventDefault();
    setDropGap(teams.length);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDropGap(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const direction = e.key === "ArrowUp" ? -1 : 1;
    const target = index + direction;
    if (target < 0 || target >= teams.length) return;
    e.preventDefault();
    onMoveTeam(index, direction);
    announceMove(teams[index].name, target);
  };

  return (
    <section className="setup-section">
      <h2>{stepNumber} · Draft Order</h2>
      <p className="muted">Teams pick in this order every round (non-snake).</p>
      <p className="muted">
        Drag a team to reorder, or focus one and press ↑/↓.
      </p>
      <ol
        className="draft-order-list"
        onDragOver={handleContainerDragOver}
        onDrop={handleDrop}
      >
        {teams.map((team, i) => (
          <Fragment key={team.name}>
            {dropGap === i && (
              <li className="draft-order-drop-indicator" aria-hidden="true" />
            )}
            <li
              className={
                "draft-order-item" + (draggingIndex === i ? " dragging" : "")
              }
              draggable
              tabIndex={0}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              <span className="pick-num">#{i + 1}</span>
              <span className="team-name-label">
                {team.name}
                {mode === "practice" && i === userTeamIndex && (
                  <span className="you-badge"> (you)</span>
                )}
              </span>
            </li>
          </Fragment>
        ))}
        {dropGap === teams.length && (
          <li className="draft-order-drop-indicator" aria-hidden="true" />
        )}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
