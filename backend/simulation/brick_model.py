from __future__ import annotations

import json
import random
from pathlib import Path

import mesa

from .brick_agent import BrickAgent
from .scad_export import build_scad, write_scad

EXPORTS_DIR = Path(__file__).resolve().parent.parent / "exports"
DEFAULT_EXPORT_STEM = "sample"
DEFAULT_SCAD_PATH = EXPORTS_DIR / f"{DEFAULT_EXPORT_STEM}.scad"
DEFAULT_JSON_PATH = EXPORTS_DIR / f"{DEFAULT_EXPORT_STEM}.json"
DEFAULT_TOTAL_STEPS = 200


class BrickModel(mesa.Model):
    def __init__(
        self,
        total_steps,
        brick_unit=10,
        cube_cage=200,
        verbose=False,
    ):
        super().__init__()
        self.schedule = mesa.time.StagedActivation(self)
        self.brick_unit = brick_unit
        self.brick_x = 0
        self.brick_y = 0
        self.brick_z = 0
        self.new_brick_x = None
        self.new_brick_y = None
        self.new_brick_z = None
        self.step_counter = 0
        self.total_steps = total_steps
        self.cube_cage = cube_cage
        self.verbose = verbose

    def log(self, message):
        if self.verbose:
            print(message)

    def run(self):
        self.design_brick()

        while self.step_counter + 1 < self.total_steps:
            self.step_counter += 1
            self.log(f"Step Counter: {self.step_counter}")
            self.create_new_brick_location(sideways=True)
            self.design_brick()

            if self.step_counter + 1 >= self.total_steps:
                break

            self.step_counter += 1
            self.log(f"Step Counter: {self.step_counter}")
            self.create_new_brick_location(sideways=False)
            self.design_brick()

        return self

    def design_brick(self, color="Red"):
        brick = BrickAgent(
            self.step_counter,
            self.brick_unit,
            self.brick_x,
            self.brick_y,
            self.brick_z,
            color,
            self,
        )
        self.schedule.add(brick)
        return brick

    def create_new_brick_location(self, sideways=False):
        if sideways:
            self.new_brick_x, self.new_brick_y, self.new_brick_z = self.sideways(
                verbose=self.verbose
            )
        else:
            self.new_brick_x, self.new_brick_y, self.new_brick_z = self.up_or_down(
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
                self.new_brick_x, self.new_brick_y, self.new_brick_z = self.sideways(
                    verbose=False
                )
            else:
                self.new_brick_x, self.new_brick_y, self.new_brick_z = self.up_or_down(
                    verbose=False
                )

        self.brick_x, self.brick_y, self.brick_z = (
            self.new_brick_x,
            self.new_brick_y,
            self.new_brick_z,
        )
        self.log(
            f"New Origin Brick: BrickX: {self.brick_x}, "
            f"BrickY: {self.brick_y}, BrickZ: {self.brick_z}"
        )

    def not_touching_and_within_cube(self):
        nx, ny, nz = self.new_brick_x, self.new_brick_y, self.new_brick_z
        if nx > self.cube_cage or ny > self.cube_cage or nz > self.cube_cage:
            return False
        if nx < -self.cube_cage or ny < -self.cube_cage or nz < -self.cube_cage:
            return False
        for agent in self.schedule.agents:
            if agent.brick_x == nx and agent.brick_y == ny and agent.brick_z == nz:
                return False
        return True

    def _pick_random_free_cell(self):
        half = self.cube_cage // self.brick_unit
        for _ in range(5000):
            x = random.randint(-half, half) * self.brick_unit
            y = random.randint(-half, half) * self.brick_unit
            z = random.randint(-half, half) * self.brick_unit
            self.new_brick_x, self.new_brick_y, self.new_brick_z = x, y, z
            if self.not_touching_and_within_cube():
                return
        raise RuntimeError(
            "Could not find a free grid cell inside cube_cage; "
            "raise cage or reduce steps."
        )

    def up_or_down(self, verbose=True):
        for agent in self.schedule.agents:
            if agent.unique_id == self.step_counter - 1:
                self.new_brick_x, self.new_brick_y, self.new_brick_z = (
                    agent.brick_x,
                    agent.brick_y,
                    agent.brick_z,
                )

                if verbose:
                    print(
                        "Previous Brick Origin: "
                        f"BrickX: {agent.brick_x}, BrickY: {agent.brick_y}, "
                        f"BrickZ: {agent.brick_z}"
                    )

                random_number = random.randint(1, 2)
                if verbose:
                    print(f"Random Number: {random_number}")
                if random_number == 1:
                    self.new_brick_z += self.brick_unit
                elif random_number == 2:
                    self.new_brick_z -= self.brick_unit

                if verbose:
                    print(
                        "New Brick1: "
                        f"BrickX: {self.new_brick_x}, BrickY: {self.new_brick_y}, "
                        f"BrickZ: {self.new_brick_z}"
                    )

                return self.new_brick_x, self.new_brick_y, self.new_brick_z

        raise RuntimeError("Previous brick not found for vertical move.")

    def sideways(self, verbose=True):
        for agent in self.schedule.agents:
            if agent.unique_id == self.step_counter - 1:
                self.new_brick_x, self.new_brick_y, self.new_brick_z = (
                    agent.brick_x,
                    agent.brick_y,
                    agent.brick_z,
                )

                if verbose:
                    print(
                        "Previous Brick Origin: "
                        f"BrickX: {agent.brick_x}, BrickY: {agent.brick_y}, "
                        f"BrickZ: {agent.brick_z}"
                    )

                random_number = random.randint(1, 4)
                if verbose:
                    print(f"Random Number: {random_number}")
                if random_number == 1:
                    self.new_brick_x += self.brick_unit
                elif random_number == 2:
                    self.new_brick_x -= self.brick_unit
                elif random_number == 3:
                    self.new_brick_y += self.brick_unit
                elif random_number == 4:
                    self.new_brick_y -= self.brick_unit

                if verbose:
                    print(
                        "New Brick1: "
                        f"BrickX: {self.new_brick_x}, BrickY: {self.new_brick_y}, "
                        f"BrickZ: {self.new_brick_z}"
                    )

                return self.new_brick_x, self.new_brick_y, self.new_brick_z

        raise RuntimeError("Previous brick not found for sideways move.")

    def get_bricks(self):
        return sorted(self.schedule.agents, key=lambda agent: agent.unique_id)

    def to_dict(self):
        return {
            "metadata": {
                "totalSteps": self.total_steps,
                "brickUnit": self.brick_unit,
                "cubeCage": self.cube_cage,
                "brickCount": len(self.schedule.agents),
            },
            "bricks": [agent.to_dict() for agent in self.get_bricks()],
        }


def ensure_exports_dir():
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def normalize_export_stem(file_name=None):
    if not file_name:
        return DEFAULT_EXPORT_STEM
    return Path(file_name).stem or DEFAULT_EXPORT_STEM


def write_json(simulation, output_path):
    Path(output_path).write_text(json.dumps(simulation, indent=2), encoding="utf-8")


def run_simulation(
    total_steps=DEFAULT_TOTAL_STEPS,
    scad_output_path=DEFAULT_SCAD_PATH,
    json_output_path=DEFAULT_JSON_PATH,
    seed=None,
    verbose=False,
):
    ensure_exports_dir()

    if seed is not None:
        random.seed(seed)

    model = BrickModel(total_steps, verbose=verbose)
    model.run()

    simulation = model.to_dict()
    scad_source = str(build_scad(model.get_bricks()))
    simulation["scad"] = scad_source
    simulation["metadata"]["seed"] = seed
    simulation["metadata"]["outputPath"] = (
        str(scad_output_path) if scad_output_path else None
    )
    simulation["metadata"]["jsonOutputPath"] = (
        str(json_output_path) if json_output_path else None
    )

    if scad_output_path:
        write_scad(model.get_bricks(), scad_output_path)

    if json_output_path:
        write_json(simulation, json_output_path)

    return simulation


if __name__ == "__main__":
    run_simulation(verbose=True)
