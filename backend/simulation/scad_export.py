import openpyscad as ops


def build_scad(bricks):
    cubes = [
        ops.Cube([brick.brick_unit, brick.brick_unit, brick.brick_unit])
        .translate([brick.brick_x, brick.brick_y, brick.brick_z])
        .color(brick.color)
        for brick in bricks
    ]
    return ops.Union() + cubes


def write_scad(bricks, output_path):
    result = build_scad(bricks)
    result.write(str(output_path))
    return str(result)
