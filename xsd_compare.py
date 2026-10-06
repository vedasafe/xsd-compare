"""Structural XML comparison without formatting-only differences."""
from dataclasses import dataclass
from itertools import zip_longest
from pathlib import Path
import xml.etree.ElementTree as ET


class ComparisonError(ValueError):
    """An input could not be compared."""


@dataclass(frozen=True)
class Difference:
    path: str
    kind: str
    first: str | None
    second: str | None


def _read(path):
    path = Path(path)
    if path.suffix.lower() != '.xsd':
        raise ComparisonError(f'{path}: select a file with the .xsd extension.')
    try:
        return ET.parse(path).getroot()
    except (OSError, ET.ParseError) as error:
        raise ComparisonError(f'{path}: {error}') from error


def _text(value):
    return value if value and value.strip() else ''


def compare_files(first, second):
    """Return ordered differences; an empty list means the documents match.

    Expanded namespace names are compared. QName-valued attributes remain
    literal. Includes/imports are not expanded and XSD validity is not checked.
    """
    left, right = _read(first), _read(second)
    differences = []
    pending = [(left, right, f'/{left.tag}[1]')]
    while pending:
        a, b, path = pending.pop()
        if a is None or b is None:
            differences.append(Difference(path, 'Added' if a is None else 'Removed',
                ET.tostring(a, encoding='unicode') if a is not None else None,
                ET.tostring(b, encoding='unicode') if b is not None else None))
            continue
        if a.tag != b.tag:
            differences.append(Difference(path, 'Element name', a.tag, b.tag))
        for name in sorted(a.attrib.keys() | b.attrib.keys()):
            if a.get(name) != b.get(name):
                differences.append(Difference(f'{path}/@{name}', 'Attribute', a.get(name), b.get(name)))
        for label, av, bv in [('text()', a.text, b.text), ('tail()', a.tail, b.tail)]:
            if _text(av) != _text(bv):
                differences.append(Difference(f'{path}/{label}', 'Text', _text(av), _text(bv)))
        children = []
        counts = {}
        for ac, bc in zip_longest(a, b):
            tag = ac.tag if ac is not None else bc.tag
            counts[tag] = counts.get(tag, 0) + 1
            children.append((ac, bc, f'{path}/{tag}[{counts[tag]}]'))
        pending.extend(reversed(children))
    return differences
