import { describe, it, expect, vi } from "vitest";
import {
  computeExpectedAdp,
  computeFranchiseTarget,
  computeSaveTarget,
  computeSaveTargetWithMistake,
  conflictsWithFranchisePosition,
  saveIneligibleReason,
  shouldPullback,
} from "../aiSimulator";
import type { Player } from "../../types";

// ── Fixtures ───────────────────────────────────────────────────────────────

function makePlayer(name: string, adp: number, position = "RB"): Player {
  return {
    id: `${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    position,
    nflTeam: "KC",
    adp,
  };
}

/** Runs `fn` with Math.random pinned above the mistake-noise threshold, so
 *  the algorithm's optimal choice is returned deterministically. */
function withoutMistakes<T>(fn: () => T): T {
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  try {
    return fn();
  } finally {
    randomSpy.mockRestore();
  }
}

// ── computeFranchiseTarget ──────────────────────────────────────────────────

describe("computeFranchiseTarget", () => {
  it("franchises the single eligible player, with no swap logic invoked", () => {
    const p = makePlayer("Only Guy", 5);
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [p],
        franchiseEligibleIds: new Set([p.id]),
        saveHistory: new Set(),
      }),
    );
    expect(target!.id).toBe(p.id);
  });

  it("franchises the best-ADP eligible player when several are eligible", () => {
    const best = makePlayer("Best", 2);
    const mid = makePlayer("Mid", 5);
    const worst = makePlayer("Worst", 9);
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [worst, best, mid],
        franchiseEligibleIds: new Set([best.id, mid.id, worst.id]),
        saveHistory: new Set(),
      }),
    );
    expect(target!.id).toBe(best.id);
  });

  it("returns null when there are no eligible players", () => {
    const p = makePlayer("Not Eligible", 1);
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [p],
        franchiseEligibleIds: new Set(),
        saveHistory: new Set(),
      }),
    );
    expect(target).toBeNull();
  });

  it("reaches past the top two eligible candidates when a lower-ranked one pairs with a better save target", () => {
    // A (rank 1) and B (rank 2) both share RB with the roster's best cheap
    // save target, D, so it's excluded from both their pairs — leaving them
    // to pair with the only other eligible candidate, C (TE, rank 3). C
    // itself doesn't conflict with D, so C's pair (C + D) beats both A's and
    // B's, even though C is the worst-ADP eligible candidate.
    const a = makePlayer("A", 1, "RB");
    const b = makePlayer("B", 5, "RB");
    const c = makePlayer("C", 10, "TE");
    const d = makePlayer("D", 0.5, "RB"); // not franchise-eligible
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [a, b, c, d],
        franchiseEligibleIds: new Set([a.id, b.id, c.id]),
        saveHistory: new Set(),
      }),
    );
    expect(target!.id).toBe(c.id);
  });

  it("franchises the better-ADP candidate when the top two share a position, leaving neither a legal save target", () => {
    // X and Y are the only two roster players and share a position, so each
    // excludes the other from its save-candidate search — both pairs
    // contribute zero save-side value, not an error or an exclusion. The
    // tie resolves on ADP alone.
    const x = makePlayer("X", 1, "RB");
    const y = makePlayer("Y", 2, "RB");
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [x, y],
        franchiseEligibleIds: new Set([x.id, y.id]),
        saveHistory: new Set(),
      }),
    );
    expect(target!.id).toBe(x.id);
  });

  it("breaks a tie between equally-scored pairs toward the lower-ADP franchise candidate", () => {
    const a = makePlayer("A", 1, "RB");
    const b = makePlayer("B", 3, "WR");
    // Both pairs (a+b and b+a) sum to the same combined ADP.
    const target = withoutMistakes(() =>
      computeFranchiseTarget({
        previousYearRoster: [a, b],
        franchiseEligibleIds: new Set([a.id, b.id]),
        saveHistory: new Set(),
      }),
    );
    expect(target!.id).toBe(a.id);
  });

  it("applies mistake noise by franchising the second-best pair's candidate", () => {
    const best = makePlayer("Best", 1);
    const nextBest = makePlayer("Next Best", 2);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const target = computeFranchiseTarget({
        previousYearRoster: [best, nextBest],
        franchiseEligibleIds: new Set([best.id, nextBest.id]),
        saveHistory: new Set(),
      });
      expect(target!.id).toBe(nextBest.id);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("falls back to the best pair on a mistake draw when there's no second eligible candidate", () => {
    const only = makePlayer("Only Guy", 5);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const target = computeFranchiseTarget({
        previousYearRoster: [only],
        franchiseEligibleIds: new Set([only.id]),
        saveHistory: new Set(),
      });
      expect(target!.id).toBe(only.id);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

// ── computeSaveTarget ────────────────────────────────────────────────────────

describe("computeSaveTarget", () => {
  it("picks the best-ADP remaining player, excluding the franchise target", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const best = makePlayer("Best Remaining", 2);
    const worse = makePlayer("Worse Remaining", 5);
    const target = computeSaveTarget(
      { previousYearRoster: [franchise, worse, best], saveHistory: new Set() },
      franchise,
    );
    expect(target!.id).toBe(best.id);
  });

  it("skips players already in save history", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const blocked = makePlayer("Blocked", 2);
    const nextBest = makePlayer("Next Best", 3);
    const target = computeSaveTarget(
      {
        previousYearRoster: [franchise, blocked, nextBest],
        saveHistory: new Set([blocked.id]),
      },
      franchise,
    );
    expect(target!.id).toBe(nextBest.id);
  });

  it("falls through to a non-eligible player when it outranks the eligible pool", () => {
    // computeSaveTarget is roster-wide — eligibility is irrelevant to it.
    const franchise = makePlayer("Franchise", 1, "QB");
    const nonEligibleButBest = makePlayer("Non-Eligible Best", 2);
    const eligibleWorse = makePlayer("Eligible Worse", 4);
    const target = computeSaveTarget(
      {
        previousYearRoster: [franchise, eligibleWorse, nonEligibleButBest],
        saveHistory: new Set(),
      },
      franchise,
    );
    expect(target!.id).toBe(nonEligibleButBest.id);
  });

  it("returns null when no roster is left after excluding franchise target and save history", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const blocked = makePlayer("Blocked", 2);
    const target = computeSaveTarget(
      {
        previousYearRoster: [franchise, blocked],
        saveHistory: new Set([blocked.id]),
      },
      franchise,
    );
    expect(target).toBeNull();
  });

  it("returns the best not-previously-saved roster player when there is no franchise target", () => {
    const p1 = makePlayer("P1", 3);
    const p2 = makePlayer("P2", 1);
    const target = computeSaveTarget(
      { previousYearRoster: [p1, p2], saveHistory: new Set() },
      null,
    );
    expect(target!.id).toBe(p2.id);
  });

  it("recomputes dynamically when the previous target is no longer valid (e.g. now saved)", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const prevTarget = makePlayer("Previously Best", 2);
    const nextTarget = makePlayer("Now Best", 3);

    const before = computeSaveTarget(
      {
        previousYearRoster: [franchise, prevTarget, nextTarget],
        saveHistory: new Set(),
      },
      franchise,
    );
    expect(before!.id).toBe(prevTarget.id);

    // prevTarget has since been saved — recomputing (fresh call) should
    // move on to the next-best candidate.
    const after = computeSaveTarget(
      {
        previousYearRoster: [franchise, prevTarget, nextTarget],
        saveHistory: new Set([prevTarget.id]),
      },
      franchise,
    );
    expect(after!.id).toBe(nextTarget.id);
  });

  it("excludes a candidate that shares a position with the franchise target, even when it's the best ADP", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const sharesPosition = makePlayer("Same Position", 2, "QB");
    const legal = makePlayer("Legal", 3, "RB");
    const target = computeSaveTarget(
      {
        previousYearRoster: [franchise, sharesPosition, legal],
        saveHistory: new Set(),
      },
      franchise,
    );
    expect(target!.id).toBe(legal.id);
  });

  it("returns null when the only remaining candidates share the franchise target's position", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const sharesPosition = makePlayer("Same Position", 2, "QB");
    const target = computeSaveTarget(
      {
        previousYearRoster: [franchise, sharesPosition],
        saveHistory: new Set(),
      },
      franchise,
    );
    expect(target).toBeNull();
  });
});

// ── conflictsWithFranchisePosition ──────────────────────────────────────────

describe("conflictsWithFranchisePosition", () => {
  it("is false when the team has no franchise player", () => {
    const candidate = makePlayer("Candidate", 1, "QB");
    expect(
      conflictsWithFranchisePosition({ franchisePlayer: null }, candidate),
    ).toBe(false);
  });

  it("is true when the candidate shares the franchise player's position", () => {
    const franchisePlayer = makePlayer("Franchise", 1, "QB");
    const candidate = makePlayer("Candidate", 2, "QB");
    expect(conflictsWithFranchisePosition({ franchisePlayer }, candidate)).toBe(
      true,
    );
  });

  it("is false when the candidate's position differs from the franchise player's", () => {
    const franchisePlayer = makePlayer("Franchise", 1, "QB");
    const candidate = makePlayer("Candidate", 2, "RB");
    expect(conflictsWithFranchisePosition({ franchisePlayer }, candidate)).toBe(
      false,
    );
  });
});

// ── saveIneligibleReason ─────────────────────────────────────────────────────
// Regression coverage for the bug where a pullback-only prompt (i.e. a save
// blocked for a reason other than the franchise-position rule) gave no
// on-screen explanation, reading as "my save disappeared" after a decline
// rather than "this player specifically isn't saveable."

describe("saveIneligibleReason", () => {
  const baseTeam = {
    saveHistory: new Set<string>(),
    saveUsedThisDraft: false,
    franchisePlayer: null as Player | null,
  };

  it("is null when the candidate is in fact saveable", () => {
    const candidate = makePlayer("Candidate", 1, "RB");
    expect(saveIneligibleReason(baseTeam, candidate)).toBeNull();
  });

  it("is 'already-used' when the team has used its one save this draft", () => {
    const candidate = makePlayer("Candidate", 1, "RB");
    expect(
      saveIneligibleReason({ ...baseTeam, saveUsedThisDraft: true }, candidate),
    ).toBe("already-used");
  });

  it("is 'previously-saved' when the player is in the team's saveHistory", () => {
    const candidate = makePlayer("Candidate", 1, "RB");
    expect(
      saveIneligibleReason(
        { ...baseTeam, saveHistory: new Set([candidate.id]) },
        candidate,
      ),
    ).toBe("previously-saved");
  });

  it("is 'franchise-position' when the candidate shares the franchise player's position", () => {
    const franchisePlayer = makePlayer("Franchise", 1, "QB");
    const candidate = makePlayer("Candidate", 2, "QB");
    expect(
      saveIneligibleReason({ ...baseTeam, franchisePlayer }, candidate),
    ).toBe("franchise-position");
  });

  it("checks reasons in the same precedence as buildReactionQueue's isSaveable", () => {
    // isSaveable checks `!saveHistory.has(...) && !saveUsedThisDraft && ...`,
    // in that order — so previously-saved wins over already-used, which wins
    // over franchise-position.
    const franchisePlayer = makePlayer("Franchise", 1, "QB");
    const candidate = makePlayer("Candidate", 2, "QB");
    expect(
      saveIneligibleReason(
        {
          saveHistory: new Set([candidate.id]),
          saveUsedThisDraft: true,
          franchisePlayer,
        },
        candidate,
      ),
    ).toBe("previously-saved");
    expect(
      saveIneligibleReason(
        {
          saveHistory: new Set(),
          saveUsedThisDraft: true,
          franchisePlayer,
        },
        candidate,
      ),
    ).toBe("already-used");
  });
});

// ── computeSaveTargetWithMistake ────────────────────────────────────────────

describe("computeSaveTargetWithMistake", () => {
  it("matches computeSaveTarget on an undisturbed decision", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const best = makePlayer("Best Remaining", 2);
    const worse = makePlayer("Worse Remaining", 5);
    const target = withoutMistakes(() =>
      computeSaveTargetWithMistake(
        {
          previousYearRoster: [franchise, worse, best],
          saveHistory: new Set(),
        },
        franchise,
      ),
    );
    expect(target!.id).toBe(best.id);
  });

  it("substitutes the next-best saveable candidate on a mistake draw", () => {
    const best = makePlayer("Best", 1);
    const nextBest = makePlayer("Next Best", 2);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const target = computeSaveTargetWithMistake(
        { previousYearRoster: [best, nextBest], saveHistory: new Set() },
        null,
      );
      expect(target!.id).toBe(nextBest.id);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("falls back to the sole candidate on a mistake draw when no next-best exists", () => {
    const only = makePlayer("Only", 1);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const target = computeSaveTargetWithMistake(
        { previousYearRoster: [only], saveHistory: new Set() },
        null,
      );
      expect(target!.id).toBe(only.id);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("returns null when there is no candidate at all, mistake or not", () => {
    const franchise = makePlayer("Franchise", 1, "QB");
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const target = computeSaveTargetWithMistake(
        { previousYearRoster: [franchise], saveHistory: new Set() },
        franchise,
      );
      expect(target).toBeNull();
    } finally {
      randomSpy.mockRestore();
    }
  });
});

// ── computeExpectedAdp ───────────────────────────────────────────────────────

describe("computeExpectedAdp", () => {
  it("computes (round - 1) * teamCount + teamPositionInOrder", () => {
    expect(computeExpectedAdp(1, 1, 12)).toBe(1);
    expect(computeExpectedAdp(1, 12, 12)).toBe(12);
    expect(computeExpectedAdp(2, 1, 12)).toBe(13);
    expect(computeExpectedAdp(15, 7, 12)).toBe((15 - 1) * 12 + 7);
  });
});

// ── shouldPullback ───────────────────────────────────────────────────────────

describe("shouldPullback", () => {
  it("accepts when candidate ADP beats (is lower than) the expected round ADP", () => {
    const result = withoutMistakes(() => shouldPullback(10, 20));
    expect(result).toBe(true);
  });

  it("declines when candidate ADP does not beat the expected round ADP", () => {
    const result = withoutMistakes(() => shouldPullback(30, 20));
    expect(result).toBe(false);
  });

  it('declines at the exact boundary (equal ADP is not "better")', () => {
    const result = withoutMistakes(() => shouldPullback(20, 20));
    expect(result).toBe(false);
  });

  it("mistake noise flips an otherwise-accepted decision to decline", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(shouldPullback(10, 20)).toBe(false);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("mistake noise flips an otherwise-declined decision to accept", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(shouldPullback(30, 20)).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
