"""Local file and numeric boundaries shared by the MCP host and Blender 3.3+."""
import json
import math
from pathlib import Path
import re
import struct

MAX_GLB_BYTES = 256 * 1024 * 1024


def basename(value):
    if not isinstance(value, str) or not value or any(c in value for c in '/\\:\0'):
        raise ValueError("Use a file name from the allowed directory, not a path")
    if value in (".", "..") or Path(value).name != value:
        raise ValueError("Invalid file name")
    return value


def asset_path(root, name):
    name = basename(name)
    if Path(name).suffix.lower() != ".glb":
        raise ValueError("This connection imports GLB assets only")
    root = Path(root).resolve()
    file = (root / name).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        raise ValueError("Asset is missing or outside the allowed directory")
    validate_glb(file)
    return file


def validate_glb(file):
    size = Path(file).stat().st_size
    if not 20 <= size <= MAX_GLB_BYTES:
        raise ValueError("GLB size is outside the supported range")
    with Path(file).open("rb") as stream:
        magic, version, total, length, kind = struct.unpack("<IIIII", stream.read(20))
        if magic != 0x46546C67 or version != 2 or total != size or kind != 0x4E4F534A:
            raise ValueError("Invalid GLB 2.0 header")
        if length % 4 or not 0 < length <= min(size - 20, 16 * 1024 * 1024):
            raise ValueError("Invalid GLB JSON chunk")
        data = json.loads(stream.read(length).decode("utf-8"))
    if data.get("asset", {}).get("version") != "2.0":
        raise ValueError("Expected glTF 2.0")

    def embedded_only(item):
        if isinstance(item, dict):
            if "uri" in item:
                raise ValueError("External or data URI resources are not enabled; use embedded GLB")
            for value in item.values():
                embedded_only(value)
        elif isinstance(item, list):
            for value in item:
                embedded_only(value)

    embedded_only(data)
    return data


def valid_stem(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", value):
        raise ValueError("Use a name of 1-64 ASCII letters, digits, underscores or hyphens")
    if value.upper() in {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(10)], *[f"LPT{i}" for i in range(10)]}:
        raise ValueError("Reserved Windows file name")
    return value


def vector3(value):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError("Expected three finite numbers")
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 1e7 for v in value):
        raise ValueError("Expected three finite numbers within +/- 10000000")
    return [float(v) for v in value]


def positive(value, maximum=10000):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 < value <= maximum:
        raise ValueError("Expected a finite positive value in the supported range")
    return float(value)


def saved_path(root, name):
    name = basename(name)
    root = Path(root).resolve()
    file = (root / name).resolve()
    if file.suffix.lower() != ".blend" or not file.is_relative_to(root) or not file.is_file():
        raise ValueError("Choose a Blender copy from blender_list_saved_scenes")
    return file
