"""Blender main-thread worker. Private stdin/stdout pipes; no network listener."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import uuid

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from policy import asset_path, positive, saved_path, valid_stem, vector3

VERSION = "2026.09.08.1"
PREFIX = "BLENDER_BRIDGE_RESPONSE:"
MAX_REQUEST = 1024 * 1024


class SceneWorker:
    def __init__(self, asset_root, output_root):
        self.asset_root = Path(asset_root).resolve()
        self.output_root = Path(output_root).resolve()
        self.output_root.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system = "METRIC"
        bpy.context.scene.unit_settings.scale_length = 1.0
        self.session = uuid.uuid4().hex[:12]
        self.revision = 0
        self.last_snapshot = None

    def output(self, stem, suffix):
        valid_stem(stem)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        return self.output_root / f"{stem}-{stamp}-{uuid.uuid4().hex[:10]}{suffix}"

    def bounds(self, objects):
        bpy.context.view_layer.update()
        points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
        if not points:
            return {"min": [0.0] * 3, "max": [0.0] * 3, "dimensions": [0.0] * 3}
        low = [min(p[i] for p in points) for i in range(3)]
        high = [max(p[i] for p in points) for i in range(3)]
        return {"min": low, "max": high, "dimensions": [high[i] - low[i] for i in range(3)]}

    def status(self):
        return {"connected": True, "bridge_version": VERSION, "blender_version": bpy.app.version_string,
                "session": self.session, "revision": self.revision, "last_snapshot": self.last_snapshot,
                "mode": "isolated_background_session", "units": "meters", "asset_root": str(self.asset_root),
                "output_root": str(self.output_root), "network_listener": False}

    def list_assets(self):
        return {"assets": [{"name": p.name, "bytes": p.stat().st_size} for p in sorted(self.asset_root.glob("*.glb")) if p.is_file()],
                "note": "Legacy files can store millimeter coordinates; supply an explicit import scale."}

    def object_info(self, name):
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise ValueError("Object does not exist")
        objects = [obj, *obj.children_recursive]
        return {"name": obj.name, "type": obj.type, "location": list(obj.location),
                "rotation_radians": list(obj.rotation_euler), "scale": list(obj.scale),
                "bounds": self.bounds(objects), "children": [o.name for o in obj.children]}

    def scene_info(self):
        objects = list(bpy.context.scene.objects)
        return {**self.status(), "object_count": len(objects), "bounds": self.bounds(objects),
                "objects": [{"name": o.name, "type": o.type, "parent": o.parent.name if o.parent else None} for o in objects[:500]],
                "truncated": len(objects) > 500}

    def import_glb(self, filename, scale):
        file = asset_path(self.asset_root, filename)
        scale = positive(scale)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(file))
        imported = set(bpy.data.objects) - before
        if not imported:
            raise ValueError("The GLB did not contain scene objects")
        group = bpy.data.objects.new(file.stem, None)
        bpy.context.scene.collection.objects.link(group)
        for obj in imported:
            if obj.parent not in imported:
                obj.parent = group
        group.scale = (scale, scale, scale)
        return {"root_object": group.name, "imported_objects": len(imported), "import_scale": scale,
                "bounds": self.bounds(list(imported))}

    def create_primitive(self, kind, name, size, location):
        if not isinstance(name, str) or not name.strip() or len(name) > 100:
            raise ValueError("Object name must contain 1-100 characters")
        size = positive(size)
        location = vector3(location)
        if kind == "cube":
            bpy.ops.mesh.primitive_cube_add(size=size, location=location)
        elif kind == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=size / 2, depth=size, location=location)
        elif kind == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=size / 2, location=location)
        else:
            raise ValueError("Supported primitives: cube, cylinder, sphere")
        obj = bpy.context.object
        obj.name = name
        return self.object_info(obj.name)

    def set_transform(self, name, location=None, rotation_radians=None, scale=None):
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise ValueError("Object does not exist")
        values = {}
        for key, value in (("location", location), ("rotation_euler", rotation_radians), ("scale", scale)):
            if value is not None:
                values[key] = vector3(value)
        if not values:
            raise ValueError("Provide at least one transform")
        if "scale" in values and any(v <= 0 for v in values["scale"]):
            raise ValueError("Scale components must be positive")
        for key, value in values.items():
            setattr(obj, key, value)
        return self.object_info(name)

    def save_scene(self, name="scene"):
        file = self.output(name, ".blend")
        bpy.ops.wm.save_as_mainfile(filepath=str(file), check_existing=False, copy=True)
        self.last_snapshot = str(file)
        return {"path": str(file), "filename": file.name, "bytes": file.stat().st_size}

    def open_saved_scene(self, filename):
        file = saved_path(self.output_root, filename)
        bpy.ops.wm.open_mainfile(filepath=str(file), use_scripts=False)
        return self.scene_info()

    def list_saved_scenes(self):
        files = sorted(self.output_root.glob("*.blend"), key=lambda p: p.stat().st_mtime, reverse=True)
        return {"scenes": [{"filename": p.name, "bytes": p.stat().st_size} for p in files[:100]], "total": len(files)}

    def export_glb(self, name="scene"):
        file = self.output(name, ".glb")
        bpy.ops.export_scene.gltf(filepath=str(file), export_format="GLB", check_existing=False,
                                  export_cameras=False, export_lights=False)
        return {"path": str(file), "bytes": file.stat().st_size, "units": "meters"}

    def render_preview(self, name="preview", width=768, height=576):
        if any(isinstance(v, bool) or not isinstance(v, int) or not 128 <= v <= 1536 for v in (width, height)):
            raise ValueError("Preview dimensions must be integers from 128 to 1536")
        file = self.output(name, ".png")
        bounds = self.bounds(list(bpy.context.scene.objects))
        center = Vector([(bounds["min"][i] + bounds["max"][i]) / 2 for i in range(3)])
        radius = max(max(bounds["dimensions"]), 1.0)
        scene = bpy.context.scene
        camera = bpy.data.objects.get("_bridge_preview_camera")
        if camera is None:
            camera = bpy.data.objects.new("_bridge_preview_camera", bpy.data.cameras.new("_bridge_preview_camera"))
            scene.collection.objects.link(camera)
        camera.location = center + Vector((1.35, -1.65, 1.05)) * radius
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = radius * 1.65 * max(1.0, width / height)
        scene.camera = camera
        lamp = bpy.data.objects.get("_bridge_preview_light")
        if lamp is None:
            lamp = bpy.data.objects.new("_bridge_preview_light", bpy.data.lights.new("_bridge_preview_light", "AREA"))
            scene.collection.objects.link(lamp)
        lamp.location = center + Vector((1, -2, 3)) * radius
        lamp.rotation_euler = (center - lamp.location).to_track_quat("-Z", "Y").to_euler()
        lamp.data.energy = 800 * radius * radius
        lamp.data.shape = "DISK"
        lamp.data.size = radius * 2
        if scene.world is None:
            scene.world = bpy.data.worlds.new("Bridge world")
        scene.world.use_nodes = True
        scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.15, 0.18, 0.22, 1)
        scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 12
        scene.render.resolution_x, scene.render.resolution_y = width, height
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.filepath = str(file)
        bpy.ops.render.render(write_still=True)
        return {"path": str(file), "width": width, "height": height, "bytes": file.stat().st_size}


OPERATIONS = ("status", "list_assets", "scene_info", "object_info", "import_glb", "create_primitive",
              "set_transform", "save_scene", "open_saved_scene", "list_saved_scenes", "export_glb", "render_preview")
MUTATIONS = {"import_glb", "create_primitive", "set_transform", "open_saved_scene"}


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", required=True)
    parser.add_argument("--outputs", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    worker = SceneWorker(args.assets, args.outputs)
    while True:
        line = sys.stdin.readline(MAX_REQUEST + 1)
        if not line:
            break
        request = {}
        mutation = False
        try:
            if len(line) > MAX_REQUEST:
                raise ValueError("Request too large")
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("Expected request object")
            operation = request.get("operation")
            if operation not in OPERATIONS:
                raise ValueError("Unsupported operation")
            params = request.get("params", {})
            if not isinstance(params, dict):
                raise ValueError("Expected parameter object")
            mutation = operation in MUTATIONS
            result = getattr(worker, operation)(**params)
            if mutation:
                worker.revision += 1
                result["snapshot"] = worker.save_scene("autosave")
            response = {"id": request.get("id"), "ok": True, "result": result}
        except Exception as exc:
            response = {"id": request.get("id") if isinstance(request, dict) else None,
                        "ok": False, "error": str(exc), "mutation_may_have_applied": mutation}
        print(PREFIX + json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
