from contextlib import nullcontext
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bridge import AutoCADBridge


def inspect_object(obj):
    doc = SimpleNamespace(Name='test.dwg', FullName='', Saved=True, ReadOnly=False,
                          GetVariable=lambda name: {'INSUNITS': 4, 'LUNITS': 2, 'AUNITS': 0}[name],
                          HandleToObject=lambda handle: obj)
    bridge = AutoCADBridge('E:/AutoCAD 2027/acad.exe')
    with patch.object(bridge, 'drawing', return_value=nullcontext(doc)):
        return bridge.entity_info('test.dwg', 'AB')


class MetadataTests(unittest.TestCase):
    def test_constant_attributes_are_explicitly_out_of_scope(self):
        result = inspect_object(SimpleNamespace(ObjectName='AcDbBlockReference', HasAttributes=True,
                                                GetAttributes=lambda: ()))
        self.assertEqual(result['attributes'], [])
        self.assertFalse(result['constant_attributes_read'])
        self.assertIn('editable', result['attributes_scope'])

    def test_long_polyline_keeps_coordinate_frame_and_partial_bulges(self):
        result = inspect_object(SimpleNamespace(ObjectName='AcDbPolyline', Coordinates=[0.0] * 12002,
                                                GetBulge=lambda index: 0.5))
        self.assertTrue(result['properties']['Coordinates']['truncated'])
        self.assertIn('OCS', result['coordinate_system'])
        self.assertEqual(len(result['bulges']), 200)
        self.assertTrue(result['bulges_truncated'])


if __name__ == '__main__':
    unittest.main()
