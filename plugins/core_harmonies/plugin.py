"""Core harmonies plugin conforming to PluginPort."""
from typing import Any, Sequence

from domain.models import ColorSample
from ports.plugin import HarmonyEvaluationResult, PluginPort
from core_harmonies.definitions import HARMONY_DEFINITIONS
from core_harmonies.engine import HarmonyEngine


class CoreHarmoniesPlugin(PluginPort):
    """Evaluates color samples against standard photographic color harmonies."""

    def __init__(self, key_hue_override: float | None = None) -> None:
        self._initialized = False
        self._key_hue_override = key_hue_override

    @property
    def name(self) -> str:
        return "core_harmonies"

    def initialize(self) -> None:
        """Lifecycle hook: initialize harmony definitions."""
        self._initialized = True

    def analyze(self, samples: Sequence[ColorSample]) -> dict[str, Any]:
        """Analyze sampled colors and return ranked harmony evaluations and spoke directives."""
        if not self._initialized:
            self.initialize()

        ranked_evaluations: list[HarmonyEvaluationResult] = HarmonyEngine.evaluate_all(
            samples=samples,
            key_hue_override=self._key_hue_override,
        )

        return {
            "plugin": self.name,
            "sample_count": len(samples),
            "harmonies": [eval_res.model_dump() for eval_res in ranked_evaluations],
            "top_harmony": ranked_evaluations[0].model_dump() if ranked_evaluations else None,
        }
