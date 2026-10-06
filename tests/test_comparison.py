import tempfile
import unittest
from pathlib import Path

from xsd_compare import ComparisonError, compare_files


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.a = Path(self.directory.name) / 'a.xsd'
        self.b = Path(self.directory.name) / 'b.xsd'

    def compare(self, a, b):
        self.a.write_text(a, encoding='utf-8')
        self.b.write_text(b, encoding='utf-8')
        return compare_files(self.a, self.b)

    def test_layout_comments_and_attribute_order(self):
        self.assertEqual(self.compare('<schema a="1" b="2"><element/></schema>',
            '<schema b="2" a="1">\n\n  <!-- note --><element />\n</schema>'), [])

    def test_attribute_change_has_location_and_values(self):
        differences = self.compare('<schema><element name="a"/></schema>',
                                   '<schema><element name="b"/></schema>')
        self.assertEqual(len(differences), 1)
        self.assertIn('/element[1]/@name', differences[0].path)
        self.assertEqual((differences[0].first, differences[0].second), ('a', 'b'))

    def test_meaningful_text_spaces_preserved(self):
        self.assertTrue(self.compare('<a>hello world</a>', '<a>hello  world</a>'))

    def test_child_order_preserved(self):
        self.assertTrue(self.compare('<a><b/><c/></a>', '<a><c/><b/></a>'))

    def test_added_and_removed_children(self):
        for a, b in [('<a/>', '<a><b/></a>'), ('<a><b/></a>', '<a/>')]:
            with self.subTest(a=a):
                self.assertEqual(len(self.compare(a, b)), 1)

    def test_namespace_prefixes(self):
        self.assertEqual(self.compare('<x:a xmlns:x="urn:test"/>',
                                      '<y:a xmlns:y="urn:test"/>'), [])

    def test_different_namespace(self):
        self.assertTrue(self.compare('<a xmlns="urn:first"/>', '<a xmlns="urn:second"/>'))

    def test_qname_values_remain_exact(self):
        self.assertTrue(self.compare('<a type="x:string"/>', '<a type="y:string"/>'))

    def test_missing_attribute_differs_from_empty(self):
        self.assertTrue(self.compare('<a/>', '<a value=""/>'))

    def test_tail_text(self):
        self.assertTrue(self.compare('<a><b/>one</a>', '<a><b/>two</a>'))

    def test_invalid_xml(self):
        with self.assertRaisesRegex(ComparisonError, 'a.xsd.*line'):
            self.compare('<a>', '<a/>')

    def test_missing_file(self):
        with self.assertRaisesRegex(ComparisonError, 'a.xsd'):
            compare_files(self.a, self.b)

    def test_wrong_extension(self):
        with self.assertRaisesRegex(ComparisonError, '.xsd'):
            compare_files(self.a.with_suffix('.txt'), self.b)


if __name__ == '__main__':
    unittest.main()
