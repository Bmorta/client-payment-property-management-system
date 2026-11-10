[CmdletBinding()]
param([ValidateSet('Choose','Server','Client','Status')][string]$Mode='Choose',[string]$ServerDirectory='')
$ErrorActionPreference='Stop'
if(![Environment]::Is64BitOperatingSystem -or ![Environment]::Is64BitProcess){throw 'Use 64-bit Windows PowerShell on a supported 64-bit Windows computer.'}
if($env:OS -ne 'Windows_NT'){throw 'This setup assistant is for Windows only.'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$script:ProgressBox=$null;$script:MainForm=$null;$script:Busy=$false
. (Join-Path $PSScriptRoot 'Engine.ps1')
function New-Form([string]$Title) {
 $f=New-Object Windows.Forms.Form;$f.Text=$Title;$f.StartPosition='CenterScreen';$f.Size=New-Object Drawing.Size(860,740);$f.MinimumSize=New-Object Drawing.Size(640,560);$f.Font=New-Object Drawing.Font('Segoe UI',10);$f.AutoScaleMode='Dpi';$icon=Join-Path $script:SourceRoot 'client\dist\branding\rems.ico';if(!(Test-Path $icon)){$icon=Join-Path $script:SourceRoot 'client\public\branding\rems.ico'};if(Test-Path $icon){$f.Icon=New-Object Drawing.Icon($icon)}
 $f.Add_FormClosing({param($sender,$eventArgs)if($script:Busy){$eventArgs.Cancel=$true}});$script:MainForm=$f;return $f
}
function Add-Label($Parent,[string]$Text,[int]$Top,[int]$Height=28) {$l=New-Object Windows.Forms.Label;$l.Text=$Text;$l.Location=New-Object Drawing.Point(22,$Top);$l.Size=New-Object Drawing.Size(790,$Height);$l.Anchor='Top,Left,Right';$Parent.Controls.Add($l);return $l}
function Add-Input($Parent,[int]$Top,[string]$Text='',[bool]$Password=$false) {$t=New-Object Windows.Forms.TextBox;$t.Text=$Text;$t.Location=New-Object Drawing.Point(22,$Top);$t.Size=New-Object Drawing.Size(790,28);$t.Anchor='Top,Left,Right';$t.UseSystemPasswordChar=$Password;$Parent.Controls.Add($t);return $t}
function Add-Button($Parent,[string]$Text,[int]$Left,[int]$Top,[int]$Width=240) {$b=New-Object Windows.Forms.Button;$b.Text=$Text;$b.Location=New-Object Drawing.Point($Left,$Top);$b.Size=New-Object Drawing.Size($Width,38);$Parent.Controls.Add($b);return $b}
function Show-Failure([string]$Text) {$null=[Windows.Forms.MessageBox]::Show($script:MainForm,$Text,'REMS - action needs attention','OK','Error')}
function Open-ElevatedServer {
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent();$principal=New-Object Security.Principal.WindowsPrincipal($identity)
 if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){return $true}
 $scriptPath=Join-Path $PSScriptRoot 'Setup.ps1';$arguments='-NoProfile -STA -ExecutionPolicy Bypass -File "'+$scriptPath+'" -Mode Server'
 if($ServerDirectory){$arguments+=' -ServerDirectory "'+$ServerDirectory+'"'}
 Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -ArgumentList $arguments
 return $false
}
function Show-Status {
 $f=New-Form 'REMS Setup & Service Status';$null=Add-Label $f 'Service status is available here even when the application backend is stopped.' 20 48
 $box=New-Object Windows.Forms.TextBox;$box.Multiline=$true;$box.ReadOnly=$true;$box.ScrollBars='Vertical';$box.Location=New-Object Drawing.Point(22,80);$box.Size=New-Object Drawing.Size(790,470);$box.Anchor='Top,Bottom,Left,Right';$f.Controls.Add($box)
 $refresh=Add-Button $f 'Refresh status' 22 575;$refresh.Anchor='Bottom,Left';$setup=Add-Button $f 'Open guided server setup' 280 575 280;$setup.Anchor='Bottom,Left'
 $load={try{$lines=@('REMS Office Server: '+$(if(Get-Service REMSOffice -ErrorAction SilentlyContinue){(Get-Service REMSOffice).Status}else{'Not installed'}));$lines+=@(Get-CimInstance Win32_Service|Where-Object {$_.PathName -match '(?i)\\mongod\.exe'}|ForEach-Object {$_.Name+': '+$_.State});$report=Join-Path $script:StateRoot 'setup-report.json';if(Test-Path $report){$lines+='Historical installation report (not current database readiness):';$lines+=Get-Content $report -Raw;$lines+='For current verification, sign into REMS > Administration > System Health & Database Readiness.'};$box.Text=$lines -join "`r`n"}catch{$box.Text='Status requires administrator review: '+$_.Exception.Message}}
 $refresh.Add_Click($load);$setup.Add_Click({try{if(Open-ElevatedServer){$f.Close();Show-Server}}catch{Show-Failure $_.Exception.Message}});& $load;$null=$f.ShowDialog()
}
function Show-Client {
 $f=New-Form 'REMS - Connect to Office Server';$f.Height=570
 $null=Add-Label $f 'Use the existing office server. This computer will not receive a MongoDB database.' 20 48
 $null=Add-Label $f 'Office server address (example: http://192.168.1.20:5000)' 82
 $address=Add-Input $f 112 'http://';$test=Add-Button $f 'Test connection' 22 155;$save=Add-Button $f 'Create shortcut & open REMS' 280 155 300;$save.Enabled=$false
 $info=Add-Label $f 'Ask your office administrator for the server address. A router DHCP reservation keeps it stable. Plain HTTP is suitable only for a trusted private office network; use trusted HTTPS for remote access.' 220 150
 $script:CheckedClientUrl=$null
 $address.Add_TextChanged({$save.Enabled=$false;$script:CheckedClientUrl=$null})
 $test.Add_Click({try{
  $u=$null;if(![uri]::TryCreate($address.Text.Trim(),[UriKind]::Absolute,[ref]$u) -or $u.Scheme -notin @('http','https') -or $u.UserInfo -or $u.AbsolutePath -ne '/' -or $u.Query -or $u.Fragment){throw 'Enter a server origin without credentials, paths or query parameters.'}
  if($u.Scheme -eq 'http'){$hostName=$u.Host;$ip=$null;$private=$false;if([Net.IPAddress]::TryParse($hostName,[ref]$ip)){$bytes=$ip.GetAddressBytes();$private=$bytes.Length -eq 4 -and ($bytes[0] -eq 10 -or $bytes[0] -eq 127 -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31))};if(!$private -and $hostName -notmatch '^[a-zA-Z0-9-]+(?:\.(?:local|lan))?$'){throw 'Use a private office address for HTTP, or trusted HTTPS for another server.'}}
  $url=$u.GetLeftPart([UriPartial]::Authority);$health=Invoke-RestMethod -Uri ($url+'/api/health') -TimeoutSec 8
  $expected=(Get-Content (Join-Path $script:SourceRoot 'server\package.json') -Raw|ConvertFrom-Json).version
  if($health.product -ne 'REMS' -or $health.setupProtocol -ne 1 -or (($health.version -split '\.')[0..1] -join '.') -ne (($expected -split '\.')[0..1] -join '.')){throw 'The server is not a compatible REMS installation. Upgrade the server before connecting.'}
  $script:CheckedClientUrl=$url;$save.Enabled=$true;$info.Text='Connected to compatible REMS '+$health.version+'. The shortcut will open this server. All devices use its existing database.'
 }catch{$save.Enabled=$false;Show-Failure ('Connection was not verified. '+$_.Exception.Message)}})
 $save.Add_Click({try{if(!$script:CheckedClientUrl){throw 'Test the connection again.'};New-DesktopLink 'REMS' "$env:WINDIR\explorer.exe" $script:CheckedClientUrl;Start-Process $script:CheckedClientUrl;$info.Text='REMS shortcut created. Sign in using your existing office account.'}catch{Show-Failure $_.Exception.Message}})
 $null=$f.ShowDialog()
}
function Show-Server {
 if(!(Open-ElevatedServer)){return}
 $mutex=New-Object Threading.Mutex($false,'Global\REMSOfficeSetup');try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true};if(!$owned){$mutex.Dispose();throw 'Another REMS server setup is already running on this computer.'}
 try{
 $f=New-Form 'REMS - Office Server Setup';$panel=New-Object Windows.Forms.Panel;$panel.Dock='Fill';$panel.AutoScroll=$true;$f.Controls.Add($panel)
 $null=Add-Label $panel 'Prepare once, then use the REMS desktop shortcut. Existing databases are preserved.' 16 44
 $null=Add-Label $panel 'Existing server .env (leave blank only for a NEW office database)' 65
 $default=if($ServerDirectory){Join-Path $ServerDirectory '.env'}elseif(Test-Path (Join-Path $script:StateRoot 'config\server.env')){Join-Path $script:StateRoot 'config\server.env'}elseif(Test-Path (Join-Path $script:SourceRoot 'server\.env')){Join-Path $script:SourceRoot 'server\.env'}else{''}
 $envBox=Add-Input $panel 96 $default;$envBox.Width=650;$envBox.Anchor='Top,Left,Right';$browse=Add-Button $panel 'Browse' 690 92 120;$browse.Anchor='Top,Right'
 $browse.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='Environment file|*.*';$dialog.Title='Select the existing REMS server .env';if($dialog.ShowDialog() -eq 'OK'){$envBox.Text=$dialog.FileName}})
 $null=Add-Label $panel 'MongoDB Windows service name (blank = detect a single service)' 135;$mongoName=Add-Input $panel 164 ''
 $null=Add-Label $panel 'REMS application port' 202;$portBox=Add-Input $panel 230 '5000'
 $lan=New-Object Windows.Forms.CheckBox;$lan.Text='Allow office devices on this private local subnet (restricted Windows Firewall rule)';$lan.Location=New-Object Drawing.Point(22,270);$lan.Size=New-Object Drawing.Size(790,35);$panel.Controls.Add($lan)
 $null=Add-Label $panel 'NEW installation only: administrator username, email and password (12+ characters)' 312 44
 $null=Add-Label $panel 'Administrator username' 356;$username=Add-Input $panel 384 'admin';$null=Add-Label $panel 'Administrator email' 422;$email=Add-Input $panel 450 '';$null=Add-Label $panel 'Administrator password' 488;$password=Add-Input $panel 516 '' $true
 $license=New-Object Windows.Forms.CheckBox;$license.Text='I reviewed the Node.js, MongoDB SSPL and WinSW license links in installer/THIRD-PARTY.md.';$license.Location=New-Object Drawing.Point(22,555);$license.Size=New-Object Drawing.Size(790,42);$panel.Controls.Add($license)
 $start=Add-Button $panel 'Review & prepare server' 22 610 300
 $progress=New-Object Windows.Forms.TextBox;$progress.Multiline=$true;$progress.ReadOnly=$true;$progress.ScrollBars='Vertical';$progress.Location=New-Object Drawing.Point(22,665);$progress.Size=New-Object Drawing.Size(790,260);$progress.Anchor='Top,Left,Right';$panel.Controls.Add($progress);$script:ProgressBox=$progress
 $licenses=Add-Button $panel 'Read vendor licenses' 350 610 240;$licenses.Add_Click({Start-Process (Join-Path $script:InstallerRoot 'THIRD-PARTY.md')})
 $panel.AutoScrollMinSize=New-Object Drawing.Size(0,960)
 $toggle={ $new=[string]::IsNullOrWhiteSpace($envBox.Text);$username.Enabled=$new;$email.Enabled=$new;$password.Enabled=$new };$envBox.Add_TextChanged($toggle);& $toggle
 $start.Add_Click({if($script:Busy){return};try{
  if(!$license.Checked){throw 'Review and accept the vendor component licenses before installing.'}
  $port=0;if(![int]::TryParse($portBox.Text,[ref]$port)){throw 'Enter a valid application port.'}
  if(!$envBox.Text.Trim() -and ($password.Text.Length -lt 12 -or $username.Text -notmatch '^[a-zA-Z0-9_-]{3,50}$' -or $email.Text -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$')){throw 'Enter a new administrator username, valid email and password of at least 12 characters.'}
  Confirm-Setup 'Prepare this computer as the REMS office server? Setup downloads checksum-verified vendor components, installs application dependencies, may request a separate database-service repair approval, and registers automatic application startup. Existing configuration and records remain preserved. High-risk database migrations still need separate approval.'
  $script:Busy=$true;$start.Enabled=$false;$browse.Enabled=$false;$report=Prepare-OfficeServer $envBox.Text.Trim() $mongoName.Text.Trim() $port $lan.Checked @{username=$username.Text.Trim();email=$email.Text.Trim();password=$password.Text};$password.Clear()
  $title=if($report.state -eq 'READY'){'REMS ready'}else{'REMS needs database review'};$text=if($report.state -eq 'READY'){'Setup checks passed. Open REMS from the desktop shortcut. Reboot and office-device acceptance still need to be tested on this computer.'}else{'Transactions are ready. Review the exact remaining index/conflict findings in Database & Backups before retrying the blocked workflow. No migration was automatically approved.'};$null=[Windows.Forms.MessageBox]::Show($f,$text,$title,'OK','Information')
 }catch{Write-ProgressLine ('Needs attention: '+$_.Exception.Message);Show-Failure $_.Exception.Message}finally{$script:Busy=$false;$start.Enabled=$true;$browse.Enabled=$true}})
 $null=$f.ShowDialog()
 }finally{$mutex.ReleaseMutex();$mutex.Dispose()}
}
if($Mode -eq 'Server'){Show-Server}elseif($Mode -eq 'Client'){Show-Client}elseif($Mode -eq 'Status'){Show-Status}else{
 $f=New-Form 'REMS Setup';$f.Height=450;$null=Add-Label $f 'Real Estate Management System' 25 40;$null=Add-Label $f 'Choose this computers role. Keep one authoritative office database. Independent development computers each need their own initial server setup; this assistant does not synchronize databases.' 85 90
 $server=Add-Button $f 'Set up Office Server' 22 200 360;$client=Add-Button $f 'Connect to Office Server' 410 200 360;$status=Add-Button $f 'Service status / repair' 22 260 360
 $server.Add_Click({try{if(Open-ElevatedServer){$f.Hide();Show-Server;$f.Show()}}catch{Show-Failure $_.Exception.Message}});$client.Add_Click({$f.Hide();Show-Client;$f.Show()});$status.Add_Click({$f.Hide();Show-Status;$f.Show()});$null=$f.ShowDialog()
}
