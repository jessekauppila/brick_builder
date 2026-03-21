import mesa


class BrickAgent(mesa.Agent):
    def __init__(
        self,
        unique_id,
        brickUnit,
        brickX,
        brickY,
        brickZ,
        color,
        model,
    ):
        super().__init__(unique_id, model)
        self.brickUnit = brickUnit
        self.brickX = brickX
        self.brickY = brickY
        self.brickZ = brickZ
        self.color = color

    def to_dict(self):
        return {
            "id": self.unique_id,
            "position": [self.brickX, self.brickY, self.brickZ],
            "size": [self.brickUnit, self.brickUnit, self.brickUnit],
            "color": self.color,
        }

    def step(self):
        if getattr(self.model, "verbose", False):
            print(
                "Brick Agent Created: "
                f"brick x:{self.brickX} brick y:{self.brickY} brick z:{self.brickZ}"
            )

