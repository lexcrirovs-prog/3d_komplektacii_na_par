<?php
// PREMIUM /komplektacii5 · 2026.10.01.1 · Codex / GPT-6.
// PHP 5.6+ syntax for the existing Beget account. No browser-supplied recipient.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function reply($code, $message, $extra = array()) {
    http_response_code($code);
    echo json_encode(array_merge(array('status' => $code < 300 ? 'accepted' : 'error', 'message' => $message), $extra), JSON_UNESCAPED_UNICODE);
    exit;
}
function persist_json($path, $value) {
    $json = json_encode($value, JSON_UNESCAPED_UNICODE);
    $temporary = $path.'.tmp';
    if ($json === false || file_put_contents($temporary,$json) !== strlen($json)) { error_log('PREMIUM persistence write failed: '.basename($path)); return false; }
    @chmod($temporary,0600);
    // Windows readers can briefly deny replacement. Retry only the atomic file
    // operation while holding our global lock; never retry the mail transport.
    $windows = strtoupper(substr(PHP_OS,0,3)) === 'WIN';
    for ($attempt=0; $attempt<6; $attempt++) {
        if (@rename($temporary,$path)) {
            if ($attempt) error_log('PREMIUM persistence rename recovered: '.basename($path).' after '.($attempt+1).' attempts');
            return true;
        }
        $error=error_get_last();
        if (!$windows || $attempt===5) break;
        usleep(10000 * pow(2,$attempt));
    }
    error_log('PREMIUM persistence rename failed: '.basename($path).' '.(isset($error['message'])?$error['message']:''));
    @unlink($temporary);
    return false;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); reply(405, 'Используйте форму запроса КП.'); }
