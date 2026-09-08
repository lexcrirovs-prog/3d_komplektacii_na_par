"""Install this reviewed release and append one backed-up Codex MCP entry."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import tomllib
import uuid

VERSION = "2026.09.08.1"
FILES = ("client.py", "policy.py", "worker.py", "server.py", "smoke_test.py", "requirements.txt", "requirements.lock.txt")
TOOLS = ["blender_status", "blender_list_assets", "blender_scene_info", "blender_object_info",
         "blender_import_glb", "blender_create_primitive", "blender_set_transform", "blender_save_scene",
         "blender_list_saved_scenes", "blender_open_saved_scene", "blender_export_glb", "blender_render_preview"]


def install(args):
    source = Path(__file__).resolve().parent
    root = Path(args.install_root).resolve()
    config = Path(args.config).resolve()
    blender, python, assets = (Path(p).resolve() for p in (args.blender, args.python, args.assets))
    if not blender.is_file() or not python.is_file() or not assets.is_dir():
        raise ValueError("Check Blender, isolated Python and asset paths before installation")
    before = config.read_bytes()
    previous = tomllib.loads(before.decode("utf-8-sig"))
    if "blender" in previous.get("mcp_servers", {}):
        raise ValueError("A Blender MCP configuration already exists; review it instead of overwriting it")
    release = root / "releases" / VERSION
    release.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name in FILES:
        data = (source / name).read_bytes()
        target = release / name
        if target.exists() and target.read_bytes() != data:
            raise ValueError("This version is already installed with different bytes; choose a new release version")
        if not target.exists():
            target.write_bytes(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    runtime = root / "runtime"
    runtime.mkdir(exist_ok=True)
    command_args = [str(release / "server.py"), "--blender", str(blender), "--assets", str(assets), "--runtime", str(runtime)]
    quote = lambda value: json.dumps(value, ensure_ascii=False)
    block = "\n\n# PREMIUM Blender Bridge v" + VERSION + " | Codex / GPT-6 Astra\n[mcp_servers.blender]\n"
    block += "command = " + quote(str(python)) + "\n"
    block += "args = " + quote(command_args) + "\n"
    block += "cwd = " + quote(str(release)) + "\n"
    block += "startup_timeout_sec = 30\ntool_timeout_sec = 180\nenabled = true\n"
    block += "enabled_tools = " + quote(TOOLS) + "\n"
    after = before + block.encode("utf-8")
    parsed = tomllib.loads(after.decode("utf-8-sig"))
    inserted = parsed["mcp_servers"].pop("blender")
    if "mcp_servers" not in previous and not parsed["mcp_servers"]:
        parsed.pop("mcp_servers")
    if parsed != previous:
        raise ValueError("Unrelated Codex configuration changed")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    backup = root / "backups" / f"config-before-blender-{stamp}-{uuid.uuid4().hex[:8]}.toml"
    backup.parent.mkdir(exist_ok=True)
    shutil.copy2(config, backup)
    # Fail if another task or the app changed the settings during preparation.
    if config.read_bytes() != before:
        raise ValueError("Codex configuration changed during installation; review and retry")
    with config.open("ab") as stream:
        stream.write(block.encode("utf-8"))
    if config.read_bytes() != after:
        raise ValueError("Configuration verification failed; preserve backup and inspect current configuration")
    receipt = {"version": VERSION, "author": "Codex / GPT-6 Astra", "installed_at_utc": stamp,
               "release": str(release), "runtime": str(runtime), "backup": str(backup),
               "source_sha256": hashes, "server": "blender", "tool_count": len(TOOLS),
               "other_settings_preserved": True, "transport": "stdio", "config_entry": inserted}
    (root / "installation.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("install-root", "config", "blender", "python", "assets"):
        parser.add_argument("--" + name, required=True)
    install(parser.parse_args())
