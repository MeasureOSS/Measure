<?php

require_once(dirname(__FILE__) . "/../secret.php");

function github_create_token($login, $access_token) {
    global $secret;
    $t = time();
    $output = "github:" . $login . ":" . $access_token . ":" . $t;
    $c = crypt("$output:$secret");
    $auth = "$output:$c";
    return $auth;
}

function github_verify_token($auth) {
    global $secret;
    $parts = explode(":", $auth);
    if (count($parts) != 5) return FALSE;
    $base = $parts[0] . ":" . $parts[1] . ":" . $parts[2] . ":" . $parts[3];
    $c = crypt("$base:$secret", $parts[4]);
    if (!hash_equals($parts[4], $c)) { return FALSE;  }
    return TRUE;
}

function githubApiRequest($url, $post=FALSE, $headers=array(), $access_token=FALSE) {
    $headers[] = 'Accept: application/json';
    $headers[] = 'User-Agent: Measure';
    if ($access_token) $headers[] = 'Authorization: Bearer ' . $access_token;
    $opts = [
        "http" => [
            "ignore_errors" => TRUE,
            "method" => $post ? "POST" : "GET",
            "header" => join("\r\n", $headers),
            "max_redirects" => 0
        ]
    ];
    if ($post) {
      $opts["http"]["content"] = http_build_query($post);
      $opts["http"]["header"] .= "\r\nContent-Type: application/x-www-form-urlencoded";
    }
    $context = stream_context_create($opts);
    $file = file_get_contents($url, false, $context);
    //echo "<hr>url: ";
    //var_dump($url);
    //echo "<hr>";
    //var_dump($opts);
    //echo "<hr>";
    //var_dump($file);
    //echo "<hr>";
    //echo "<hr>response header:";
    //var_dump($http_response_header);
    //echo "<hr><hr>";
    
    return array(
      "headers" => parseHeaders($http_response_header),
      "data" => json_decode($file)
    );
}