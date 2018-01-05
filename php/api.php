<?php

require_once("secret.php");
require("authlist.php");

$dsn = '';

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
        "sql" => "insert into people2org (login, org, joined, left) values (:login, :org, :joined, :left)",
        "params" => array("login", "org", "joined", "left"),
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
    ),
    "orgChanges" => array(
        "sql" => "select id, org, change, destination from orgChanges",
        "params" => array(),
        "return" => "rows",
        "verb" => "GET"
    ),
    "deleteOrg" => array(
        "sql" => "insert into orgChanges (org, change) values (:id, 'delete')",
        "params" => array("id"),
        "return" => "none",
        "verb" => "POST"
    ),
    "restoreOrg" => array(
        "sql" => "delete from orgChanges where org=:id and change='delete'",
        "params" => array("id"),
        "return" => "none",
        "verb" => "POST"
    ),
    "mergeOrgs" => array(
        "sql" => "insert into orgChanges (org, change, destination) values (:fromId, 'merge', :intoId)",
        "params" => array("fromId", "intoId"),
        "return" => "none",
        "verb" => "POST"
    ),
    "unmergeOrg" => array(
        "sql" => "delete from orgChanges where org=:id and change='merge'",
        "params" => array("id"),
        "return" => "none",
        "verb" => "POST"
    ),
    "getBasicInfoOverrides" => array(
        "sql" => "select login, name, company, blog, location, email, hireable from bio where login = :login",
        "params" => array("login"),
        "return" => "rows",
        "verb" => "GET"
    ),
    "setBasicInfoOverrides" => array(
        "sql" => "insert or replace into bio (login, name, company, blog, location, email, hireable) values (:login, :name, :company, :blog, :location, :email, :hireable)",
        "params" => array("login", "name", "company", "blog", "location", "email", "hireable"),
        "return" => "none",
        "verb" => "POST"
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
        $out["exception"] = array(
            "message" => $ex->getMessage(),
            "line" => $ex->getLine(),
            "file" => $ex->getFile()
        );
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

function checkAuthRequired() {
    global $auth_list;
    $auth_details = array("required" => FALSE, "valid" => null, "present" => FALSE);
    if (count($auth_list) > 0) {
        $auth_details["required"] = TRUE;
        $auth_details["accepted"] = array_keys($auth_list);
    }
    if (isset($_GET["authtoken"])) {
        $auth_details["present"] = TRUE;
        $auth_details["valid"] = generic_verify($_GET["authtoken"]);
        if ($auth_details["valid"]) {
            $token_details = generic_unpack_token($_GET["authtoken"]);
            $auth_details["username"] = $token_details["username"];
            $auth_details["provider"] = $token_details["provider"];
        }
    }
    echo json_encode($auth_details);
    die();
}

function giveToken() {
    global $secret;
    $r = bin2hex(openssl_random_pseudo_bytes(16));
    $t = time();
    $c = crypt("$r:$t:$secret");
    $token = "$r:$t:$c";
    echo json_encode(array("token" => $token)) . "\n";
    die();
}

function verifyToken($token) {
    global $secret;
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
    global $queries, $auth_list;
    if (!isset($_GET["query"])) { fail(400, "No query specified"); }
    $query = $_GET["query"];
    if ($query == "token") { giveToken(); }
    if ($query == "auth") { checkAuthRequired(); }
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

    if ($queryd["verb"] == "POST") {
        if (count($auth_list) > 0) {
            if (!isset($_GET["authtoken"])) {
                fail(400, "No auth token specified");
            } else {
                if (!generic_verify($_GET["authtoken"])) {
                    fail(400, "Invalid auth token specified");
                }
            }
        }
    }

    /* Verify that they only passed vars we expect, and not some random other vars */
    $params = array();
    foreach ($_GET as $key => $value) {
        if ($key == "query") { continue; }
        if ($key == "token") { continue; }
        if ($key == "authtoken") { continue; }
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