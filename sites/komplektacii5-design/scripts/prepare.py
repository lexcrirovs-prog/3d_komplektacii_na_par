"""Prepare the supplied design for the explicitly requested Beget path.

Added 2026-10-22 by Codex / GPT-6. Archive documents are source material.
Only browser assets are published; uploads and handoff documents stay private.
"""
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import urllib.request
import zipfile
import sys

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
VERSION = '2026.10.22.1'
VARIANTS = [
    ('A', 'Панель комплектации', 'Карточки опций с переключателями. Выбор узла прямо в 3D.'),
    ('B', 'Пакеты и сравнение', 'Три готовые комплектации и наглядная таблица различий.'),
    ('C', 'Спецификация', 'Состав оборудования по строкам с подсветкой узлов в модели.'),
]


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8', newline='\n')


def download(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read()


def prepare(archive):
    PUBLIC.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            rel = PurePosixPath(entry.filename)
            assert not rel.is_absolute() and '..' not in rel.parts and '\\' not in entry.filename
            if entry.is_dir():
                continue
            # Export only runtime assets, never internal handoff instructions or duplicate uploads.
            allowed = (
                (rel.parts[0] in {'models', 'assets'} and rel.suffix in {'.js', '.glb', '.png'})
                or (rel.parts[0] == '_ds' and rel.name in {'styles.css', '_ds_bundle.js'})
                or entry.filename in {'support.js', 'boiler-viewer.js'}
                or entry.filename.endswith('.dc.html')
            )
            if allowed:
                target = PUBLIC / str(rel)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(bundle.read(entry))

    # Keep the generated design runtime intact and resolve its pinned React dependencies locally.
    resources = {}
    for name, url, expected in [
        ('react.production.min.js', 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
         'DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z'),
        ('react-dom.production.min.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
         'gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1'),
    ]:
        target = PUBLIC / 'vendor' / name
        data = target.read_bytes() if target.exists() else download(url)
        assert base64.b64encode(hashlib.sha384(data).digest()).decode() == expected, name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        resources[url] = './vendor/' + name
    write(PUBLIC / 'vendor' / 'runtime.js',
          '// Added 2026-10-22, Codex / GPT-6: pinned, SRI-verified local React.\n'
          'window.__resources = ' + json.dumps(resources) + ';\n')

    # Copy only the required Three.js ES modules and their relative import closure.
    three_meta = PUBLIC / 'vendor' / 'three' / 'package.json'
    if not three_meta.exists():
        data = download('https://registry.npmjs.org/three/-/three-0.184.0.tgz')
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as package:
            names = {m.name: m for m in package.getmembers() if m.isfile()}
            todo = ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js',
                    'examples/jsm/controls/OrbitControls.js', 'examples/jsm/libs/meshopt_decoder.module.js',
                    'examples/jsm/environments/RoomEnvironment.js', 'LICENSE', 'package.json']
            seen = set()
            while todo:
                name = todo.pop()
                if name in seen:
                    continue
                seen.add(name)
                member = package.extractfile(names['package/' + name])
                content = member.read()
                target = PUBLIC / 'vendor' / 'three' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                if name.endswith('.js'):
                    for imp in re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]', content.decode()):
                        if imp.startswith('.'):
                            import posixpath
                            dep = posixpath.normpath(posixpath.join(posixpath.dirname(name), imp))
                            assert not dep.startswith('../')
                            todo.append(dep)
        write(ROOT / 'docs' / 'vendor-provenance.json', json.dumps({
            'threeVersion': '0.184.0', 'registryTarballSha256': hashlib.sha256(data).hexdigest(),
            'copiedModules': sorted(seen), 'reactVersion': '18.3.1', 'reactVerifiedAgainstArchiveSRI': True,
        }, indent=2))
    license_path = PUBLIC / 'vendor' / 'REACT-LICENSE.txt'
    if not license_path.exists():
        license_path.write_bytes(download('https://unpkg.com/react@18.3.1/LICENSE'))

    viewer = PUBLIC / 'boiler-viewer.js'
    code = viewer.read_text('utf-8')
    assert "const U = 'https://unpkg.com/three@0.184.0/';" in code
    code = code.replace("const U = 'https://unpkg.com/three@0.184.0/';",
                        "// Changed 2026-10-22 by Codex / GPT-6: serve pinned modules from this release.\n"
                        "const U = new URL('./vendor/three/', document.baseURI).href;")
    write(viewer, code)

    for letter, title, _ in VARIANTS:
        path = PUBLIC / f'Вариант {letter} - {title}.dc.html'
        html = path.read_text('utf-8').replace('<html>', '<html lang="ru">')
        html = html.replace('<script src="./support.js"></script>',
            f'<title>PREMIUM · {title} · вариант {letter}</title>\n'
            '<script src="./vendor/runtime.js"></script>\n<script src="./support.js"></script>')
        html = re.sub(r'<a class="(v[a-c]-desktop)" href="tel:\+78452000000"[^>]*>\{\{ phone \}\}</a>',
                      '<a class="\\1" href="./" style="color:inherit">Все варианты</a>', html)
        html = re.sub(r'(<form\b[^>]*>)',
            r'\1<p role="status" style="font-size:13px;margin:0;color:var(--color-neutral-700)">'
            'Демонстрационная форма. Контакты не сохраняются и не отправляются.</p>', html)
        html = html.replace('type="submit" class="btn btn-primary blueprint"',
                            'type="submit" disabled="{{ true }}" class="btn btn-primary blueprint"')
        html = html.replace('Отправить запрос</button>', 'Отправка в демоверсии отключена</button>')
        # Preserve the design's modal layout without making false delivery promises.
        html = html.replace('Запрос передан в отдел продаж', 'Демонстрация формы')
        html = html.replace('Ссылка на вашу сборку сохранена в запросе — инженер откроет ту же конфигурацию и те же узлы в 3D.',
                            'Контакты не сохраняются и не отправляются.')
        html = html.replace('Режим менеджера</sc-if>', 'Демо менеджера</sc-if>')
        html = html.replace('Менеджер · выйти</sc-if>', 'Демо · выйти</sc-if>')
        if letter == 'C':
            html = html.replace('grid-template-columns:1.4fr 1fr 1fr 1fr;',
                'grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(208px,1.5fr) minmax(0,.9fr);')
        html = html.replace('<body>',
            '<body>\n<nav aria-label="Варианты дизайна" style="display:flex;gap:16px;flex-wrap:wrap;'
            'padding:10px 16px;border-bottom:1px solid #ccd4dc;font:12px system-ui;background:#e8edf1;color:#1d1f20">'
            '<a href="./" style="color:inherit">← Все три варианта</a>'
            f'<span>Вариант {letter} · {title}</span><span>Демо · {VERSION} · 22.10.2026</span></nav>')
        write(path, html)

    configurator = PUBLIC / 'models' / 'configurator.js'
    code = configurator.read_text('utf-8')
    old = "submit: e => { e.preventDefault(); set({ sent: true }); },"
    assert old in code
    code = code.replace(old,
        '// Changed 2026-10-22 by Codex / GPT-6: a design preview never claims delivery.\n'
        '    submit: e => { e.preventDefault(); },')
    code = code.replace("sentTitle: s.mode === 'call' ? 'Инженер перезвонит в течение рабочего дня' : 'Цена и спецификация уйдут на вашу почту',",
                        "sentTitle: 'Демонстрация формы — данные не отправлены',")
    write(configurator, code)

    # The original design canvas is retained as an optional separate comparison board.
    board = PUBLIC / 'Варианты сайта.dc.html'
    html = board.read_text('utf-8').replace('<html>', '<html lang="ru">')
    html = html.replace('<script src="./support.js"></script>',
        '<title>PREMIUM · Полотно вариантов дизайна</title>\n'
        '<script src="./vendor/runtime.js"></script>\n<script src="./support.js"></script>')
    write(board, html)
    write(PUBLIC / 'version.json', json.dumps({
        'version': VERSION, 'date': '2026-10-22', 'executor': 'Codex / GPT-6',
        'target': 'https://prgz.ru/komplektacii5/', 'kind': 'interactive-design-preview',
        'landing': 'all-three-variants', 'archiveSha256': hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest(),
        'leadDeliveryEnabled': False,
    }, ensure_ascii=False, indent=2) + '\n')
    write(PUBLIC / '.htaccess', '''# Added 2026-10-22 by Codex / GPT-6, release 2026.10.22.1.
DirectoryIndex index.html
Options -Indexes
AddDefaultCharset UTF-8
AddType model/gltf-binary .glb
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript text/javascript application/json model/gltf-binary
</IfModule>
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  <FilesMatch "\\.(html|js|css|json)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
''')
    print(json.dumps({'version': VERSION, 'publicFiles': sum(p.is_file() for p in PUBLIC.rglob('*')),
                      'publicBytes': sum(p.stat().st_size for p in PUBLIC.rglob('*') if p.is_file())}))


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
