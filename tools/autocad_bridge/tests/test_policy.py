import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from policy import validate_page, validate_handle, select_document, normalize_bounds


class PolicyTests(unittest.TestCase):
    def test_invalid_pages_rejected(self):
        for offset, limit in [(-1, 20), (0, 0), (0, 201), (True, 20)]:
            with self.subTest(offset=offset, limit=limit), self.assertRaises(ValueError):
                validate_page(offset, limit)

    def test_handle_is_hex_not_a_command(self):
        self.assertEqual(validate_handle('ab12'), 'AB12')
        for value in ['', '(command "erase")', '../drawing', 'F' * 17]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_handle(value)

    def test_explicit_unique_document_required(self):
        docs = [{'name': 'plant.dwg', 'full_name': 'C:/one/plant.dwg'},
                {'name': 'plant.dwg', 'full_name': 'C:/two/plant.dwg'}]
        with self.assertRaises(ValueError):
            select_document(docs, 'plant.dwg')
        self.assertEqual(select_document(docs, 'c:/TWO/plant.dwg'), 1)
        with self.assertRaises(ValueError):
            select_document(docs, 'not-open.dwg')

    def test_document_name_is_never_an_implicit_open(self):
        with self.assertRaises(ValueError):
            select_document([], 'https://example.invalid/project.dwg')

    def test_bounds_support_com_return_values(self):
        expected = {'min': [0.0, 1200.0, 0.0], 'max': [1000.0, 1800.0, 600.0]}
        self.assertEqual(normalize_bounds(([0, 1200, 0], [1000, 1800, 600]), None, None), expected)

    def test_bounds_support_com_byref_values(self):
        expected = {'min': [0.0, 0.0, 0.0], 'max': [1.0, 2.0, 3.0]}
        self.assertEqual(normalize_bounds(None, [0, 0, 0], [1, 2, 3]), expected)

    def test_missing_bounds_are_not_reported_as_valid_geometry(self):
        self.assertIsNone(normalize_bounds(None, None, None))


if __name__ == '__main__':
    unittest.main()
