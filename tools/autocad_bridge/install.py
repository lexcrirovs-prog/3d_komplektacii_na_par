"""Install a fixed local release and append only its backed-up Codex entry."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import tomllib
import uuid

VERSION = '2026.09.08.1'
FILES = ('bridge.py', 'policy.py', 'server.py', 'smoke_test.py', 'requirements.txt', 'requirements.lock.txt')
TOOLS = ['autocad_status', 'autocad_list_documents', 'autocad_drawing_info',
         'autocad_list_layers', 'autocad_list_entities', 'autocad_entity_info']


def config_block(python, release, autocad):
    quote = lambda value: json.dumps(value, ensure_ascii=False)
    return ('\n\n# PREMIUM AutoCAD Bridge v' + VERSION + ' | Codex / GPT-6 Astra\n'
            '[mcp_servers.autocad]\ncommand = ' + quote(str(python)) + '\nargs = ' +
            quote([str(release / 'server.py'), '--autocad', str(autocad)]) +
            '\ncwd = ' + quote(str(release)) +
            '\nstartup_timeout_sec = 30\ntool_timeout_sec = 60\nenabled = true\nenabled_tools = ' + quote(TOOLS) + '\n')


def append_config(config, backups, block):
    before = config.read_bytes()
    previous = tomllib.loads(before.decode('utf-8-sig'))
    if 'autocad' in previous.get('mcp_servers', {}):
        raise ValueError('An AutoCAD MCP entry already exists; review it instead of overwriting it')
    after = before + block.encode('utf-8')
    parsed = tomllib.loads(after.decode('utf-8-sig'))
    parsed['mcp_servers'].pop('autocad')
    if 'mcp_servers' not in previous and not parsed['mcp_servers']:
        parsed.pop('mcp_servers')
    if parsed != previous:
        raise ValueError('Unrelated Codex configuration would change')
    backups.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
    backup = backups / f'config-before-autocad-{stamp}-{uuid.uuid4().hex[:8]}.toml'
    shutil.copy2(config, backup)
    if config.read_bytes() != before:
        raise ValueError('Codex settings changed concurrently; inspect before retrying')
    with config.open('ab') as stream:
        stream.write(block.encode('utf-8'))
    if config.read_bytes() != after:
        raise ValueError('Post-write configuration check failed; preserve the backup and inspect current settings')
    return backup


def install(args):
    source = Path(__file__).resolve().parent
    root, config, python, autocad = (Path(getattr(args, key)).resolve()
                                     for key in ('install_root', 'config', 'python', 'autocad'))
    if not python.is_file() or not autocad.is_file():
        raise ValueError('Check isolated Python and AutoCAD executable paths')
    release = root / 'releases' / VERSION
    release.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name in FILES:
        data = (source / name).read_bytes()
        target = release / name
        if target.exists() and target.read_bytes() != data:
            raise ValueError('This release version already contains different bytes; use a new version')
        if not target.exists():
            target.write_bytes(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    backup = append_config(config, root / 'backups', config_block(python, release, autocad))
    receipt = {'version': VERSION, 'author': 'Codex / GPT-6 Astra',
               'installed_at_utc': datetime.now(timezone.utc).isoformat(),
               'release': str(release), 'backup': str(backup), 'source_sha256': hashes,
               'server': 'autocad', 'tool_count': len(TOOLS), 'other_settings_preserved': True,
               'transport': 'stdio', 'read_only': True, 'autocad': str(autocad)}
    (root / 'installation.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('install-root', 'config', 'python', 'autocad'):
        parser.add_argument('--' + name, required=True)
    install(parser.parse_args())
