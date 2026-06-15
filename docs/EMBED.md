# Встраивание конфигуратора в kotelpremium.ru

Цель — чтобы посетитель `kotelpremium.ru/katalog/parovye-kotly` пользовался
конфигуратором, **не покидая периметр сайта**.

## Рекомендация: iframe под своим доменом

Приложение собирается в один самодостаточный файл `dist/index.html`
(плагин `vite-plugin-singlefile`, ~14 МБ, все ассеты внутри). Поэтому проще всего:

1. Соберите: `npm run build` → получите `dist/index.html`.
2. Разместите файл **на своём домене**, например `https://kotelpremium.ru/configurator/`
   (а не на `kotelgavno.ru`). Тогда пользователь визуально и по адресу остаётся у вас.
3. Встройте iframe на страницу каталога:

```html
<div class="boiler-cfg-wrap" style="position:relative;width:100%;height:80vh;min-height:560px">
  <iframe
    src="https://kotelpremium.ru/configurator/"
    title="3D-конфигуратор парового котла"
    style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:16px"
    allow="fullscreen"
    loading="lazy"
  ></iframe>
</div>
```

## Диплинк из карточки котла (URL-параметры)

Конфигуратор читает параметры запроса при старте:

| Параметр | Значения | Действие |
|---|---|---|
| `config` | `standard` / `comfort` / `comfort_plus` | стартовая комплектация |
| `addons` | через запятую: `deaerator,economizer,burner` | включённые дополнения |
| `start` | любое значение | пропустить экран входа |

Пример: кнопка «Подобрать комплектацию» в карточке ведёт на
`https://kotelpremium.ru/configurator/?config=comfort_plus&addons=deaerator,economizer`.

## Получение заявок «Заказать КП»

При отправке формы конфигуратор делает `postMessage` в родительское окно.
Поймайте его на странице kotelpremium.ru (и **проверьте `event.origin`**):

```html
<script>
  window.addEventListener('message', function (e) {
    // Подставьте реальный origin, откуда отдаётся iframe:
    if (e.origin !== 'https://kotelpremium.ru') return;
    if (!e.data || e.data.type !== 'boiler-configurator:lead') return;

    var lead = e.data.payload; // { name, email, phone, company, config, addons[], source, ts }
    // → отправьте в свою CRM / форму / аналитику (цель Я.Метрики и т.п.)
    console.log('Заявка из конфигуратора:', lead);
  });
</script>
```

## Отправка заявки на backend (опционально)

Если нужно слать заявки напрямую из конфигуратора на сервер/почтовый сервис,
задайте эндпоинт при сборке (он получит POST с тем же JSON-payload):

```bash
# .env (или переменная окружения сборки)
VITE_LEAD_ENDPOINT=https://kotelpremium.ru/api/lead
```

Без `VITE_LEAD_ENDPOINT` заявка уходит только через `postMessage` (см. выше).

## Когда переезжать с iframe на нативную интеграцию

iframe закрывает задачу «не уводить пользователя». Нативная пересборка
конфигуратора в платформу kotelpremium.ru оправдана позже — ради SEO
**окружающего маркетингового текста**; сам 3D-модуль и так остаётся отдельным
самодостаточным блоком.
