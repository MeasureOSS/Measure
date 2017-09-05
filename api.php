<?php

$dsn = '';
$secret = 'Eihiqu4a Ma7Ek0ae Hozai5ci eish4Shi phiiw6Un ohD8wi3k';

$queries = array(
    "addNote" => array(
        "sql" => "insert into notes (login, note) values (:login, :note)",
        "params" => array("login", "note"),
        "return" => "insertid",
        "verb" => "POST"
    ),
    "addOrg" => array(
        "sql" => "insert into orgs (name) values (:name)",
        "params" => array("name"),
        "return" => "insertid",
        "verb" => "POST"
    ),
    "addToOrg" => array(
        "sql" => "insert into people2org (login, org) values (:login, :org)",
        "params" => array("login", "org"),
        "return" => "insertid",
        "verb" => "POST"
    ),
    "removeFromOrg" => array(
        "sql" => "delete from people2org where login = :login and org = :org",
        "params" => array("login", "org"),
        "return" => "none",
        "verb" => "POST"
    ),
    "leaveOrg" => array(
        "sql" => "update people2org set left = CURRENT_TIMESTAMP where login = :login and org = :org",
        "params" => array("login", "org"),
        "return" => "none",
        "verb" => "POST"
    ),
    "removeOrg" => array(
        "sql" => "delete from org where id = :id",
        "params" => array("id"),
        "return" => "none",
        "verb" => "POST"
    ),
    "removeNote" => array(
        "sql" => "delete from notes where id = :id",
        "params" => array("id"),
        "return" => "none",
        "verb" => "POST"
    ),
    "getNotes" => array(
        "sql" => "select id, note from notes where login = :login order by timestamp asc",
        "params" => array("login"),
        "return" => "rows",
        "verb" => "GET"
    ),
    "getAllOrgs" => array(
        "sql" => "select id, name from orgs",
        "params" => array(),
        "return" => "rows",
        "verb" => "GET"
    ),
    "getMyOrgs" => array(
        "sql" => "select o.id, o.name, p.joined, p.left from orgs o inner join people2org p on p.org = o.id where p.login = :login order by p.joined asc",
        "params" => array("login"),
        "return" => "rows",
        "verb" => "GET"
    )
);

function hdr($code, $msg) {
    $phpSapiName    = substr(php_sapi_name(), 0, 3);
    if ($phpSapiName == 'cgi' || $phpSapiName == 'fpm') {
        header('Status: ' . $code . ' ' . $msg);
    } else {
        $protocol = isset($_SERVER['SERVER_PROTOCOL']) ? $_SERVER['SERVER_PROTOCOL'] : 'HTTP/1.0';
        header($protocol . ' ' . $code . ' ' . $msg);
    }
}

function fail($code, $msg, $ex = null) {
    hdr($code, $msg);
    $out = array(
        "success" => false,
        "code" => $code,
        "msg" => $msg
    );
    if (!is_null($ex)) {
        $out["exception"] = $ex;
    }
    echo(json_encode($out) . "\n");
    die();
}

if(!function_exists('hash_equals')) {
  function hash_equals($str1, $str2) {
    if(strlen($str1) != strlen($str2)) {
      return false;
    } else {
      $res = $str1 ^ $str2;
      $ret = 0;
      for($i = strlen($res) - 1; $i >= 0; $i--) $ret |= ord($res[$i]);
      return !$ret;
    }
  }
}

function giveToken() {
    $r = bin2hex(openssl_random_pseudo_bytes(16));
    $t = time();
    $c = crypt("$r:$t:$secret");
    $token = "$r:$t:$c";
    echo json_encode(array("token" => $token)) . "\n";
    die();
}

function verifyToken($token) {
    $parts = explode(":", $token);
    if (count($parts) != 3) { fail(400, "Malformatted token"); }
    $now = time();
    $t = intval($parts[1]);
    $age = $now - $t;
    if ($age > 3600 || $age < 0) { fail(400, "Out-of-date token"); }
    $r = $parts[0];
    $c = crypt("$r:$t:$secret", $parts[2]);
    if (!hash_equals($parts[2], $c)) { fail(400, "Invalid token");  }
}

function check_query_inputs() {
    global $queries;
    if (!isset($_GET["query"])) { fail(400, "No query specified"); }
    $query = $_GET["query"];
    if ($query == "token") { giveToken(); }
    if (!array_key_exists($query, $queries)) { fail(400, "Bad query specified"); }
    $queryd = $queries[$query];
    $sql = $queryd["sql"];
    $required = $queryd["params"];
    $return = $queryd["return"];
    if ($_SERVER['REQUEST_METHOD'] != $queryd["verb"]) {
        fail(400, "Incorrect verb");
    }
    if (!isset($_GET["token"])) { fail(400, "No token specified"); }
    verifyToken($_GET["token"]);
    $params = array();
    foreach ($_GET as $key => $value) {
        if ($key == "query") { continue; }
        if ($key == "token") { continue; }
        if (!in_array($key, $required)) {
            fail(400, "Non-existent variable " . $key);
        }
        $params[$key] = $value;
    }
    if (count($params) != count($required)) {
        fail(400, "Missing variable");
    }
    return array("params" => $params, "sql" => $sql, "return" => $return);
}

function make_statement($details) {
    global $dsn;
    $options = array
    (
        \PDO::ATTR_CASE => \PDO::CASE_NATURAL,
        \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
        \PDO::ATTR_EMULATE_PREPARES => false,
        \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
        \PDO::ATTR_ORACLE_NULLS => \PDO::NULL_NATURAL,
        \PDO::ATTR_STRINGIFY_FETCHES => false,
    );
    $dbh = new \PDO($dsn, null, null, $options);
    $stmt = $dbh->prepare($details["sql"]);
    $res = $stmt->execute($details["params"]);
    if ($res === FALSE) {
        fail(500, "Statement failed");
    }
    return array("s" => $stmt, "db" => $dbh);
}

function main() {
    try {
        $details = check_query_inputs();
        $sdetails = make_statement($details);
        if ($details["return"] == "rows") {
            $out = array("rows" => $sdetails["s"]->fetchAll());
            $code = 200;
            $msg = "OK";
        } else if ($details["return"] == "insertid") {
            $lid = $sdetails["db"]->lastInsertId();
            $out = array("insert_id" => $lid);
            $code = 201;
            $msg = "Created";
        } else if ($details["return"] == "none") {
            $code = 200;
            $msg = "OK";
        }
        hdr($code, $msg);
        $out["success"] = true;
        echo json_encode($out) . "\n";
        die();
    } catch (Exception $e) {
        fail(500, "Error", $e);
    }
}

main();

?>