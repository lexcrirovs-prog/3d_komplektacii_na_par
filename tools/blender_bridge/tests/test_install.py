"""Verify that installation preserves unrelated settings and refuses replacement."""
import argparse
import contextlib
import importlib
import io
from pathlib import Path
import sys
import tempfile
import tomllib
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
installer = importlib.import_module("install")


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.config = self.root / "config.toml"
        self.original = b'# preserve comment\nmodel = "gpt-6-astra"\n[mcp_servers.existing]\ncommand = "keep-this-command"\n'
        self.config.write_bytes(self.original)
        for name in ("python.exe", "blender.exe"):
            (self.root / name).write_bytes(b"test path, never executed")
        (self.root / "assets").mkdir()
        self.args = argparse.Namespace(install_root=str(self.root / "install"), config=str(self.config),
                                       blender=str(self.root / "blender.exe"), python=str(self.root / "python.exe"),
                                       assets=str(self.root / "assets"))

    def run_install(self):
        with contextlib.redirect_stdout(io.StringIO()):
            installer.install(self.args)

    def test_preserves_settings_comments_and_exact_backup(self):
        self.run_install()
        self.assertTrue(self.config.read_bytes().startswith(self.original))
        parsed = tomllib.loads(self.config.read_text(encoding="utf-8"))
        self.assertEqual(parsed["mcp_servers"]["existing"]["command"], "keep-this-command")
        self.assertEqual(len(parsed["mcp_servers"]["blender"]["enabled_tools"]), 12)
        backups = list((self.root / "install" / "backups").glob("*.toml"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), self.original)

    def test_repeat_install_refuses_to_overwrite(self):
        self.run_install()
        current = self.config.read_bytes()
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.run_install()
        self.assertEqual(self.config.read_bytes(), current)

    def test_missing_executable_does_not_change_configuration(self):
        self.args.blender = str(self.root / "missing.exe")
        with self.assertRaises(ValueError):
            self.run_install()
        self.assertEqual(self.config.read_bytes(), self.original)


if __name__ == "__main__":
    unittest.main()
