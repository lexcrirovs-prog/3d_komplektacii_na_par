import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bridge import AutoCADBridge


class AttachmentTests(unittest.TestCase):
    def test_wrong_autocad_installation_is_rejected(self):
        wrong = SimpleNamespace(FullName='C:/Old AutoCAD/acad.exe')
        bridge = AutoCADBridge('E:/AutoCAD 2027/acad.exe')
        with patch('bridge.win32com.client.GetActiveObject', return_value=wrong), \
             patch('bridge.pythoncom.CoInitialize'), patch('bridge.pythoncom.CoUninitialize') as close:
            with self.assertRaisesRegex(RuntimeError, 'does not match'):
                with bridge.application():
                    self.fail('Wrong application must not be yielded')
            close.assert_called_once()

    def test_busy_application_is_not_queried_for_documents(self):
        app = SimpleNamespace(FullName='E:/AutoCAD 2027/acad.exe',
                              GetAcadState=lambda: SimpleNamespace(IsQuiescent=False))
        bridge = AutoCADBridge(app.FullName)
        with patch('bridge.win32com.client.GetActiveObject', return_value=app), \
             patch('bridge.pythoncom.CoInitialize'), patch('bridge.pythoncom.CoUninitialize') as close:
            with self.assertRaisesRegex(RuntimeError, 'busy'):
                bridge.list_documents()
            close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
