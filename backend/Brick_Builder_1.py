from simulation.brick_model import (
    DEFAULT_JSON_PATH,
    DEFAULT_SCAD_PATH,
    DEFAULT_TOTAL_STEPS,
    BrickModel,
    EXPORTS_DIR,
    run_simulation,
)

__all__ = [
    "BrickModel",
    "DEFAULT_JSON_PATH",
    "DEFAULT_SCAD_PATH",
    "DEFAULT_TOTAL_STEPS",
    "EXPORTS_DIR",
    "run_simulation",
]


if __name__ == "__main__":
    run_simulation(
        total_steps=DEFAULT_TOTAL_STEPS,
        scad_output_path=DEFAULT_SCAD_PATH,
        json_output_path=DEFAULT_JSON_PATH,
        verbose=True,
    )

