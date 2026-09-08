"""Read-only AutoCAD ActiveX adapter. Version 2026.09.08.1, Codex / GPT-6 Astra.

COM references never cross tool threads. All COM access is serialized and each
call owns an STA apartment. No Dispatch() of the application, SendCommand,
document opening/saving, property setters, arbitrary code, or network service.
"""
from contextlib import contextmanager
import math
from pathlib import Path
import threading

import pythoncom
import pywintypes
import win32com.client

from policy import select_document, validate_handle, validate_page, normalize_bounds

VERSION = '2026.09.08.1'
BUSY_HRESULTS = {-2147418111, -2147417846}
UNITS = {0: ('unspecified', None), 1: ('inches', 0.0254), 2: ('feet', 0.3048),
         4: ('millimeters', 0.001), 5: ('centimeters', 0.01), 6: ('meters', 1.0)}


def plain(value):
    if value is None or isinstance(value, (str, bool, int)):
        if isinstance(value, str) and len(value) > 16000:
            return {'text': value[:16000], 'truncated': True, 'total_characters': len(value)}
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (list, tuple)):
        if len(value) > 12000:
            return {'values': [plain(x) for x in value[:12000]], 'truncated': True, 'total_values': len(value)}
        return [plain(x) for x in value]
    raise TypeError('Unsupported COM value; no object execution or implicit conversion')


def optional_read(target, properties):
    result, unavailable = {}, []
    for name in properties:
        try:
            result[name] = plain(getattr(target, name))
        except pywintypes.com_error as exc:
            if exc.hresult in BUSY_HRESULTS:
                raise RuntimeError('AutoCAD became busy; finish its command or dialog before reading again') from exc
            unavailable.append(name)
        except (AttributeError, TypeError):
            unavailable.append(name)
    return result, unavailable


def document_record(doc):
    return {'name': doc.Name, 'full_name': doc.FullName, 'saved': bool(doc.Saved),
            'read_only': bool(doc.ReadOnly)}


def unit_record(doc):
    code = int(doc.GetVariable('INSUNITS'))
    name, factor = UNITS.get(code, ('other_INSUNITS_code', None))
    return {'INSUNITS': code, 'insertion_unit': name, 'insertion_units_to_meters': factor,
            'LUNITS': int(doc.GetVariable('LUNITS')), 'AUNITS': int(doc.GetVariable('AUNITS')),
            'coordinates': 'raw drawing coordinates; INSUNITS does not prove the modeled scale',
            'activex_angles': 'radians; lengths and coordinates are not converted'}


