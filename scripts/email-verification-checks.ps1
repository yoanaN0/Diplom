$ErrorActionPreference = 'Stop'

$baseUrl = 'http://localhost/DiplomJSme/api'
$mysql = 'C:/wamp64/bin/mysql/mysql8.2.0/bin/mysql.exe'
$php = 'C:/wamp64/bin/php/php7.4.33/php.exe'
$dbArgs = @('--host=127.0.0.1', '--port=3306', '--user=root', '--database=finly', '--skip-column-names', '--batch')
$testPassword = 'Pass12345'

$results = [System.Collections.Generic.List[Object]]::new()

function Add-Result([string]$name, [bool]$ok, [string]$details) {
    $results.Add([pscustomobject]@{
        Check = $name
        Status = if ($ok) { 'PASS' } else { 'FAIL' }
        Details = $details
    }) | Out-Null
}

function Exec-Sql([string]$sql) {
    $output = & $mysql @dbArgs -e $sql
    if ($LASTEXITCODE -ne 0) {
        throw "MySQL command failed: $sql"
    }
    return @($output)
}

function Get-FirstIntValue([object[]]$rows) {
    foreach ($row in $rows) {
        $text = [string]$row
        if ($text -match '(\d+)') {
            return [int]$Matches[1]
        }
    }

    return 0
}

function Get-FirstScalar([object[]]$rows) {
    foreach ($row in $rows) {
        $text = [string]$row
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            return $text.Trim()
        }
    }

    return ''
}

function New-Email([string]$prefix) {
    return "${prefix}_$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())_$([Guid]::NewGuid().ToString('N').Substring(0,6))@example.com"
}

function Get-PasswordHash([string]$password) {
    $hash = & $php -r "echo password_hash('$password', PASSWORD_BCRYPT);"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hash)) {
        throw 'Failed to create password hash via php.'
    }
    return $hash.Trim()
}

function New-TestUser([string]$email, [bool]$verified = $false) {
    $first = 'Test'
    $last = 'User'
    $hash = Get-PasswordHash $testPassword

    Exec-Sql "INSERT INTO users (first_name, last_name, email, password_hash) VALUES ('$first', '$last', '$email', '$hash');" | Out-Null
    $userId = Get-FirstIntValue (Exec-Sql "SELECT id FROM users WHERE email = '$email' LIMIT 1;")
    if ($userId -le 0) {
        throw "Failed to locate seeded user ID for $email"
    }

    Exec-Sql "INSERT INTO user_admin_meta (user_id, role, profile_status, is_verified) VALUES ($userId, 'user', 'active', $(if ($verified) {1} else {0})) ON DUPLICATE KEY UPDATE role='user', profile_status='active', is_verified=$(if ($verified) {1} else {0});" | Out-Null

    return $userId
}

function Add-VerificationRow([int]$userId, [string]$code, [string]$createdExpr, [string]$expiresExpr, [int]$attempts = 0, [bool]$used = $false) {
    $codeHash = (& $php -r "echo password_hash('$code', PASSWORD_BCRYPT);").Trim()
    $usedExpr = if ($used) { 'NOW()' } else { 'NULL' }

    Exec-Sql "INSERT INTO user_email_verification_codes (user_id, code_hash, attempts, expires_at, used_at, created_at) VALUES ($userId, '$codeHash', $attempts, $expiresExpr, $usedExpr, $createdExpr);" | Out-Null
}

function Invoke-Api([string]$path, [string]$method = 'POST', [object]$body = $null, [Microsoft.PowerShell.Commands.WebRequestSession]$session = $null) {
    $uri = "$baseUrl$path"
    $json = if ($body -ne $null) { $body | ConvertTo-Json -Depth 10 -Compress } else { '' }

    $request = [System.Net.HttpWebRequest]::Create($uri)
    $request.Method = $method
    $request.ContentType = 'application/json'
    $request.Accept = 'application/json'

    if ($session) {
        $request.CookieContainer = $session.Cookies
    }

    if ($method -ne 'GET' -and $json -ne '') {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $request.ContentLength = $bytes.Length
        $requestStream = $request.GetRequestStream()
        $requestStream.Write($bytes, 0, $bytes.Length)
        $requestStream.Close()
    }

    try {
        $response = $request.GetResponse()
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $response = $_.Exception.Response
        } else {
            throw
        }
    }

    $status = [int]$response.StatusCode
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $raw = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()

    $parsed = $null
    if ($raw) {
        try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $null }
    }

    return [pscustomobject]@{ Status = $status; Body = $parsed; Raw = $raw }
}

