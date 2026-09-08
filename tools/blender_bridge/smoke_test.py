"""Exercise the real MCP handshake and real Blender without touching source assets."""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

EXPECTED_TOOLS = {
    "blender_status", "blender_list_assets", "blender_scene_info", "blender_object_info",
    "blender_import_glb", "blender_create_primitive", "blender_set_transform", "blender_save_scene",
    "blender_list_saved_scenes", "blender_open_saved_scene", "blender_export_glb", "blender_render_preview",
}


def data(result):
    if result.isError:
        raise AssertionError(str(result.content))
    for item in result.content:
        if item.type == "text":
            return json.loads(item.text)
    raise AssertionError("Missing tool JSON response")


async def run(args):
    runtime = Path(args.runtime).resolve()
    runtime.mkdir(parents=True, exist_ok=True)
    assets = Path(args.assets).resolve()
    hashes_before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in assets.glob("*.glb")}
    parameters = StdioServerParameters(command=sys.executable, args=[
        str(Path(__file__).with_name("server.py")), "--blender", args.blender,
        "--assets", str(assets), "--runtime", str(runtime),
    ], env={"PYTHONIOENCODING": "utf-8"})
    evidence = {"bridge_version": "2026.09.08.1", "checks": []}

    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            names = {t.name for t in tools.tools}
            assert names == EXPECTED_TOOLS, names
            evidence["protocol_version"] = initialized.protocolVersion
            evidence["tools"] = sorted(names)
            evidence["checks"].append("initialize_and_exact_12_tool_catalog")
            status = data(await session.call_tool("blender_status"))
            assert status["connected"] and status["blender_version"].startswith("3.3")
            evidence["blender_version"] = status["blender_version"]
            evidence["checks"].append("real_blender_process_connected")
            catalog = data(await session.call_tool("blender_list_assets"))
            assert any(a["name"] == "boiler.glb" for a in catalog["assets"])
            result = data(await session.call_tool("blender_create_primitive", {
                "kind": "cube", "name": "MCP_connection_test", "size": 1.0, "location": [0, 0, 0],
            }))
            assert all(abs(v - 1.0) < 1e-6 for v in result["bounds"]["dimensions"])
            assert Path(result["snapshot"]["path"]).is_file()
            moved = data(await session.call_tool("blender_set_transform", {
                "name": "MCP_connection_test", "location": [1, 2, 3],
            }))
            assert moved["location"] == [1.0, 2.0, 3.0]
            read_back = data(await session.call_tool("blender_object_info", {"name": "MCP_connection_test"}))
            assert read_back["location"] == moved["location"]
            saved = data(await session.call_tool("blender_save_scene", {"name": "connection-test"}))
            saved_again = data(await session.call_tool("blender_save_scene", {"name": "connection-test"}))
            assert saved["path"] != saved_again["path"] and Path(saved["path"]).is_file()
            evidence["checks"].append("create_transform_inspect_and_non_overwriting_save")
            snapshot = saved["filename"]
            count_before = data(await session.call_tool("blender_scene_info"))["object_count"]
            bad_path = await session.call_tool("blender_import_glb", {"filename": "../outside.glb", "scale": 1.0})
            assert bad_path.isError
            forbidden = await session.call_tool("execute_blender_code", {"code": "print('not allowed')"})
            assert forbidden.isError
            bad_output = await session.call_tool("blender_save_scene", {"name": "../outside"})
            assert bad_output.isError
            assert data(await session.call_tool("blender_scene_info"))["object_count"] == count_before
            evidence["checks"].append("traversal_arbitrary_code_and_invalid_output_rejected")

    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            scenes = data(await session.call_tool("blender_list_saved_scenes"))
            assert any(p["filename"] == snapshot for p in scenes["scenes"])
            data(await session.call_tool("blender_open_saved_scene", {"filename": snapshot}))
            restored = data(await session.call_tool("blender_object_info", {"name": "MCP_connection_test"}))
            assert restored["location"] == [1.0, 2.0, 3.0]
            evidence["checks"].append("scene_reopened_after_mcp_reconnection")

    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            imported = data(await session.call_tool("blender_import_glb", {"filename": "boiler.glb", "scale": 0.001}))
            assert 1.0 < max(imported["bounds"]["dimensions"]) < 10.0
            evidence["boiler_dimensions_m"] = imported["bounds"]["dimensions"]
            evidence["boiler_scene"] = data(await session.call_tool("blender_save_scene", {"name": "boiler-mcp-connected"}))["path"]
            exported = data(await session.call_tool("blender_export_glb", {"name": "boiler-mcp-connected"}))
            assert Path(exported["path"]).read_bytes()[:4] == b"glTF"
            evidence["boiler_glb"] = exported["path"]
            rendered = await session.call_tool("blender_render_preview", {"name": "boiler-mcp-preview", "width": 768, "height": 576})
            render_data = data(rendered)
            assert any(item.type == "image" for item in rendered.content)
            assert Path(render_data["path"]).read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
            evidence["preview"] = render_data["path"]
            evidence["checks"].append("real_boiler_import_glb_export_and_png_render")

    hashes_after = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in assets.glob("*.glb")}
    assert hashes_before == hashes_after
    evidence["source_sha256"] = hashes_after
    evidence["checks"].append("all_source_assets_unchanged")
    evidence["status"] = "PASSED_LIVE_LOCAL_MCP"
    output = runtime / "smoke-evidence.json"
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--blender", required=True)
    parser.add_argument("--assets", required=True)
    parser.add_argument("--runtime", required=True)
    asyncio.run(run(parser.parse_args()))
