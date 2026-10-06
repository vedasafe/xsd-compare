import tempfile
import time
import tkinter as tk
import unittest
from pathlib import Path
from unittest.mock import patch

from app import CompareApp


class GuiTests(unittest.TestCase):
    def test_selection_comparison_and_reset(self):
        root = tk.Tk()
        root.withdraw()
        self.addCleanup(root.destroy)
        app = CompareApp(root)
        self.assertTrue(app.compare_button.instate(['disabled']))
        with tempfile.TemporaryDirectory() as directory:
            a, b = Path(directory) / 'a.xsd', Path(directory) / 'b.xsd'
            a.write_text('<schema/>')
            b.write_text('<schema>\n\n</schema>')
            for index, path in enumerate([a, b]):
                with patch('app.filedialog.askopenfilename', return_value=str(path)):
                    app.select_file(index)
            self.assertFalse(app.compare_button.instate(['disabled']))
            for xml, expected in [('<schema>\n</schema>', 'Same'),
                                  ('<schema name="changed"/>', 'difference'),
                                  ('<schema>', 'Could not compare')]:
                b.write_text(xml)
                app.compare_button.invoke()
                deadline = time.monotonic() + 5
                while app.busy and time.monotonic() < deadline:
                    root.update()
                    time.sleep(0.01)
                self.assertFalse(app.busy)
                self.assertIn(expected, app.results.get('1.0', 'end'))
            with patch('app.filedialog.askopenfilename', return_value=str(a)):
                app.select_file(0)
            self.assertEqual(app.results.get('1.0', 'end').strip(), '')
