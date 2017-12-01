<?php

function showError($message) {
    $html = file_get_contents(dirname(__FILE__) . "/../php.tmpl");
    $html = str_replace("HTMLHTML", $message, $html);
    echo $html;
    die();
}

function siteURL() {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
    return $protocol . $_SERVER['HTTP_HOST'] . $_SERVER["PHP_SELF"];
}

function signed_in_with($provider, $username, $auth) {
    $message = "<p>Signed in with $provider as $username.</p>";
    $message .= "<script>document.addEventListener('DOMContentLoaded', function() { storeAuthToken('$auth'); });</script>";
    return $message;
}

function parseHeaders($headers) {
    $head = array();
    foreach($headers as $k=>$v) {
        $t = explode(':', $v, 2);
        if(isset($t[1])) {
            $head[trim($t[0])] = trim($t[1]);
        } else {
            $head[] = $v;
            if(preg_match("#HTTP/[0-9\.]+\s+([0-9]+)#", $v, $out)) {
                $head['response_code'] = intval($out[1]);
            }
        }
    }
    return $head;
}

