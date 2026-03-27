from __future__ import annotations

from dataclasses import dataclass

from .brick_model import BuilderConfig, run_simulation


@dataclass(frozen=True)
class MatchupResult:
    seed: int
    builder_ids: tuple[str, ...]
    winner_id: str
    score_gap: float
    scores: dict[str, float]

    def to_dict(self) -> dict[str, object]:
        return {
            "seed": self.seed,
            "builderIds": list(self.builder_ids),
            "winnerId": self.winner_id,
            "scoreGap": round(self.score_gap, 3),
            "scores": {
                builder_id: round(score, 3)
                for builder_id, score in self.scores.items()
            },
        }


def run_matchup_series(
    builder_configs: list[BuilderConfig | dict[str, object]],
    seeds: list[int],
    total_steps: int = 120,
    cube_cage: int = 160,
) -> list[MatchupResult]:
    # Stop 04 baseline harness: evaluate across many seeds so
    # tuning decisions are based on trends, not one random run.
    payload_builders = [
        builder.to_dict() if isinstance(builder, BuilderConfig) else dict(builder)
        for builder in builder_configs
    ]

    results: list[MatchupResult] = []
    for seed in seeds:
        simulation = run_simulation(
            total_steps=total_steps,
            cube_cage=cube_cage,
            scad_output_path=None,
            json_output_path=None,
            seed=seed,
            builders=payload_builders,
            verbose=False,
        )
        score_map = {
            state["id"]: float(state.get("score", state.get("placementCount", 0)))
            for state in simulation["builderStates"]
        }
        winner_id, winner_score = max(score_map.items(), key=lambda item: item[1])
        runner_up_score = (
            sorted(score_map.values(), reverse=True)[1] if len(score_map) > 1 else 0.0
        )
        results.append(
            MatchupResult(
                seed=seed,
                builder_ids=tuple(score_map),
                winner_id=winner_id,
                score_gap=winner_score - runner_up_score,
                scores=score_map,
            )
        )
    return results


def summarize_matchup_series(results: list[MatchupResult]) -> dict[str, object]:
    if not results:
        return {
            "matchCount": 0,
            "winRates": {},
            "averageScoreGap": 0.0,
            "results": [],
        }

    win_counts: dict[str, int] = {}
    total_gap = 0.0
    for result in results:
        win_counts[result.winner_id] = win_counts.get(result.winner_id, 0) + 1
        total_gap += result.score_gap

    match_count = len(results)
    return {
        "matchCount": match_count,
        "averageScoreGap": round(total_gap / match_count, 3),
        "winRates": {
            builder_id: round(wins / match_count, 3)
            for builder_id, wins in sorted(win_counts.items())
        },
        "results": [result.to_dict() for result in results],
    }
