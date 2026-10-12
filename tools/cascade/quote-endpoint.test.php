<?php
// Tests run through CLI with an injected fake mail transport. No messages are sent.
require isset($argv[1]) ? $argv[1] : __DIR__.'/../../public/api/request-quote.php';
function check($condition,$message) { if (!$condition) { fwrite(STDERR,$message."\n");exit(1); } }
$data=array('email'=>'buyer@example.com','consent'=>true,'name'=>'Покупатель','comment'=>'Расчёт для производства','config'=>array('power'=>4000,'cascade'=>3,'pressure'=>12,'trim'=>'comfort','addons'=>array('burner','deaerator','modulation','bdv')));
$valid=quote_validate($data);check($valid!==false,'Valid request rejected');
check(in_array('gpz',$valid['config']['addons'],true),'Required GPZ missing');
$message=quote_message($valid);$body=base64_decode($message['body']);
check($message['to']==='premium-gas@mail.ru','Wrong recipient');
foreach(array('12000 кг/ч','ДА-25/25','Количество котлов: 3','12 бар','Комфорт','Модуляция','buyer@example.com','Расчёт для производства') as $s)check(strpos($body,$s)!==false,'Missing '.$s);
$calls=0;$fake=function($to,$subject,$body,$headers) use (&$calls) {$calls++;return true;};
check(quote_deliver($message,$fake)&&$calls===1,'Transport acceptance lost');
check(!quote_deliver($message,function(){return false;}),'Failed transport reported success');
foreach(array('consent'=>false,'email'=>"buyer@example.com\r\nBcc: attacker@example.com",'website'=>'spam','comment'=>str_repeat('x',8001)) as $key=>$value) {$bad=$data;$bad[$key]=$value;check(quote_validate($bad)===false,'Accepted invalid '.$key);}
foreach(array('cascade'=>6,'power'=>6000,'pressure'=>16,'trim'=>'other','addons'=>array('unknown')) as $key=>$value){$bad=$data;$bad['config'][$key]=$value;check(quote_validate($bad)===false,'Accepted invalid config '.$key);}
$low=$data;$low['config']=array('power'=>500,'cascade'=>5,'pressure'=>8,'trim'=>'standard','addons'=>array('economizer','modulation'));
check(quote_validate($low)['config']['addons']===array(),'Unavailable options retained');
foreach(array('standard','comfort','comfort_plus') as $trim)foreach(array(1,2,5) as $count)foreach(array(false,true) as $modulation)foreach(array(false,true) as $cabinet) {
 $request=$data;$request['config']=array('power'=>3000,'cascade'=>$count,'pressure'=>12,'trim'=>$trim,'cascadeCabinet'=>$cabinet,'addons'=>array_merge(array('economizer'),$modulation?array('modulation'):array()));
 $normalized=quote_validate($request);$c=$normalized['config'];
 check(in_array('modulation',$c['addons'],true)===($trim==='comfort_plus'||$trim==='comfort'&&$modulation),'Modulation rule mismatch');
 check(in_array('economizer',$c['addons'],true)===($trim!=='standard'&&($trim==='comfort_plus'||$modulation)),'Economizer rule mismatch');
 check($c['cascadeCabinet']===($cabinet&&$count>1&&$trim!=='standard'),'Cascade cabinet rule mismatch');
 $body=base64_decode(quote_message($normalized)['body']);
 check(strpos($body,'Шкаф управления каскадом: '.($c['cascadeCabinet']?'установлен':'не выбран'))!==false,'Cabinet not in quote');
 check(strpos($body,'cascadeCabinet='.($c['cascadeCabinet']?'1':'0'))!==false,'Cabinet not in shared URL');
}
$bad=$data;$bad['config']['cascadeCabinet']='yes';check(quote_validate($bad)===false,'Unvalidated cabinet flag');
foreach(array(array(1000,1,'ДА-3'),array(1500,1,'ДА-15/4'),array(2500,1,'ДА-15/4'),array(3000,1,'ДА-15/8'),array(3500,1,'ДА-15/8'),array(4000,1,'ДА-25/15'),array(500,5,'ДА-3'),array(2500,2,'ДА-15/4'),array(3000,2,'ДА-15/8'),array(5000,2,'ДА-25/15'),array(4000,3,'ДА-25/25')) as $row)check(quote_deaerator($row[0],$row[1])===$row[2],'DA threshold mismatch');
echo "PASSED_QUOTE_ENDPOINT_FAKE_TRANSPORT\n";
