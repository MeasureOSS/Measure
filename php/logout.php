<?php

setcookie("MeasureAuth","",time()-3600);
header("Location: login.php");