# 1) Registration without successful email delivery should return 503 and keep account unverified.
$regEmail = New-Email 'regfail'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$reg = Invoke-Api -path '/auth/register.php' -body @{ firstName='Reg'; lastName='Fail'; email=$regEmail; password=$testPassword } -session $session
$regUserRows = Exec-Sql "SELECT id FROM users WHERE email = '$regEmail' LIMIT 1;"
$regUserId = Get-FirstIntValue $regUserRows
$regMetaRows = if ($regUserId -gt 0) { Exec-Sql "SELECT is_verified FROM user_admin_meta WHERE user_id = $regUserId LIMIT 1;" } else { @() }
$regVerifiedRaw = Get-FirstScalar $regMetaRows
$regVerified = if ($regVerifiedRaw -ne '') { [int]::Parse($regVerifiedRaw) } else { -1 }
Add-Result 'register-send-failure-status' ($reg.Status -eq 503) "status=$($reg.Status)"
Add-Result 'register-send-failure-message' ($reg.Body -and -not [string]::IsNullOrWhiteSpace([string]$reg.Body.error)) ($reg.Raw)
Add-Result 'register-keeps-user-unverified' ($regUserId -gt 0 -and $regVerified -eq 0) "user_id=$regUserId, is_verified=$regVerified"

$me = Invoke-Api -path '/auth/me.php' -method 'GET' -session $session
Add-Result 'no-session-before-verification' ($me.Status -eq 401) "status=$($me.Status)"

# 2) Successful verification + login after verification (manual seeded active code).
$okEmail = New-Email 'verifyok'
$okUserId = New-TestUser -email $okEmail -verified:$false
Add-VerificationRow -userId $okUserId -code '111111' -createdExpr 'NOW()' -expiresExpr "DATE_ADD(NOW(), INTERVAL 10 MINUTE)"

$verifyOk = Invoke-Api -path '/auth/verify-email.php' -body @{ email=$okEmail; code='111111' }
$okVerifiedRaw = Get-FirstScalar (Exec-Sql "SELECT is_verified FROM user_admin_meta WHERE user_id = $okUserId LIMIT 1;")
$okVerified = if ($okVerifiedRaw -ne '') { [int]::Parse($okVerifiedRaw) } else { -1 }
Add-Result 'successful-verification' ($verifyOk.Status -eq 200 -and $okVerified -eq 1) "status=$($verifyOk.Status), is_verified=$okVerified"

$loginOk = Invoke-Api -path '/auth/login.php' -body @{ email=$okEmail; password=$testPassword }
Add-Result 'login-after-verification' ($loginOk.Status -eq 200) "status=$($loginOk.Status)"

# 3) Wrong code increments attempts; 5th failure invalidates code.
$wrongEmail = New-Email 'wrongcode'
$wrongUserId = New-TestUser -email $wrongEmail -verified:$false
Add-VerificationRow -userId $wrongUserId -code '222222' -createdExpr 'NOW()' -expiresExpr "DATE_ADD(NOW(), INTERVAL 10 MINUTE)"

for ($i = 1; $i -le 5; $i++) {
    $wrong = Invoke-Api -path '/auth/verify-email.php' -body @{ email=$wrongEmail; code='999999' }
    Add-Result "wrong-code-attempt-$i" ($wrong.Status -eq 422) "status=$($wrong.Status)"
}

$attemptCountRaw = Get-FirstScalar (Exec-Sql "SELECT attempts FROM user_email_verification_codes WHERE user_id = $wrongUserId ORDER BY id DESC LIMIT 1;")
$isUsedRaw = Get-FirstScalar (Exec-Sql "SELECT CASE WHEN used_at IS NULL THEN 0 ELSE 1 END FROM user_email_verification_codes WHERE user_id = $wrongUserId ORDER BY id DESC LIMIT 1;")
$attemptCount = if ($attemptCountRaw -ne '') { [int]::Parse($attemptCountRaw) } else { -1 }
$isUsed = if ($isUsedRaw -ne '') { [int]::Parse($isUsedRaw) } else { -1 }
Add-Result 'five-failed-attempts-lock-code' ($attemptCount -eq 5 -and $isUsed -eq 1) "attempts=$attemptCount, used=$isUsed"

