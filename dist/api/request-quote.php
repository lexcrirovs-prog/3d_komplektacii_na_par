<?php
// 02.10.2026 · Codex / GPT-6. Fixed recipient, server validation; no browser-supplied headers.
// PHP 5.6 compatible because this hosting account also has a legacy CLI runtime.
function quote_validate($data) {
    if (!is_array($data) || !isset($data['consent']) || $data['consent'] !== true) return false;
    $out = array();
    foreach (array('name'=>100,'email'=>254,'phone'=>40,'company'=>160,'comment'=>2000,'website'=>200) as $key=>$limit) {
        $value = isset($data[$key]) ? $data[$key] : '';
        if (!is_string($value) || strlen($value) > $limit*4 || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/', $value)) return false;
        $out[$key] = trim($value);
    }
    if ($out['website'] !== '' || !filter_var($out['email'], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $out['email'])) return false;
    $c = isset($data['config']) ? $data['config'] : null;
    if (!is_array($c) || !isset($c['power'],$c['cascade'],$c['pressure'],$c['trim'],$c['addons'])) return false;
    if (!in_array($c['power'],array(500,1000,1500,2000,2500,3000,3500,4000,5000),true) || !in_array($c['cascade'],array(1,2,3,4,5),true) || !in_array($c['pressure'],array(8,12),true) || !in_array($c['trim'],array('standard','comfort','comfort_plus'),true) || !is_array($c['addons'])) return false;
    $known = array('burner','economizer','deaerator','modulation','gpz','bdv','fv');
    foreach ($c['addons'] as $addon) if (!is_string($addon) || !in_array($addon,$known,true)) return false;
    $c['addons'] = array_values(array_intersect($known,$c['addons']));
    if ($c['power'] >= 4000 && !in_array('gpz',$c['addons'],true)) $c['addons'][] = 'gpz';
    if ($c['power'] < 1500) $c['addons'] = array_values(array_diff($c['addons'],array('economizer')));
    if ($c['trim'] === 'standard') $c['addons'] = array_values(array_diff($c['addons'],array('modulation')));
    $out['config'] = $c;
    return $out;
}
function quote_deaerator($power,$count) {
    if ($count === 1) return $power<1500?'ДА-3':($power<=2500?'ДА-15/4':($power<=3500?'ДА-15/8':'ДА-25/15'));
    $total=$power*$count;
    return $total<=2500?'ДА-3':($total<=5000?'ДА-15/4':($total<=6000?'ДА-15/8':($total<=10000?'ДА-25/15':'ДА-25/25')));
}
function quote_message($data) {
    $c=$data['config'];$trims=array('standard'=>'Стандарт','comfort'=>'Комфорт','comfort_plus'=>'Комфорт+');
    $names=array('burner'=>'Горелка','economizer'=>'Экономайзер','deaerator'=>'Деаэратор','modulation'=>'Модуляция питательной воды','gpz'=>'ГПЗ с электроприводом','bdv'=>'Бак продувки BDV','fv'=>'Сепаратор вторичного пара FV');
    $addons=array();foreach($c['addons'] as $id) $addons[]=$id==='deaerator'?quote_deaerator($c['power'],$c['cascade']):$names[$id];
    $query=array('power'=>$c['power'],'cascade'=>$c['cascade'],'pressure'=>$c['pressure'],'trim'=>$c['trim'],'addons'=>implode(',',$c['addons']));
    $body="Запрос коммерческого предложения PREMIUM\n\n".
        'Мощность одного котла: '.$c['power']." кг/ч\nКоличество котлов: ".$c['cascade']."\nСуммарно: ".($c['power']*$c['cascade'])." кг/ч\nДавление: ".$c['pressure']." бар\nКомплектация: ".$trims[$c['trim']]."\nДополнения: ".($addons?implode(', ',$addons):'нет')."\n\n".
        'Имя: '.$data['name']."\nE-mail: ".$data['email']."\nТелефон: ".$data['phone']."\nКомпания: ".$data['company']."\nКомментарий: ".$data['comment']."\n\n".
        "Согласие на передачу контактов для подготовки предложения: получено\n".
        'Конфигурация: https://prgz.ru/komplektacii4/?'.http_build_query($query,'','&')."\nВерсия: 2026.10.05.9\n";
    return array('to'=>'premium-gas@mail.ru','subject'=>'=?UTF-8?B?'.base64_encode('Запрос КП: '.$c['cascade'].' × PREMIUM S-'.$c['power']).'?=',
        'body'=>chunk_split(base64_encode($body),76,"\r\n"),
        'headers'=>"From: Premium Gas <noreply@prgz.ru>\r\nReply-To: ".$data['email']."\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64");
}
function quote_deliver($message,$transport) {
    return call_user_func($transport,$message['to'],$message['subject'],$message['body'],$message['headers']) === true;
}
function quote_response($code,$payload) {
    http_response_code($code);echo json_encode($payload,JSON_UNESCAPED_UNICODE);exit;
}
// CLI loads only functions for tests. HTTP cannot enable a test recipient or bypass delivery.
if (PHP_SAPI === 'cli') return;
header('Content-Type: application/json; charset=UTF-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {header('Allow: POST');quote_response(405,array('error'=>'Используйте форму запроса КП.'));}
$origin=isset($_SERVER['HTTP_ORIGIN'])?$_SERVER['HTTP_ORIGIN']:'';
if (!in_array($origin,array('https://prgz.ru','https://www.prgz.ru'),true)) quote_response(403,array('error'=>'Откройте форму на сайте prgz.ru.'));
if (!isset($_SERVER['CONTENT_TYPE']) || stripos($_SERVER['CONTENT_TYPE'],'application/json') !== 0) quote_response(415,array('error'=>'Ожидается JSON.'));
$raw=file_get_contents('php://input',false,null,0,16385);
if (strlen($raw)>16384) quote_response(413,array('error'=>'Слишком большой запрос.'));
$data=quote_validate(json_decode($raw,true));
if ($data===false) quote_response(400,array('error'=>'Проверьте e-mail, согласие и параметры комплектации.'));
// Lock per IP; store only timestamps and a message hash, never contact data or the body.
$path=sys_get_temp_dir().'/premium-quote-'.hash('sha256',$_SERVER['REMOTE_ADDR']).'.json';
$lock=fopen($path,'c+');
if (!$lock || !flock($lock,LOCK_EX)) quote_response(503,array('error'=>'Сервис занят. Попробуйте позже или напишите на premium-gas@mail.ru.'));
$state=json_decode(stream_get_contents($lock),true);$now=time();$digest=hash('sha256',json_encode($data));
if (is_array($state) && isset($state['at'],$state['hash'])) {
    if ($state['hash']===$digest && $now-$state['at']<900) quote_response(200,array('status'=>'accepted'));
    if ($now-$state['at']<60) quote_response(429,array('error'=>'Предыдущий запрос уже принят. Подождите минуту перед следующим.'));
}
$message=quote_message($data);
if (!quote_deliver($message,'mail')) quote_response(503,array('error'=>'Почтовый сервер не принял запрос. Данные формы сохранены. Напишите на premium-gas@mail.ru или повторите позже.'));
ftruncate($lock,0);rewind($lock);fwrite($lock,json_encode(array('at'=>$now,'hash'=>$digest)));fflush($lock);flock($lock,LOCK_UN);fclose($lock);
quote_response(200,array('status'=>'accepted'));
