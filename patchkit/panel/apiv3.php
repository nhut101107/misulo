<?php
// MicuMulti Private Panel - apiv3.php
// Deploy: https://your-host/panel/apiv3.php
// Requires PHP 7.4+ with openssl + json. Put keys.json outside webroot or protect with .htaccess.
// Protocol (rieng, khong dung chung Mixu cu):
//   POST JSON: {"action":"authenticate","key":"XXXX-XXXX","device_id":"android_id hex","package":"com.waxmoon.ma.gp","nonce":"random16","hash":"sha256(key|device_id|nonce|SECRET)"}
//   Response: {"active":true,"expires_at":"2026-12-31 23:59:59","server_time":1234567890,"binding_token":"...","reason":"ok"}
//   Binding: key gan voi device_id dau tien (hwid lock). Doi may thi reset trong keys.json.

header('Content-Type: application/json; charset=utf-8');

define('SECRET', 'thay-secret-nay-di-32-ky-tu'); // <-- DOI CAI NAY, phai khop voi KeyGate.java
define('KEYS_FILE', __DIR__ . '/keys.json');

function jexit($arr){ echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }

$raw = file_get_contents('php://input');
$req = json_decode($raw, true);
if(!$req){ $req = $_POST; }
$action = $req['action'] ?? 'authenticate';
$key = trim($req['key'] ?? '');
$device = trim($req['device_id'] ?? '');
$nonce = trim($req['nonce'] ?? '');
$hash = trim($req['hash'] ?? '');

// verify hash chong replay co ban
if($key===''||$device===''||$nonce===''||$hash===''){
  jexit(['active'=>false,'reason'=>'missing_params','server_time'=>time()]);
}
$calc = hash('sha256', $key.'|'.$device.'|'.$nonce.'|'.SECRET);
if(!hash_equals($calc, $hash)){
  jexit(['active'=>false,'reason'=>'bad_hash','server_time'=>time()]);
}
if(!file_exists(KEYS_FILE)) jexit(['active'=>false,'reason'=>'no_db','server_time'=>time()]);
$db = json_decode(file_get_contents(KEYS_FILE), true);
if(!isset($db[$key])) jexit(['active'=>false,'reason'=>'key_not_found','server_time'=>time()]);

$rec = $db[$key];
// rec: {"exp":"2026-12-31 23:59:59","device":"","banned":false,"note":""}

if(!empty($rec['banned'])) jexit(['active'=>false,'reason'=>'key_banned','server_time'=>time()]);
$exp = strtotime($rec['exp'] ?? '2000-01-01');
if($exp < time()) jexit(['active'=>false,'reason'=>'expired','expires_at'=>$rec['exp'],'server_time'=>time()]);

// hwid lock
if(empty($rec['device'])){
  $db[$key]['device'] = $device;
  file_put_contents(KEYS_FILE, json_encode($db, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
  $rec['device'] = $device;
}
if($rec['device'] !== $device){
  jexit(['active'=>false,'reason'=>'device_mismatch','server_time'=>time()]);
}

// ok -> cap binding_token (de client cache offline 6h)
$payload = $key.'|'.$device.'|'.time();
$token = hash_hmac('sha256', $payload, SECRET);

jexit([
  'active'=>true,
  'reason'=>'ok',
  'expires_at'=>$rec['exp'],
  'server_time'=>time(),
  'binding_token'=>$token,
  'offline_until'=> time()+6*3600,
]);