$afterLocked = Invoke-Api -path '/auth/verify-email.php' -body @{ email=$wrongEmail; code='222222' }
Add-Result 'used-or-locked-code-cannot-be-used' ($afterLocked.Status -eq 422) "status=$($afterLocked.Status), body=$($afterLocked.Raw)"

# 4) Expired code cannot be used.
$expiredEmail = New-Email 'expired'
$expiredUserId = New-TestUser -email $expiredEmail -verified:$false
Add-VerificationRow -userId $expiredUserId -code '333333' -createdExpr 'DATE_SUB(NOW(), INTERVAL 20 MINUTE)' -expiresExpr "DATE_SUB(NOW(), INTERVAL 5 MINUTE)"

$expired = Invoke-Api -path '/auth/verify-email.php' -body @{ email=$expiredEmail; code='333333' }
$expiredStateRaw = Get-FirstScalar (Exec-Sql "SELECT used_at IS NOT NULL FROM user_email_verification_codes WHERE user_id = $expiredUserId ORDER BY id DESC LIMIT 1;")
Add-Result 'expired-code-rejected' ($expired.Status -eq 422) "status=$($expired.Status), body=$($expired.Raw)"
$expiredUsed = if ($expiredStateRaw -ne '') { [int]::Parse($expiredStateRaw) } else { -1 }
Add-Result 'expired-code-marked-used' ($expiredUsed -eq 1) "used=$expiredUsed"

# 5) Cooldown on resend.
$coolEmail = New-Email 'cooldown'
$coolUserId = New-TestUser -email $coolEmail -verified:$false
Add-VerificationRow -userId $coolUserId -code '444444' -createdExpr 'NOW()' -expiresExpr "DATE_ADD(NOW(), INTERVAL 10 MINUTE)" -used:$true

$cool = Invoke-Api -path '/auth/resend-verification.php' -body @{ email=$coolEmail }
$cooldownVal = if ($cool.Body -and $cool.Body.cooldownRemaining) { [int]$cool.Body.cooldownRemaining } else { 0 }
Add-Result 'resend-cooldown' ($cool.Status -eq 429 -and $cooldownVal -gt 0) "status=$($cool.Status), cooldownRemaining=$cooldownVal"

# 6) Hourly max 5 sends in last 60 minutes.
$limitEmail = New-Email 'hourlimit'
$limitUserId = New-TestUser -email $limitEmail -verified:$false
for ($i = 1; $i -le 5; $i++) {
    Add-VerificationRow -userId $limitUserId -code ('55' + $i.ToString('0000')) -createdExpr "DATE_SUB(NOW(), INTERVAL 2 MINUTE)" -expiresExpr "DATE_ADD(NOW(), INTERVAL 8 MINUTE)" -used:$true
}

$beforeCount = [int](Exec-Sql "SELECT COUNT(*) FROM user_email_verification_codes WHERE user_id = $limitUserId;")[0]
$limit = Invoke-Api -path '/auth/resend-verification.php' -body @{ email=$limitEmail }
$retryAfter = if ($limit.Body -and $limit.Body.retryAfterSeconds) { [int]$limit.Body.retryAfterSeconds } else { 0 }
Add-Result 'hourly-send-limit-429' ($limit.Status -eq 429) "status=$($limit.Status), body=$($limit.Raw)"
Add-Result 'hourly-send-limit-retryafter' ($retryAfter -gt 0) "retryAfterSeconds=$retryAfter"

$afterLimitCall = [int](Exec-Sql "SELECT COUNT(*) FROM user_email_verification_codes WHERE user_id = $limitUserId;")[0]
Add-Result 'hourly-limit-no-new-code-row' ($beforeCount -eq $afterLimitCall) "before=$beforeCount, after=$afterLimitCall"

$results | Format-Table -AutoSize

$failCount = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Output "TOTAL_FAIL=$failCount"
if ($failCount -gt 0) {
    exit 1
}
