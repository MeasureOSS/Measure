<?php
define('OAUTH2_CLIENT_ID', '');
define('OAUTH2_CLIENT_SECRET', '');
define('GITHUB_PERMITTED_ORGANIZATION', '');
$authorizeURL = 'https://github.com/login/oauth/authorize';
$tokenURL = 'https://github.com/login/oauth/access_token';
$apiURLBase = 'https://api.github.com/';
session_start();

require_once("auth/github.php");
require_once("auth/general.php");

/*
Call with ?action=login to start the login process
Github will redirect back to us with ?code=BLAH&state=BLAH

FIXME: make errors show more nicely
*/



function do_login() {
    global $authorizeURL;
    $_SESSION['state'] = hash('sha256', microtime(TRUE).rand().$_SERVER['REMOTE_ADDR']);
    $params = array(
        'client_id' => OAUTH2_CLIENT_ID,
        'redirect_uri' => siteURL(),
        'scope' => 'read:user',
        'state' => $_SESSION['state']
    );
    header('Location: ' . $authorizeURL . '?' . http_build_query($params));
    die();
}

function do_code() {
    global $tokenURL, $apiURLBase;
    if(!isset($_GET['state']) || $_SESSION['state'] != $_GET['state']) {
        showError("Bad code.");
        die();
    }
    // Exchange the auth code for a token
    $tokendata = githubApiRequest($tokenURL, array(
        'client_id' => OAUTH2_CLIENT_ID,
        'client_secret' => OAUTH2_CLIENT_SECRET,
        'redirect_uri' => siteURL(),
        'state' => $_SESSION['state'],
        'code' => $_GET['code']
    ));
    if ($tokendata["headers"]["response_code"] != "200") {
        showError("bad code");
        var_dump($tokendata);
        die();
    }
    $at = $tokendata["data"]->access_token;
    $userdata = githubApiRequest($apiURLBase . 'user', false, array(), $at);
    if ($userdata["headers"]["response_code"] != 200) {
        showError("bad user");
        var_dump($userdata);
        die();
    }
    $orgurl = $apiURLBase . "orgs/" . GITHUB_PERMITTED_ORGANIZATION . 
        "/members/" . $userdata["data"]->login;
    $inorgdata = githubApiRequest($orgurl, false, array(), $at);
    if ($inorgdata["headers"]["response_code"] == 302) {
        $inorg = TRUE;
    } else {
        $inorg = FALSE;
    }
    $auth = github_create_token($userdata["data"]->login, $at);
    
    // set the auth token as a cookie
    setcookie("MeasureAuth", $auth);
    // and return it so it can be set in JS
    showError(signed_in_with("GitHub", $userdata["data"]->login, $auth));
}

if (isset($_GET["action"]) && $_GET["action"] == "login") {
    do_login();
} else if (isset($_GET["code"])) {
    do_code();
} else {
    showError("Bad call");
}

die();