class AutoCADBridge:
    def __init__(self, expected_executable, progid='AutoCAD.Application.26'):
        self.expected_executable = Path(expected_executable).resolve()
        self.progid = progid
        self.lock = threading.Lock()

    @contextmanager
    def application(self, require_ready=True):
        with self.lock:
            pythoncom.CoInitialize()
            app = None
            try:
                # GetActiveObject attaches only; it never starts another AutoCAD.
                app = win32com.client.GetActiveObject(self.progid)
                if Path(app.FullName).resolve() != self.expected_executable:
                    raise RuntimeError('The running COM application does not match the configured AutoCAD executable')
                if require_ready and not app.GetAcadState().IsQuiescent:
                    raise RuntimeError('AutoCAD is busy; finish the active command or dialog first')
                yield app
            finally:
                app = None
                pythoncom.CoUninitialize()

    @contextmanager
    def drawing(self, name):
        with self.application() as app:
            docs = [app.Documents.Item(i) for i in range(app.Documents.Count)]
            doc = docs[select_document([document_record(d) for d in docs], name)]
            identity = (doc.Name, doc.FullName)
            try:
                yield doc
                if (doc.Name, doc.FullName) != identity:
                    raise RuntimeError('Drawing identity changed during the read; inspect the document list again')
            finally:
                doc = None
                docs.clear()

    def status(self):
        try:
            with self.application(require_ready=False) as app:
                ready = bool(app.GetAcadState().IsQuiescent)
                result = {'connected': True, 'ready': ready, 'bridge_version': VERSION,
                          'autocad_version': app.Version, 'executable': app.FullName,
                          'progid': self.progid, 'read_only': True, 'transport': 'stdio',
                          'network_listener': False, 'document_scope': 'explicit already-open drawing'}
                if ready:
                    result['document_count'] = app.Documents.Count
                    result['active_document'] = app.ActiveDocument.Name if app.Documents.Count else None
                return result
        except pywintypes.com_error:
            return {'connected': False, 'ready': False, 'bridge_version': VERSION,
                    'progid': self.progid, 'reason': 'Configured AutoCAD is not available through its running COM session',
                    'action': 'Open AutoCAD 2027 on this Windows desktop and finish any modal dialog'}

    def list_documents(self):
        with self.application() as app:
            records = [document_record(app.Documents.Item(i)) for i in range(app.Documents.Count)]
            return {'documents': records, 'active_document': app.ActiveDocument.Name if records else None}

    def drawing_info(self, name):
        with self.drawing(name) as doc:
            return {'document': document_record(doc), 'units': unit_record(doc),
                    'model_space_count': doc.ModelSpace.Count, 'paper_space_count': doc.PaperSpace.Count,
                    'layer_count': doc.Layers.Count, 'block_definition_count': doc.Blocks.Count,
                    'consistency': 'live non-atomic read; this connector does not lock or modify the drawing'}

    def list_layers(self, name, offset=0, limit=100):
        validate_page(offset, limit)
        with self.drawing(name) as doc:
            total = doc.Layers.Count
            items = [optional_read(doc.Layers.Item(i), ('Name', 'Handle', 'Color', 'LayerOn', 'Freeze', 'Lock', 'Linetype'))[0]
                     for i in range(offset, min(total, offset + limit))]
            return {'document': document_record(doc), 'total': total, 'offset': offset, 'layers': items,
                    'next_offset': offset + len(items) if offset + len(items) < total else None}

    def list_entities(self, name, space='model', offset=0, limit=100):
        validate_page(offset, limit)
        if space not in ('model', 'paper'):
            raise ValueError('space must be model or paper')
        with self.drawing(name) as doc:
            collection = doc.ModelSpace if space == 'model' else doc.PaperSpace
            total = collection.Count
            items = [optional_read(collection.Item(i), ('Handle', 'ObjectName', 'Layer', 'Visible', 'Color'))[0]
                     for i in range(offset, min(total, offset + limit))]
            return {'document': document_record(doc), 'space': space, 'total': total, 'offset': offset,
                    'entities': items, 'next_offset': offset + len(items) if offset + len(items) < total else None,
                    'scope': 'top-level entities only; block definitions and xrefs are not recursively expanded'}

    def entity_info(self, name, handle):
        handle = validate_handle(handle)
        with self.drawing(name) as doc:
            obj = doc.HandleToObject(handle)
            props, unavailable = optional_read(obj, (
                'Handle', 'ObjectName', 'Layer', 'Visible', 'Color', 'Linetype',
                'StartPoint', 'EndPoint', 'Length', 'Center', 'Radius', 'Normal',
                'StartAngle', 'EndAngle', 'ArcLength', 'Area', 'Coordinates', 'Closed', 'Elevation',
                'TextString', 'InsertionPoint', 'Height', 'Rotation', 'Name', 'EffectiveName',
                'XScaleFactor', 'YScaleFactor', 'ZScaleFactor', 'Volume', 'Centroid',
                'HasAttributes', 'IsDynamicBlock'))
            result = {'document': document_record(doc), 'units': unit_record(doc),
                      'properties': props, 'unavailable_properties': unavailable,
                      'geometry_scope': 'Selected standard ActiveX properties, not a complete CAD/BREP or Plant 3D engineering export'}
            try:
                lower = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_VARIANT, None)
                upper = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_VARIANT, None)
                returned = obj.GetBoundingBox(lower, upper)
                result['world_bounds'] = normalize_bounds(returned, lower.value, upper.value)
            except (pywintypes.com_error, AttributeError) as exc:
                if getattr(exc, 'hresult', None) in BUSY_HRESULTS:
                    raise RuntimeError('AutoCAD became busy during geometry read') from exc
                result['world_bounds'] = None
            if props.get('ObjectName') == 'AcDbPolyline':
                coordinates = props.get('Coordinates', [])
                if isinstance(coordinates, list):
                    count = len(coordinates) // 2
                    result['bulges'] = [float(obj.GetBulge(i)) for i in range(min(count, 200))]
                    result['bulges_truncated'] = count > 200
                    result['coordinate_system'] = '2D polyline coordinates use OCS; apply Normal and Elevation before world-space reconstruction'
            if props.get('HasAttributes'):
                attributes = obj.GetAttributes()
                result['attributes'] = [optional_read(win32com.client.Dispatch(a), ('TagString', 'TextString', 'InsertionPoint'))[0]
                                        for a in attributes[:200]]
                result['attributes_truncated'] = len(attributes) > 200
            return result
