"""Read-only live MCP verification against a separately created synthetic DWG."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def verify(args):
    fixture = json.loads(Path(args.fixture).read_text(encoding='utf-8'))
    dwg = Path(fixture['dwg'])
    before = hashlib.sha256(dwg.read_bytes()).hexdigest()
    document = fixture['document_name']
    parameters = StdioServerParameters(command=sys.executable,
                                      args=[str(Path(args.server).resolve()), '--autocad', args.autocad])
    evidence = {'tested_at_utc': datetime.now(timezone.utc).isoformat(), 'version': '2026.09.08.2',
                'author': 'Codex / GPT-6 Astra', 'fixture': str(Path(args.fixture).resolve())}
    async with stdio_client(parameters) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            initialized = await session.initialize()
            evidence['protocol_version'] = initialized.protocolVersion
            catalog = await session.list_tools()
            expected_tools = {'autocad_status', 'autocad_list_documents', 'autocad_drawing_info',
                              'autocad_list_layers', 'autocad_list_entities', 'autocad_entity_info'}
            assert {t.name for t in catalog.tools} == expected_tools
            assert all(t.annotations.readOnlyHint and t.annotations.destructiveHint is False for t in catalog.tools)
            evidence['tools'] = sorted(expected_tools)

            async def call(name, arguments=None):
                result = await session.call_tool(name, arguments or {})
                assert not result.isError, result.model_dump(mode='json')
                data = result.structuredContent
                if data is None:
                    data = json.loads(next(c.text for c in result.content if c.type == 'text'))
                return data

            status = await call('autocad_status')
            assert status['connected'] and status['ready'] and status['read_only']
            assert status['bridge_version'] == '2026.09.08.2'
            evidence['status'] = status
            documents = await call('autocad_list_documents')
            assert any(d['name'] == document for d in documents['documents'])
            info_before = await call('autocad_drawing_info', {'document_name': document})
            assert info_before['units']['INSUNITS'] == 4
            assert info_before['model_space_count'] == fixture['expected']['model_space_count']
            layers = await call('autocad_list_layers', {'document_name': document})
            assert any(layer['Name'] == 'MCP_CONNECTION_TEST' for layer in layers['layers'])
            page1 = await call('autocad_list_entities', {'document_name': document, 'limit': 2})
            page2 = await call('autocad_list_entities', {'document_name': document, 'offset': 2, 'limit': 2})
            assert page1['next_offset'] == 2 and page2['next_offset'] == 4
            assert not ({e['Handle'] for e in page1['entities']} & {e['Handle'] for e in page2['entities']})
            objects = {}
            for kind, handle in fixture['handles'].items():
                objects[kind] = await call('autocad_entity_info', {'document_name': document, 'handle': handle})
            for kind, field, expected in [('line', 'Length', 1000.0), ('circle', 'Radius', 250.0), ('box', 'Volume', 360000000.0)]:
                assert math.isclose(objects[kind]['properties'][field], expected, rel_tol=1e-9)
            bounds = objects['box']['world_bounds']
            assert bounds is not None
            assert all(math.isclose(upper - lower, expected, abs_tol=1e-6)
                       for lower, upper, expected in zip(bounds['min'], bounds['max'], fixture['expected']['box_extents']))
            assert objects['polyline']['bulges'][0] == 0.5
            assert objects['block']['attributes'][0]['TextString'] == 'MCP-001'
            assert objects['block']['constant_attributes_read'] is False
            assert 'editable' in objects['block']['attributes_scope']
            assert objects['text']['properties']['TextString'] == 'MCP CONNECTION CHECK 2026-09-08'
            for name, arguments in [
                ('autocad_entity_info', {'document_name': document, 'handle': '(command "erase")'}),
                ('autocad_drawing_info', {'document_name': 'not-an-open-drawing.dwg'}),
                ('autocad_list_entities', {'document_name': document, 'limit': 201}),
                ('autocad_execute_command', {'command': 'ERASE'})]:
                rejected = await session.call_tool(name, arguments)
                assert rejected.isError, f'Unexpectedly accepted {name}'
            info_after = await call('autocad_drawing_info', {'document_name': document})
            assert info_after == info_before
            assert await call('autocad_list_documents') == documents
            evidence['checks'] = {'initialization': True, 'read_only_catalog': True, 'layers': True,
                                  'entity_pagination': True, 'line_circle_solid_dimensions': True,
                                  'polyline_bulge': True, 'block_attributes': True, 'text': True,
                                  'invalid_inputs_rejected': True, 'document_state_unchanged': True}
            evidence['measurements'] = {'line_length_mm': objects['line']['properties']['Length'],
                                        'circle_radius_mm': objects['circle']['properties']['Radius'],
                                        'box_volume_mm3': objects['box']['properties']['Volume'],
                                        'box_world_bounds_mm': bounds}
    evidence['dwg_hash_unchanged'] = hashlib.sha256(dwg.read_bytes()).hexdigest() == before
    assert evidence['dwg_hash_unchanged']
    evidence['result'] = 'PASSED_LIVE_LOCAL_MCP'
    output = Path(args.evidence)
    if output.exists():
        raise FileExistsError('Use a new evidence filename')
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ('autocad', 'server', 'fixture', 'evidence'):
        parser.add_argument('--' + key, required=True)
    asyncio.run(verify(parser.parse_args()))
