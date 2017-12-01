<?php

require_once("auth/general.php");
require_once("authlist.php");

if (count($auth_list) == 0) {
    showError("No login required");
    die();
}

$buttons = array();

if (array_key_exists("github", $auth_list)) {
    $buttons[] = '<a class="btn-auth btn-github" href="github-login.php?action=login">Sign in with Github</a>';
}

$html = "<style>@import 'http://necolas.github.io/css3-social-signin-buttons/auth-buttons.css';</style><p class='is-signed-in'></p>" . join($buttons, "<br>\n");
$html .= '<script>window.addEventListener("load", function() { ' .
    '    setTimeout(function() {' .
    '    if (authDetails.provider && authDetails.username) {' .
    '        document.querySelector("p.is-signed-in").appendChild(document.createTextNode("Signed in as " + authDetails.username + " with " + authDetails.provider));' .
    '        var btn = document.createElement("button");' .
    '        btn.appendChild(document.createTextNode("Sign out"));' .
    '        document.querySelector("p.is-signed-in").appendChild(btn);' .
    '        btn.addEventListener("click", function() {' .
    '            window.localStorage.removeItem("jp-authtoken");' .
    '            location.reload();' .
    '        }, false);' .
    '    }' .
    '    }, 1000);' .
    '}, false);</script>';

showError($html);