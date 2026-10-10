"""Plugin port interfaces and data structures."""
from abc import ABC, abstractmethod
from typing import Any, Sequence
from pydantic import BaseModel, ConfigDict, Field

from domain.models import ColorSample


class SpokeDirective(BaseModel):
    """Directional adjustment directive for an individual color sample toward a harmony spoke."""
    model_config = ConfigDict(frozen=True)

    sample_id: str = Field(..., description="ID of the associated ColorSample")
    sample_name: str = Field(..., description="Label name of the ColorSample")
    current_hue: float = Field(..., ge=0.0, lt=360.0, description="Current sample hue in degrees [0, 360)")
    target_hue: float = Field(..., ge=0.0, lt=360.0, description="Target spoke hue in degrees [0, 360)")
    delta_degrees: float = Field(..., ge=-180.0, le=180.0, description="Signed delta degrees to shift (-180, 180]")
    target_color_name: str = Field(..., description="Photographic target color name (e.g. 'Orange', 'Teal')")
    instruction: str = Field(..., description="Human-readable directive, e.g. 'Shift sample Sky +12° toward Blue'")


class HarmonyEvaluationResult(BaseModel):
    """Evaluation result from a harmony analysis."""
    model_config = ConfigDict(frozen=True)

    harmony_name: str = Field(..., description="Name of the evaluated harmony (e.g., 'Complementary')")
    match_score: float = Field(..., ge=0.0, le=100.0, description="Percentage match score [0.0, 100.0]")
    spoke_angles: list[float] = Field(..., description="Canonical spoke angles in degrees [0, 360)")
    directives: list[SpokeDirective] = Field(default_factory=list, description="Per-sample adjustment directives")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional plugin-specific metadata")


class PluginPort(ABC):
    """Abstract base interface for harmony scoring, auto-clustering, and export plugins."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique plugin identifier name."""
        raise NotImplementedError

    @abstractmethod
    def initialize(self) -> None:
        """Lifecycle hook: initialize plugin resources."""
        raise NotImplementedError

    @abstractmethod
    def analyze(self, samples: Sequence[ColorSample]) -> dict[str, Any]:
        """Analyze sampled colors and return score/evaluation metrics."""
        raise NotImplementedError
