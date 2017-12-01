<?php

require("auth/github.php");

function startsWith($haystack, $needle) {
     $length = strlen($needle);
     return (substr($haystack, 0, $length) === $needle);
}

function github_verify($token) {
    return github_verify_token($token);
}

function generic_verify($token) {
    global $auth_list;
    foreach ($auth_list as $name => $fn) {
        $starter = $name . ":";
        if (startsWith($token, $starter)) {
            return call_user_func($fn, $token);
        }
    }
    return FALSE;
}

function generic_unpack_token($token) {
    $parts = explode(":", $token);
    return array(
        "username" => $parts[1],
        "provider" => $parts[0]
    );
}

$auth_list = array();
