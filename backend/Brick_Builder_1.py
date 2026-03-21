from __future__ import annotations

import random
from pathlib import Path

import mesa
import openpyscad as ops

try:
    from .BrickAgent import BrickAgent
except ImportError:
    from BrickAgent import BrickAgent

DEFAULT_TOTAL_STEPS = 200
DEFAULT_SCAD_PATH = Path(__file__).with_name("sample.scad")


class BrickModel(mesa.Model):
    def __init__(
        self,
        totalSteps,
        brickUnit=10,
        cube_cage=200,
        verbose=False,
    ):
        super().__init__()
        self.schedule = mesa.time.StagedActivation(self)
        self.brickUnit = brickUnit
        self.brickX = 0
        self.brickY = 0
        self.brickZ = 0
        self.new_brickX = None
        self.new_brickY = None
        self.new_brickZ = None
        self.step_counter = 0
        self.totalSteps = totalSteps
        self.cube_cage = cube_cage
        self.verbose = verbose

    def log(self, message):
        if self.verbose:
            print(message)

    def run(self):
        self.designBrick()

        while self.step_counter + 1 < self.totalSteps:
            self.step_counter += 1
            self.log(f"Step Counter: {self.step_counter}")
            self.createNewBrickLocation(sideways=True)
            self.designBrick()

            if self.step_counter + 1 >= self.totalSteps:
                break

            self.step_counter += 1
            self.log(f"Step Counter: {self.step_counter}")
            self.createNewBrickLocation(sideways=False)
            self.designBrick()

        return self

    def designBrick(self, color="Red"):
        brick = BrickAgent(
            self.step_counter,
            self.brickUnit,
            self.brickX,
            self.brickY,
            self.brickZ,
            color,
            self,
        )
        self.schedule.add(brick)
        return brick

    def createNewBrickLocation(self, sideways=False):
        if sideways:
            self.new_brickX, self.new_brickY, self.new_brickZ = self.sideways(
                verbose=self.verbose
            )
        else:
            self.new_brickX, self.new_brickY, self.new_brickZ = self.up_or_down(
                verbose=self.verbose
            )

        max_attempts = 5000
        attempts = 0
        while not self.not_touching_and_within_cube():
            attempts += 1
            if attempts >= max_attempts:
                self.log(
                    "Placement stuck (neighbors occupied or bounds); "
                    "picking random free cell."
                )
                self._pick_random_free_cell()
                break
            if sideways:
                self.new_brickX, self.new_brickY, self.new_brickZ = self.sideways(
                    verbose=False
                )
            else:
                self.new_brickX, self.new_brickY, self.new_brickZ = self.up_or_down(
                    verbose=False
                )

        self.brickX, self.brickY, self.brickZ = (
            self.new_brickX,
            self.new_brickY,
            self.new_brickZ,
        )
        self.log(
            f"New Origin Brick: BrickX: {self.brickX}, "
            f"BrickY: {self.brickY}, BrickZ: {self.brickZ}"
        )

    def not_touching_and_within_cube(self):
        nx, ny, nz = self.new_brickX, self.new_brickY, self.new_brickZ
        if nx > self.cube_cage or ny > self.cube_cage or nz > self.cube_cage:
            return False
        if nx < -self.cube_cage or ny < -self.cube_cage or nz < -self.cube_cage:
            return False
        for agent in self.schedule.agents:
            if agent.brickX == nx and agent.brickY == ny and agent.brickZ == nz:
                return False
        return True

    def _pick_random_free_cell(self):
        half = self.cube_cage // self.brickUnit
        for _ in range(5000):
            x = random.randint(-half, half) * self.brickUnit
            y = random.randint(-half, half) * self.brickUnit
            z = random.randint(-half, half) * self.brickUnit
            self.new_brickX, self.new_brickY, self.new_brickZ = x, y, z
            if self.not_touching_and_within_cube():
                return
        raise RuntimeError(
            "Could not find a free grid cell inside cube_cage; "
            "raise cage or reduce steps."
        )

    def up_or_down(self, verbose=True):
        for agent in self.schedule.agents:
            if agent.unique_id == self.step_counter - 1:
                self.new_brickX, self.new_brickY, self.new_brickZ = (
                    agent.brickX,
                    agent.brickY,
                    agent.brickZ,
                )

                if verbose:
                    print(
                        "Previous Brick Origin: "
                        f"BrickX: {agent.brickX}, BrickY: {agent.brickY}, "
                        f"BrickZ: {agent.brickZ}"
                    )

                randomNumber = random.randint(1, 2)
                if verbose:
                    print(f"Random Number: {randomNumber}")
                if randomNumber == 1:
                    self.new_brickZ += self.brickUnit
                elif randomNumber == 2:
                    self.new_brickZ -= self.brickUnit

                if verbose:
                    print(
                        "New Brick1: "
                        f"BrickX: {self.new_brickX}, BrickY: {self.new_brickY}, "
                        f"BrickZ: {self.new_brickZ}"
                    )

                return self.new_brickX, self.new_brickY, self.new_brickZ

        raise RuntimeError("Previous brick not found for vertical move.")

    def sideways(self, verbose=True):
        for agent in self.schedule.agents:
            if agent.unique_id == self.step_counter - 1:
                self.new_brickX, self.new_brickY, self.new_brickZ = (
                    agent.brickX,
                    agent.brickY,
                    agent.brickZ,
                )

                if verbose:
                    print(
                        "Previous Brick Origin: "
                        f"BrickX: {agent.brickX}, BrickY: {agent.brickY}, "
                        f"BrickZ: {agent.brickZ}"
                    )

                randomNumber = random.randint(1, 4)
                if verbose:
                    print(f"Random Number: {randomNumber}")
                if randomNumber == 1:
                    self.new_brickX += self.brickUnit
                elif randomNumber == 2:
                    self.new_brickX -= self.brickUnit
                elif randomNumber == 3:
                    self.new_brickY += self.brickUnit
                elif randomNumber == 4:
                    self.new_brickY -= self.brickUnit

                if verbose:
                    print(
                        "New Brick1: "
                        f"BrickX: {self.new_brickX}, BrickY: {self.new_brickY}, "
                        f"BrickZ: {self.new_brickZ}"
                    )

                return self.new_brickX, self.new_brickY, self.new_brickZ

        raise RuntimeError("Previous brick not found for sideways move.")

    def get_bricks(self):
        return sorted(self.schedule.agents, key=lambda agent: agent.unique_id)

    def to_dict(self):
        return {
            "metadata": {
                "totalSteps": self.totalSteps,
                "brickUnit": self.brickUnit,
                "cubeCage": self.cube_cage,
                "brickCount": len(self.schedule.agents),
            },
            "bricks": [agent.to_dict() for agent in self.get_bricks()],
        }

    def build_scad(self):
        cubes = [
            ops.Cube([agent.brickUnit, agent.brickUnit, agent.brickUnit])
            .translate([agent.brickX, agent.brickY, agent.brickZ])
            .color(agent.color)
            for agent in self.get_bricks()
        ]
        return ops.Union() + cubes

    def write_scad(self, output_path):
        result = self.build_scad()
        result.write(str(output_path))
        return str(result)


def run_simulation(
    total_steps=DEFAULT_TOTAL_STEPS,
    output_path=DEFAULT_SCAD_PATH,
    seed=None,
    verbose=False,
):
    if seed is not None:
        random.seed(seed)

    model = BrickModel(total_steps, verbose=verbose)
    model.run()
    simulation = model.to_dict()
    simulation["scad"] = model.write_scad(output_path) if output_path else str(
        model.build_scad()
    )
    simulation["metadata"]["outputPath"] = str(output_path) if output_path else None
    simulation["metadata"]["seed"] = seed
    return simulation


if __name__ == "__main__":
    run_simulation(verbose=True)

