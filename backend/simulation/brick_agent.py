import mesa


class BrickAgent(mesa.Agent):
    def __init__(
        self,
        unique_id,
        brick_unit,
        brick_x,
        brick_y,
        brick_z,
        color,
        model,
    ):
        super().__init__(unique_id, model)
        self.brick_unit = brick_unit
        self.brick_x = brick_x
        self.brick_y = brick_y
        self.brick_z = brick_z
        self.color = color

    def to_dict(self):
        return {
            "id": self.unique_id,
            "position": [self.brick_x, self.brick_y, self.brick_z],
            "size": [self.brick_unit, self.brick_unit, self.brick_unit],
            "color": self.color,
        }

    def step(self):
        if getattr(self.model, "verbose", False):
            print(
                "Brick Agent Created: "
                f"brick x:{self.brick_x} brick y:{self.brick_y} brick z:{self.brick_z}"
            )