if (!preg_match('#^application/json(?:\s*;\s*charset=utf-8)?\s*$#iD', isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '')) reply(415, 'Требуется JSON.');
if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 12000) reply(413, 'Запрос слишком большой.');
$test = PHP_SAPI === 'cli-server' && getenv('PREMIUM_TEST_MODE') === '1';
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origin && $origin !== 'https://prgz.ru' && !($test && preg_match('#^http://(127\.0\.0\.1|localhost):[0-9]+$#D', $origin))) reply(403, 'Недопустимый источник запроса.');
$raw = file_get_contents('php://input', false, null, 0, 12001);
if (strlen($raw) > 12000) reply(413, 'Запрос слишком большой.');
$body = json_decode($raw, true);
if (!is_array($body)) reply(400, 'Не удалось прочитать запрос.');
$requestId = isset($body['requestId']) && is_string($body['requestId']) ? $body['requestId'] : '';
if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $requestId)) reply(422, 'Некорректный номер запроса.');
$contact = isset($body['contact']) && is_array($body['contact']) ? $body['contact'] : array();
$limits = array('name'=>100,'phone'=>40,'email'=>160,'company'=>160,'comment'=>2000,'website'=>100);
$clean = array();
foreach ($limits as $key=>$limit) {
    $value = isset($contact[$key]) ? $contact[$key] : '';
    if (!is_string($value) || strlen($value) > $limit * 4 || strpos($value, "\0") !== false || preg_match_all('/./us', $value, $characters) > $limit) reply(422, 'Проверьте длину полей формы.');
    $clean[$key] = trim($value);
}
if ($clean['website'] !== '') reply(422, 'Запрос не принят.');
if ($clean['name'] === '' || ($clean['phone'] === '' && $clean['email'] === '')) reply(422, 'Укажите имя и телефон или email.');
if ($clean['email'] !== '' && (!filter_var($clean['email'], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $clean['email']))) reply(422, 'Проверьте email.');
if ($clean['phone'] !== '' && !preg_match('/^[+0-9() .\-]{5,40}$/D', $clean['phone'])) reply(422, 'Проверьте телефон.');
if ($clean['phone'] !== '') {
    $digits = strlen(preg_replace('/\D/','',$clean['phone']));
    if ($digits < 5 || $digits > 15) reply(422, 'Проверьте телефон.');
}
$c = isset($body['configuration']) && is_array($body['configuration']) ? $body['configuration'] : array();
$powers = array(500,1000,1500,2000,2500,3000,3500,4000,5000);
$trims = array('standard'=>'Стандарт','comfort'=>'Комфорт','comfort_plus'=>'Комфорт+');
if (!isset($c['power'],$c['trim'],$c['pressure'],$c['cascade'],$c['addons']) || !is_int($c['power']) || !in_array($c['power'],$powers,true) || !is_string($c['trim']) || !isset($trims[$c['trim']]) || !in_array($c['pressure'],array(8,12),true) || !is_int($c['cascade']) || $c['cascade']<1 || $c['cascade']>5 || !is_array($c['addons'])) reply(422,'Проверьте конфигурацию котельной.');
$allowed = array('burner','economizer','deaerator','modulation','gpz','bdv','fv');
if (array_values($c['addons']) !== $c['addons']) reply(422,'Список модулей должен быть массивом.');
foreach ($c['addons'] as $id) if (!is_string($id) || !in_array($id,$allowed,true)) reply(422,'Неизвестный модуль оборудования.');
if (count(array_unique($c['addons'])) !== count($c['addons'])) reply(422,'Модуль указан дважды.');
$c['addons'] = array_values(array_intersect($allowed,$c['addons']));
if (($c['power']>=4000 && !in_array('gpz',$c['addons'])) || ($c['power']<1500 && in_array('economizer',$c['addons'])) || ($c['trim']==='standard' && in_array('modulation',$c['addons']))) reply(422,'Состав не соответствует правилам совместимости.');
$catalog = json_decode(file_get_contents(__DIR__.'/../data/public-catalog.json'),true);
$key = $c['power'].':'.$c['trim'].':'.$c['pressure'];
if (!is_array($catalog) || !isset($catalog['configurations'][$key])) reply(503,'Каталог временно недоступен. Данные формы сохранены.');
$storage = getenv('PREMIUM_LEAD_STORAGE');
if (!$storage) $storage = dirname(dirname(dirname(__DIR__))).'/.komplektacii5-leads';
if (!is_dir($storage) && !@mkdir($storage,0700,true)) reply(503,'Сервер временно не принимает заявки. Попробуйте позже.');
$public = realpath(dirname(__DIR__)); $resolved = realpath($storage);
$documentRoot = isset($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
if (!$resolved || $resolved === $public || strpos($resolved,$public.DIRECTORY_SEPARATOR)===0 || ($documentRoot && ($resolved === $documentRoot || strpos($resolved,$documentRoot.DIRECTORY_SEPARATOR)===0))) reply(503,'Хранилище запросов недоступно.');
$lock = @fopen($storage.'/requests.lock','c+');
if (!$lock || !flock($lock,LOCK_EX)) reply(503,'Сервер временно занят. Повторите запрос.');
// Only hashes and delivery state are persisted; no customer contact database.
$hash = hash('sha256',json_encode(array($clean,$c),JSON_UNESCAPED_UNICODE));
$path = $storage.'/'.$requestId.'.json';
$state = is_file($path) ? json_decode(file_get_contents($path),true) : null;
if (is_file($path) && (!is_array($state) || !isset($state['hash'],$state['status']) || !in_array($state['status'],array('pending','accepted','failed'),true))) reply(503,'Исход запроса уточняется. Сохраните номер '.$requestId.'.');
if ($state) {
    if ($state['hash'] !== $hash) reply(409,'Номер запроса уже использован. Обновите форму.');
    if ($state['status']==='accepted') reply(200,'Заявка принята.',array('requestId'=>$requestId));
    if ($state['status']==='pending') reply(409,'Запрос уже передаётся. Уточните результат по номеру '.$requestId.'.');
}
$now = time();
$globalRatePath = $storage.'/rate-global.json';
$globalRate = is_file($globalRatePath) ? json_decode(file_get_contents($globalRatePath),true) : array();
if (!is_array($globalRate)) reply(503,'Сервер временно не принимает заявки. Попробуйте позже.');
$globalRecent = array(); foreach ($globalRate as $t) if ($t > $now-60) $globalRecent[]=$t;
// A shared lock covers every visitor. Stay below Beget's 30 messages/minute.
if (count($globalRecent)>=25) { header('Retry-After: 60'); reply(429,'Слишком много запросов. Повторите через минуту.'); }
$ratePath = $storage.'/rate-'.hash('sha256',isset($_SERVER['REMOTE_ADDR'])?$_SERVER['REMOTE_ADDR']:'unknown').'.json';
$rate = is_file($ratePath) ? json_decode(file_get_contents($ratePath),true) : array();
if (!is_array($rate)) reply(503,'Сервер временно не принимает заявки. Попробуйте позже.');
$recent = array(); foreach ($rate as $t) if ($t > $now-600) $recent[]=$t;
if (count($recent)>=5) { header('Retry-After: 600'); reply(429,'Слишком много запросов. Повторите через 10 минут.'); }
$recent[]=$now;
$globalRecent[]=$now;
if (!persist_json($ratePath,$recent) || !persist_json($globalRatePath,$globalRecent)) reply(503,'Не удалось принять запрос. Попробуйте позже.');
$text = "Запрос КП с PREMIUM /komplektacii5\nНомер: ".$requestId."\n\n";
$text .= 'Контакт: '.$clean['name']."\nТелефон: ".$clean['phone']."\nEmail: ".$clean['email']."\nКомпания: ".$clean['company']."\nЗадача: ".$clean['comment']."\n\n";
$text .= $c['cascade'].' × S-'.$c['power'].' · '.$trims[$c['trim']].' · '.$c['pressure']." бар\nСуммарная производительность: ".($c['cascade']*$c['power'])." кг/ч\n\nСостав:\n";
$text .= 'Котёл PREMIUM S-'.$c['power'].' — '.$c['cascade']." шт.\n";
foreach ($catalog['configurations'][$key] as $rowKey) {
    $r=$catalog['rows'][$rowKey]; if ($r['option'] && !in_array($r['option'],$c['addons'])) continue;
    $label=$r['itemId']==='pr200' ? 'Шкаф управления «'.$trims[$c['trim']].'» с ПР200' : $catalog['items'][$r['itemId']]['label'];
    $text.=$label.' — '.($r['qty']*$c['cascade'])." шт.\n";
}
foreach ($catalog['addons'] as $a) {
    if (!in_array($a['id'],$c['addons']) || !empty($a['includedInCatalogRows'])) continue;
    $label=$a['label']; if ($a['id']==='deaerator') $label.=' '.$catalog['deaeratorLabels'][$catalog['deaeratorSelections'][$c['power'].':'.$c['cascade']]];
    $text.=$label.' — '.($a['scope']==='shared'?1:$c['cascade'])." шт.\n";
}
if ($c['cascade']>1) foreach ($catalog['cascadeRows'] as $r) $text.=$r['label'].' — '.$r['qty']." шт.\n";
$text.="\nКонфигурация: https://prgz.ru/komplektacii5/?".http_build_query(array('power'=>$c['power'],'trim'=>$c['trim'],'pressure'=>$c['pressure'],'cascade'=>$c['cascade'],'addons'=>implode(',',$c['addons']),'mode'=>'director'));
$text.="\nВерсия сайта: 2026.10.01.1\nИсточник каталога: ".$catalog['source']['commit']."\n";
$pending=array('hash'=>$hash,'status'=>'pending','createdAt'=>$now);
if (!persist_json($path,$pending)) reply(503,'Не удалось принять запрос. Попробуйте позже.');
$subject='=?UTF-8?B?'.base64_encode('Запрос КП PREMIUM S-'.$c['power'].' · '.$requestId).'?=';
$headers="From: PREMIUM <no-reply@prgz.ru>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
if ($clean['email']!=='') $headers.='Reply-To: '.$clean['email']."\r\n";
if ($test) {
    $transport=getenv('PREMIUM_MAIL_TRANSPORT');
    $sent=$transport==='capture' && file_put_contents($storage.'/'.$requestId.'.test-email.txt',$text)!==false;
} else $sent=@mail('premium-gas@mail.ru',$subject,$text,$headers);
$pending['status']=$sent?'accepted':'failed';
if (!persist_json($path,$pending)) reply(503,'Исход отправки уточняется. Сохраните номер '.$requestId.'.');
flock($lock,LOCK_UN);fclose($lock);
if (!$sent) reply(502,'Почтовый сервер не принял запрос. Данные формы сохранены. Повторите попытку.');
reply(200,'Заявка принята.',array('requestId'=>$requestId));
