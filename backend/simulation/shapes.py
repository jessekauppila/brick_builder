from __future__ import annotations

from dataclasses import dataclass

Vector3 = tuple[int, int, int]

HORIZONTAL_ORIENTATIONS = ("east", "west", "north", "south")


@dataclass(frozen=True)
class BrickShape:
    id: str
    label: str
    cell_offsets: tuple[Vector3, ...]


SHAPE_LIBRARY: dict[str, BrickShape] = {
    "single_1x1": BrickShape(
        id="single_1x1",
        label="1x1",
        cell_offsets=((0, 0, 0),),
    ),
    "bar_2x1": BrickShape(
        id="bar_2x1",
        label="2x1 Bar",
        cell_offsets=((0, 0, 0), (1, 0, 0)),
    ),
    "bar_3x1": BrickShape(
        id="bar_3x1",
        label="3x1 Bar",
        cell_offsets=((0, 0, 0), (1, 0, 0), (2, 0, 0)),
    ),
}


def get_shape(shape_id: str) -> BrickShape:
    try:
        return SHAPE_LIBRARY[shape_id]
    except KeyError as error:
        known_shapes = ", ".join(sorted(SHAPE_LIBRARY))
        raise ValueError(
            f"Unknown shape_id '{shape_id}'. Expected one of: {known_shapes}."
        ) from error


def list_shapes() -> list[dict[str, str]]:
    return [
        {"id": shape.id, "label": shape.label}
        for shape in sorted(SHAPE_LIBRARY.values(), key=lambda item: item.label)
    ]


def orient_cell(cell_offset: Vector3, orientation: str) -> Vector3:
    x, y, z = cell_offset
    if orientation == "east":
        return x, y, z
    if orientation == "west":
        return -x, -y, z
    if orientation == "north":
        return -y, x, z
    if orientation == "south":
        return y, -x, z
    raise ValueError(
        f"Unknown orientation '{orientation}'. Expected one of: "
        f"{', '.join(HORIZONTAL_ORIENTATIONS)}."
    )


def absolute_cells(
    shape: BrickShape,
    anchor: Vector3,
    orientation: str,
    brick_unit: int,
) -> list[Vector3]:
    anchor_x, anchor_y, anchor_z = anchor
    cells: list[Vector3] = []
    for cell_offset in shape.cell_offsets:
        offset_x, offset_y, offset_z = orient_cell(cell_offset, orientation)
        cells.append(
            (
                anchor_x + offset_x * brick_unit,
                anchor_y + offset_y * brick_unit,
                anchor_z + offset_z * brick_unit,
            )
        )
    return cells
