"""Boundaries for reading an explicitly selected, already-open drawing."""
import re
import math


def normalize_bounds(returned, lower, upper):
    # AutoCAD dynamic dispatch returns the two out-arguments as a tuple on this
    # installation; other pywin32 wrappers fill the supplied byref VARIANTs.
    if isinstance(returned, (tuple, list)) and len(returned) == 2:
        lower, upper = returned
    if not all(isinstance(point, (tuple, list)) and len(point) == 3 for point in (lower, upper)):
        return None
    if not all(isinstance(v, (float, int)) and math.isfinite(v) for point in (lower, upper) for v in point):
        return None
    return {'min': [float(v) for v in lower], 'max': [float(v) for v in upper]}


def validate_page(offset, limit):
    if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 200:
        raise ValueError('offset must be nonnegative; limit must be between 1 and 200')


def validate_handle(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-fA-F]{1,16}', value):
        raise ValueError('Use the hexadecimal handle returned by autocad_list_entities')
    return value.upper()


def select_document(documents, name):
    if not isinstance(name, str) or not name.strip():
        raise ValueError('An explicit document name from autocad_list_documents is required')
    key = name.replace('\\', '/').casefold()
    matches = [i for i, doc in enumerate(documents)
               if key in (doc['name'].replace('\\', '/').casefold(),
                          doc['full_name'].replace('\\', '/').casefold())]
    if len(matches) != 1:
        raise ValueError('Select exactly one already-open drawing by its full_name; files are never opened implicitly')
    return matches[0]
