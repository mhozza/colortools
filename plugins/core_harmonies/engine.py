"""Core harmony matching and spoke directive calculation engine."""
from typing import Sequence
import numpy as np

from domain.models import ColorSample
from ports.plugin import HarmonyEvaluationResult, SpokeDirective
from services.color_math import circular_distance, signed_circular_delta
from core_harmonies.definitions import HARMONY_DEFINITIONS, HarmonyDefinition, get_target_color_name


class HarmonyEngine:
    """Evaluates sample points against photographic harmonies and computes adjustment directives."""

    @classmethod
    def evaluate_harmony(
        cls,
        harmony_def: HarmonyDefinition,
        samples: Sequence[ColorSample],
        key_hue_override: float | None = None,
    ) -> HarmonyEvaluationResult:
        """Evaluate a sequence of color samples against a specific harmony definition.

        If key_hue_override is provided, the primary spoke is fixed at that angle.
        Otherwise, an optimal key hue rotation is determined to maximize match percentage.
        """
        if not samples:
            canonical_spokes = [(offset % 360.0) for offset in harmony_def.spoke_offsets]
            return HarmonyEvaluationResult(
                harmony_name=harmony_def.name,
                match_score=0.0,
                spoke_angles=canonical_spokes,
                directives=[],
                metadata={"description": harmony_def.description, "sample_count": 0},
            )

        sample_hues = [s.hsl.h for s in samples]

        # Determine best base rotation angle for the harmony wheel
        if key_hue_override is not None:
            best_base_hue = (key_hue_override % 360.0 + 360.0) % 360.0
        else:
            best_base_hue = cls._find_optimal_base_hue(harmony_def, sample_hues)

        # Spoke angles for the optimal base hue
        spoke_angles = [
            round((best_base_hue + offset) % 360.0, 4)
            for offset in harmony_def.spoke_offsets
        ]

        # For each sample, assign closest spoke, calculate distance and directive
        directives: list[SpokeDirective] = []
        distances: list[float] = []

        # Maximum possible distance to a spoke depends on spoke spacing.
        # For Complementary (2 spokes at 180°), max distance to closest spoke is 90°.
        # For Triadic (3 spokes at 120°), max distance is 60°.
        # For Square (4 spokes at 90°), max distance is 45°.
        # General safe normalization factor for matching score:
        # A sample exactly on a spoke has distance 0.
        # We calculate the max possible closest distance under this geometry:
        max_possible_closest_dist = cls._max_closest_spoke_distance(spoke_angles)

        for sample in samples:
            h = sample.hsl.h
            # Find closest spoke
            closest_spoke = min(spoke_angles, key=lambda spoke: circular_distance(h, spoke))
            dist = circular_distance(h, closest_spoke)
            delta = signed_circular_delta(h, closest_spoke)
            target_name = get_target_color_name(closest_spoke)

            sign_str = f"+{delta:.1f}" if delta > 0 else f"{delta:.1f}"
            if abs(delta) < 0.05:
                instruction = f"Sample '{sample.name}' is aligned with {target_name} spoke"
            else:
                instruction = f"Shift sample '{sample.name}' {sign_str}° toward {target_name}"

            directives.append(
                SpokeDirective(
                    sample_id=sample.id,
                    sample_name=sample.name,
                    current_hue=round(h, 4),
                    target_hue=round(closest_spoke, 4),
                    delta_degrees=round(delta, 4),
                    target_color_name=target_name,
                    instruction=instruction,
                )
            )
            distances.append(dist)

        # Calculate percentage match score
        # Score = 100 * (1 - mean(dist / max_possible_closest_dist))
        # Clamped to [0.0, 100.0]
        if max_possible_closest_dist > 0.0:
            norm_distances = [min(d / max_possible_closest_dist, 1.0) for d in distances]
            avg_deviation = sum(norm_distances) / len(norm_distances)
            match_score = max(0.0, min(100.0, (1.0 - avg_deviation) * 100.0))
        else:
            match_score = 100.0

        return HarmonyEvaluationResult(
            harmony_name=harmony_def.name,
            match_score=round(match_score, 2),
            spoke_angles=spoke_angles,
            directives=directives,
            metadata={
                "description": harmony_def.description,
                "base_hue": best_base_hue,
                "average_distance_deg": round(float(np.mean(distances)), 2),
                "sample_count": len(samples),
            },
        )

    @classmethod
    def evaluate_all(
        cls,
        samples: Sequence[ColorSample],
        key_hue_override: float | None = None,
    ) -> list[HarmonyEvaluationResult]:
        """Evaluate samples against all standard harmony types, ranked by match_score descending."""
        results = [
            cls.evaluate_harmony(h_def, samples, key_hue_override)
            for h_def in HARMONY_DEFINITIONS.values()
        ]
        return sorted(results, key=lambda r: r.match_score, reverse=True)

    @classmethod
    def _find_optimal_base_hue(
        cls,
        harmony_def: HarmonyDefinition,
        sample_hues: list[float],
    ) -> float:
        """Find the rotation angle (base hue) in [0, 360) that minimizes the sum of squared distances to closest spokes."""
        # Candidate rotations: aligning each spoke to each sample hue gives an exact candidate alignment
        candidate_rotations: set[float] = set()
        for sample_hue in sample_hues:
            for offset in harmony_def.spoke_offsets:
                rot = (sample_hue - offset) % 360.0
                candidate_rotations.add(round(rot, 2))

        # Also add a fine 1-degree grid scan around best candidate or as baseline
        grid_rotations = np.linspace(0, 359, 360, endpoint=True)
        all_candidates = list(candidate_rotations) + list(grid_rotations)

        best_rot = 0.0
        min_total_error = float("inf")

        for rot in all_candidates:
            current_spokes = [(rot + offset) % 360.0 for offset in harmony_def.spoke_offsets]
            total_error = 0.0
            for hue in sample_hues:
                min_dist = min(circular_distance(hue, sp) for sp in current_spokes)
                total_error += min_dist * min_dist

            if total_error < min_total_error:
                min_total_error = total_error
                best_rot = rot

        # Fine-tune with local optimization (within ±2 degrees with 0.1 degree precision)
        best_refined_rot = best_rot
        for fine_delta in np.arange(-2.0, 2.1, 0.1):
            rot = (best_rot + fine_delta) % 360.0
            current_spokes = [(rot + offset) % 360.0 for offset in harmony_def.spoke_offsets]
            total_error = sum(min(circular_distance(h, sp) for sp in current_spokes) ** 2 for h in sample_hues)
            if total_error < min_total_error:
                min_total_error = total_error
                best_refined_rot = rot

        return round((best_refined_rot % 360.0 + 360.0) % 360.0, 4)

    @classmethod
    def _max_closest_spoke_distance(cls, spoke_angles: list[float]) -> float:
        """Calculate the maximum possible circular distance between any angle on [0, 360) and its closest spoke."""
        sorted_spokes = sorted(spoke_angles)
        num_spokes = len(sorted_spokes)
        if num_spokes <= 1:
            return 180.0

        max_gap = 0.0
        for i in range(num_spokes):
            next_idx = (i + 1) % num_spokes
            gap = (sorted_spokes[next_idx] - sorted_spokes[i]) % 360.0
            if gap > max_gap:
                max_gap = gap

        return max_gap / 2.0
