from dataclasses import dataclass
from typing import Optional


@dataclass
class BrickAgent:
    unique_id: int
    brick_unit: int
    brick_x: int
    brick_y: int
    brick_z: int
    color: str
    builder_id: Optional[str] = None
    shape_id: Optional[str] = None
    placement_id: Optional[str] = None
    tick: Optional[int] = None
    supported: Optional[bool] = None
    strategy: Optional[str] = None
    score: Optional[float] = None

    def to_dict(self):
        return {
            "id": self.unique_id,
            "position": [self.brick_x, self.brick_y, self.brick_z],
            "size": [self.brick_unit, self.brick_unit, self.brick_unit],
            "color": self.color,
            "builderId": self.builder_id,
            "shapeId": self.shape_id,
            "placementId": self.placement_id,
            "tick": self.tick,
            "supported": self.supported,
            "strategy": self.strategy,
            "score": self.score,
        }
