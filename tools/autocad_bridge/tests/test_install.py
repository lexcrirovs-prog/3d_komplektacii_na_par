import sys
from pathlib import Path
import tempfile
import tomllib
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from install import append_config, config_block


class InstallTests(unittest.TestCase):
    def test_preserves_existing_bytes_and_blender_configuration(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root / 'config.toml'
            original = b'# user settings\r\nmodel = "gpt-6-astra"\r\n[mcp_servers.blender]\r\ncommand = "keep-me"\r\n'
            config.write_bytes(original)
            block = config_block(root / 'python.exe', root / 'release', root / 'acad.exe')
            backup = append_config(config, root / 'backups', block)
            self.assertEqual(backup.read_bytes(), original)
            self.assertTrue(config.read_bytes().startswith(original))
            result = tomllib.loads(config.read_text(encoding='utf-8'))
            result['mcp_servers'].pop('autocad')
            self.assertEqual(result, tomllib.loads(original.decode()))

    def test_duplicate_connection_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root / 'config.toml'
            original = b'[mcp_servers.autocad]\ncommand = "existing"\n'
            config.write_bytes(original)
            block = config_block(root / 'python.exe', root / 'release', root / 'acad.exe')
            with self.assertRaises(ValueError):
                append_config(config, root / 'backups', block)
            self.assertEqual(config.read_bytes(), original)

    def test_unicode_windows_paths_and_tool_allowlist(self):
        block = config_block(Path('C:/Users/Алексей/python.exe'), Path('C:/release'), Path('E:/AutoCAD 2027/acad.exe'))
        config = tomllib.loads(block)['mcp_servers']['autocad']
        self.assertIn('Алексей', config['command'])
        self.assertEqual(len(config['enabled_tools']), 6)
        self.assertNotIn('url', config)


if __name__ == '__main__':
    unittest.main()
