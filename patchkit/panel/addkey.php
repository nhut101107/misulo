<?php
// addkey.php?pass=doi-pass-nay-di -> tao key moi, chay tren hosting, khong public
// VD: https://your-host/panel/addkey.php?pass=123456&days=30&prefix=MICU-
$PASS='doi-pass-nay-di';
if(($_GET['pass']??'')!==$PASS){ http_response_code(403); exit('forbidden'); }
$days=intval($_GET['days']??30);
$prefix=$_GET['prefix']??'MICU-';
$file=__DIR__.'/keys.json';
$db=file_exists($file)?json_decode(file_get_contents($file),true):[];
$rand=strtoupper(bin2hex(random_bytes(4)));
$rand=substr($rand,0,4).'-'.substr($rand,4,4);
$key=$prefix.$rand;
$exp=date('Y-m-d H:i:s', time()+$days*86400);
$db[$key]=['exp'=>$exp,'device'=>'','banned'=>false,'note'=>date('Y-m-d')];
file_put_contents($file, json_encode($db, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
echo "key=$key exp=$exp";
