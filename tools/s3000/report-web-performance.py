"""Collect measured results without replacing unavailable metrics with estimates."""
from pathlib import Path
import json
import statistics
import shutil

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/performance'
OUT.mkdir(parents=True,exist_ok=True)
measurements={}
for label,folder in [('before','baseline-clean'),('after','final')]:
    measurements[label]={}
    for profile in ['desktop','mobile']:
        rows=json.loads((ROOT/f'artifacts/performance/{folder}/{profile}.json').read_text(encoding='utf-8'))
        assert len(rows)==4 and all(not r['errors'] for r in rows)
        # Source JSON already omits external request IDs and query parameters.
        shutil.copyfile(ROOT/f'artifacts/performance/{folder}/{profile}.json',OUT/f'{label}-{profile}.json')
        values={}
        for cache in ['cold','warm']:
            samples=[r for r in rows if r['cache']==cache]
            values[cache]={k:statistics.median(r[k] for r in samples) for k in ['firstSceneMs','domContentLoadedMs','transferBytes','heapPeakBytes']}
            values[cache]['samples']=len(samples)
        values['rotation']={k:statistics.median(r['rotation'][k] for r in rows) for k in ['fps','p95Ms','meanDrawCalls','meanTrianglesAllPasses']}
        fps=[r['rotation'].get('renderedFps',r['rotation']['fps']) for r in rows]
        values['rotation'].update(renderedFpsMedian=statistics.median(fps),renderedFpsRange=[min(fps),max(fps)])
        values['idleDrawFrames']=[r['idleDrawFrames'] for r in rows]
        buffers=[r['webglBufferPeakBytes'] for r in rows if 'webglBufferPeakBytes' in r]
        values['webglBufferPeakBytesRange']=[min(buffers),max(buffers)] if buffers else None
        measurements[label][profile]=values
report={'version':'2026.09.09.1','date':'2026-09-09','executor':'Codex / GPT-6','status':'PASSED_LOCAL_COMPARISON','hardware':{'cpu':'Intel Core i7-12700K','gpu':'Intel UHD Graphics 770 / ANGLE D3D11','browser':'Chrome 152.0.7977.83','os':'Windows'},'physicalPhone':'NOT_RUN','fullBrowserOrGpuPeakMemory':'NOT_MEASURED','ci':'CI_NOT_CONFIGURED','method':'s3000-performance-design-20260909.md','measurements':measurements}
(ROOT/'docs/s3000-performance-20260909.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
rows=[]
for profile,label in [('desktop','Компьютер · 10 Мбит/с · 100 мс'),('mobile','Мобильный размер · 4 Мбит/с · 150 мс')]:
    a=measurements['before'][profile];b=measurements['after'][profile]
    for name,key,unit in [('Холодный вход','cold','с'),('Повторный вход','warm','с')]:
        rows.append(f"| {label} · {name} | {a[key]['firstSceneMs']/1000:.2f} {unit} | {b[key]['firstSceneMs']/1000:.2f} {unit} |")
    rows.append(f"| {label} · отрисованные кадры/с, медиана | {a['rotation']['renderedFpsMedian']:.1f} | {b['rotation']['renderedFpsMedian']:.1f} |")
text='''# S-3000: измеренное сравнение до и после

Версия **2026.09.09.1 от 9 сентября 2026**. Исполнитель: **Codex / GPT-6**.
На каждый размер экрана — два холодных и два повторных входа. В таблице медианы. Параметры сети, экран, Chrome и аппаратный рендер совпадают; другие пользовательские приложения не закрывались, фоновая нагрузка не фиксировалась.

| Измерение | До · 2026.09.08.4 | После · 2026.09.09.1 |
|---|---:|---:|
'''+ '\n'.join(rows)+'''

В исходной сцене 3 164 288 треугольников; в производной — 1 163 573 (−63,2%). Во время вращения учитывались все проходы WebGL: 5 473 766 → 1 076 937 треугольников/кадр, 319 → 160 вызовов. Число логических компонентов остается 49. В покое после оптимизации измерено 0 кадров отрисовки за контрольные 1,5 секунды.

В данной конфигурации Chrome холодная передача составила 23 865 840 → 10 627 607 байт. При повторном входе: 23 865 840 → 600 байт. JS/CSS/GLB новой версии повторно получены из HTTP-кеша. Объем браузера отличается от сжатых серверных файлов: локальное ПО проверки трафика изменяет HTML. Его не отключали. Поэтому это результат данной машины и методики, не универсальная скорость хостинга.

Пик JS heap на холодном входе: около 169 МБ → 73 МБ на компьютере. При повторном входе новая версия сохраняет больше данных в памяти кеша: около 151 МБ. Пик vertex/index buffers новой версии — около 39–41 МБ; исходной, на мобильном размере — 72–82 МБ. Это **не полная память процесса или видеокарты**: текстуры, драйвер и RSS отдельно не измерены.

Для раннего промежуточного варианта с тем же финальным кодом отрисовки измерено около 72 кадров/с. В окончательном повторном прогоне: 49,7–53,2 на компьютере и 38,4–54,7 на мобильном размере. Отчет использует окончательный прогон; лучший результат не подменяет весь диапазон. Физический телефон не тестировался.

## Внешний вид и поведение

Сравнены 10 пар снимков: общий вид, шкаф, приборы, кабели, горелка, обе схемы питания, экономайзер, все модули и деаэратор. Проверены исходные изображения логотипа и оцинковки, материалы, положение каждого компонента и сохранение габаритов после декодирования. Среднее поканальное отличие снимков в выбранной области — 0,09–0,93 из 255; это описательная метрика, не допуск формы.

![Десять ракурсов до и после](performance/all-views.png)

Крупные планы: [горелка](performance/burner.png), [кабели](performance/cables.png), [приборы](performance/instruments.png), [питание через экономайзер](performance/feed-economizer.png), [прямое питание](performance/feed-direct.png), [деаэратор](performance/deaerator.png).

Браузер проверяет реальные visible-флаги обеих ветвей питания, выбор мышью, все 27 строк оборудования, отключение навесного оборудования и горелки, URL после перезагрузки, отсутствие горизонтального переполнения и плавный переход камеры после простоя. Приемка на staging и после публикации хранится отдельно и привязана к SHA-256 манифеста.

## Воспроизведение

Методика: [параметры, ограничения и решения](s3000-performance-design-20260909.md). Сырые результаты: [до, компьютер](performance/before-desktop.json), [после, компьютер](performance/after-desktop.json), [до, мобильный размер](performance/before-mobile.json), [после, мобильный размер](performance/after-mobile.json). CLI-сценарии находятся в `tools/s3000`.

Подробная сборка версии 2026.09.08.4 и ее Blender-файл сохранены. Основной URL остается https://prgz.ru/komplektacii4/. Протокол публикации указывает фактический адрес архива и способ отката. CI не настроен; проверки выполнены локально и отдельно на опубликованной странице.
'''
(ROOT/'docs/s3000-performance-20260909.md').write_text(text,encoding='utf-8')
print(json.dumps(measurements))
