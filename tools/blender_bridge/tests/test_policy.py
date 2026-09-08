"""File boundaries for the Blender connection; no Blender installation required."""
import importlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec("policy"), "Blender file policy is not implemented")
        self.policy = importlib.import_module("policy")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.assets = self.root / "assets"
        self.assets.mkdir()

    def glb(self, name="boiler.glb", document=None):
        payload = json.dumps(document or {"asset": {"version": "2.0"}}).encode()
        payload += b" " * (-len(payload) % 4)
        data = struct.pack("<III", 0x46546C67, 2, 20 + len(payload))
        data += struct.pack("<II", len(payload), 0x4E4F534A) + payload
        file = self.assets / name
        file.write_bytes(data)
        return file

    def test_valid_glb_with_unicode_path(self):
        self.glb("котёл.glb")
        self.assertEqual(self.policy.asset_path(self.assets, "котёл.glb").name, "котёл.glb")

    def test_parent_and_absolute_paths_are_rejected(self):
        for name in ("../outside.glb", "folder/boiler.glb", str(self.root / "outside.glb")):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.policy.asset_path(self.assets, name)

    def test_blend_is_not_an_importable_asset(self):
        (self.assets / "unsafe.blend").write_bytes(b"test")
        with self.assertRaises(ValueError):
            self.policy.asset_path(self.assets, "unsafe.blend")

    def test_external_glb_resources_are_rejected(self):
        for resource in ("../../private.png", "https://example.org/a.png", "data:image/png;base64,AA"):
            file = self.glb(document={"asset": {"version": "2.0"}, "images": [{"uri": resource}]})
            with self.subTest(resource=resource), self.assertRaises(ValueError):
                self.policy.validate_glb(file)

    def test_corrupt_and_truncated_glb_are_rejected(self):
        file = self.glb()
        file.write_bytes(file.read_bytes()[:-4])
        with self.assertRaises(ValueError):
            self.policy.validate_glb(file)

    def test_output_stems_cannot_select_paths(self):
        for stem in ("../scene", "/scene", "a\\b", "..", "", "CON", "LPT1"):
            with self.subTest(stem=stem), self.assertRaises(ValueError):
                self.policy.valid_stem(stem)
        self.assertEqual(self.policy.valid_stem("boiler-demo"), "boiler-demo")

    def test_transform_requires_three_finite_numbers(self):
        for value in ([1, 2], [1, float("nan"), 3], [1, float("inf"), 3], [True, 2, 3]):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.policy.vector3(value)
        self.assertEqual(self.policy.vector3([1, 2, 3]), [1.0, 2.0, 3.0])

    def test_saved_scene_must_stay_in_outputs(self):
        outputs = self.root / "outputs"
        outputs.mkdir()
        (outputs / "test.blend").write_bytes(b"BLENDER")
        self.assertEqual(self.policy.saved_path(outputs, "test.blend").name, "test.blend")
        for value in ("../x.blend", "test.glb", str(outputs / "test.blend")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.policy.saved_path(outputs, value)


if __name__ == "__main__":
    unittest.main()
