Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:InstallerRoot=Split-Path $PSScriptRoot -Parent
$script:SourceRoot=Split-Path $script:InstallerRoot -Parent
$script:StateRoot=Join-Path $env:ProgramData 'REMS'
if(!(Test-Path (Join-Path $script:SourceRoot 'server\package.json')) -and (Test-Path (Join-Path $script:StateRoot 'setup-report.json'))){$script:SourceRoot=(Get-Content (Join-Path $script:StateRoot 'setup-report.json') -Raw|ConvertFrom-Json).release}
$script:Node='';$script:Npm=''
function Write-ProgressLine([string]$Text) { if(Test-Path $script:StateRoot){try{Add-Content -LiteralPath (Join-Path $script:StateRoot 'setup-last.log') -Value ((Get-Date -Format 'o')+' '+$Text) -Encoding UTF8}catch{}};if($script:ProgressBox){$script:ProgressBox.AppendText($Text+"`r`n");[Windows.Forms.Application]::DoEvents()} }
function Confirm-Setup([string]$Text) { if([Windows.Forms.MessageBox]::Show($script:MainForm,$Text,'REMS administrator review',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning,[Windows.Forms.MessageBoxDefaultButton]::Button2) -ne [Windows.Forms.DialogResult]::Yes){throw 'Cancelled. No further changes were applied.'} }
function Protect-Directory([string]$Path,[switch]$ServiceRead) {
 $null=New-Item -ItemType Directory -Path $Path -Force
 & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Could not protect the setup directory.'}
 if($ServiceRead){& icacls.exe $Path /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not grant the backend service read access.'}}
}
function Get-VendorArtifact([string]$Kind) {
 $manifest=Get-Content -LiteralPath (Join-Path $script:InstallerRoot 'downloads.json') -Raw | ConvertFrom-Json
 $item=$manifest.$Kind;$cache=Join-Path $script:StateRoot 'cache';Protect-Directory $cache
 $destination=Join-Path $cache ([IO.Path]::GetFileName(([uri]$item.url).AbsolutePath))
 if(!(Test-Path -LiteralPath $destination) -or (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $item.sha256){
  Write-ProgressLine "Downloading verified $Kind $($item.version)..."
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $item.url -OutFile ($destination+'.part') -UseBasicParsing
  if((Get-FileHash -LiteralPath ($destination+'.part') -Algorithm SHA256).Hash -ne $item.sha256){Remove-Item -LiteralPath ($destination+'.part');throw 'Vendor download checksum failed. Nothing will be executed.'}
  Move-Item -LiteralPath ($destination+'.part') -Destination $destination -Force
 }
 return $destination
}
function Initialize-Node {
 if($script:Node){return}
 Initialize-MicrosoftRuntime
 $archive=Get-VendorArtifact 'node';$version=(Get-Content (Join-Path $script:InstallerRoot 'downloads.json') -Raw|ConvertFrom-Json).node.version
 $runtime=Join-Path $script:StateRoot "runtime\node-$version";Protect-Directory $runtime -ServiceRead
 $script:Node=Join-Path $runtime "node-v$version-win-x64\node.exe";$script:Npm=Join-Path (Split-Path $script:Node -Parent) 'node_modules\npm\bin\npm-cli.js'
 if(!(Test-Path -LiteralPath $script:Node)){Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force}
 if(!(Test-Path -LiteralPath $script:Node)){throw 'The packaged Node runtime was not found after extraction.'}
 # Avoid dependence on machine PATH or blocked npm.ps1 execution.
 $env:PATH=(Split-Path $script:Node -Parent)+';'+$env:PATH
}
function Invoke-Npm([string]$Directory,[string[]]$Arguments) {
 $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$script:Node;$start.WorkingDirectory=$Directory
 $start.Arguments='"'+$script:Npm+'" '+(($Arguments|ForEach-Object {'"'+$_+'"'}) -join ' ')
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $process=New-Object Diagnostics.Process;$process.StartInfo=$start;$null=$process.Start();$outputTask=$process.StandardOutput.ReadToEndAsync();$errorTask=$process.StandardError.ReadToEndAsync()
 while(!$process.WaitForExit(150)){[Windows.Forms.Application]::DoEvents()};$null=$outputTask.Result;$null=$errorTask.Result
 if($process.ExitCode -ne 0){throw 'Dependency installation/build failed. Check network access, disk space and the package lock; no database reset was attempted.'}
}
function Initialize-SetupTools {
 Initialize-Node
 if(!(Test-Path -LiteralPath (Join-Path $script:InstallerRoot 'node_modules\yaml\package.json'))){Invoke-Npm $script:InstallerRoot @('ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund')}
}
function Invoke-Helper([hashtable]$InputData) {
 $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$script:Node
 $start.Arguments='"'+(Join-Path $script:InstallerRoot 'lib\setup-helper.mjs')+'"'
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $process=New-Object Diagnostics.Process;$process.StartInfo=$start;$null=$process.Start()
 $process.StandardInput.Write(($InputData|ConvertTo-Json -Depth 30 -Compress));$process.StandardInput.Close()
 $stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync()
 while(!$process.WaitForExit(150)){[Windows.Forms.Application]::DoEvents()}
 $stdout=$stdoutTask.Result;$null=$stderrTask.Result
 try{$result=$stdout|ConvertFrom-Json}catch{throw 'The setup helper did not return a valid result. No credentials are displayed.'}
 if($process.ExitCode -ne 0 -or !$result.success){throw $result.message}
 return $result.data
}
function Get-MongoConfigPath($Service) {
 $command=$Service.PathName
 $options=@([regex]::Matches($command,'(?<!\S)--[a-zA-Z_-]+')|ForEach-Object {$_.Value.ToLowerInvariant()});if(@($options|Where-Object {$_ -notin @('--config','--service','--servicename','--servicedisplayname','--servicedescription')}).Count){throw 'The MongoDB service has custom command-line options. Nothing was changed; request a configuration review.'}
 if($command -match '(?i)--(?:dbpath|port|bind_ip|replSet|auth|keyFile)(?:\s|=)'){throw 'MongoDB service uses configuration overrides. A separate administrator review is required.'}
 $match=[regex]::Match($command,'(?i)(?:--config|-f)\s+(?:"([^"]+)"|([^\s]+))')
 if(!$match.Success){throw 'MongoDB service does not identify a configuration file. Nothing changed.'}
 $p=if($match.Groups[1].Success){$match.Groups[1].Value}else{$match.Groups[2].Value}
 if(!(Test-Path -LiteralPath $p -PathType Leaf)){throw 'The MongoDB service configuration file could not be found.'};return $p
}
function Find-MongoService([string]$RequestedName) {
 $services=@(Get-CimInstance Win32_Service | Where-Object {$_.PathName -match '(?i)\\mongod\.exe(?:"|\s|$)'})
 if($RequestedName){$services=@($services|Where-Object {$_.Name -eq $RequestedName})}
 if($services.Count -gt 1){throw 'Multiple MongoDB services exist. Enter the exact service name to select it; no automatic choice was made.'}
 if($services.Count -eq 1){return $services[0]};return $null
}
function Initialize-MicrosoftRuntime {
 $runtime=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction SilentlyContinue
 if(!$runtime -or $runtime.Installed -ne 1){$file=Get-VendorArtifact 'vcredist';$signature=Get-AuthenticodeSignature -LiteralPath $file;if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Microsoft runtime signature verification failed.'};$p=Start-Process -FilePath $file -ArgumentList '/install /quiet /norestart' -PassThru -Wait;if($p.ExitCode -eq 3010){throw 'The Microsoft runtime requires a Windows restart. Restart and reopen REMS Setup; no database initialization was performed.'};if($p.ExitCode -notin @(0,1638)){throw 'Microsoft runtime installation failed.'}}
}
function Initialize-FreshDatabasePrerequisites {
 $os=Get-CimInstance Win32_OperatingSystem
 if(($os.ProductType -eq 1 -and [int]$os.BuildNumber -lt 22000) -or ($os.ProductType -ne 1 -and [int]$os.BuildNumber -lt 20348)){throw 'The packaged MongoDB version requires a supported Windows 11 / Windows Server 2022 or newer host. Existing deployments need a separately reviewed compatibility path.'}
 Initialize-MicrosoftRuntime
}
function Install-FreshMongo {
 Initialize-FreshDatabasePrerequisites
 if(Get-Service -Name REMSMongo -ErrorAction SilentlyContinue){throw 'REMSMongo already exists but was not recognized. Review its service configuration.'}
 $archive=Get-VendorArtifact 'mongodb';$root=Join-Path $script:StateRoot 'mongodb';Protect-Directory $root
 Expand-Archive -LiteralPath $archive -DestinationPath $root -Force
 $mongod=@(Get-ChildItem -LiteralPath $root -Filter mongod.exe -Recurse);if($mongod.Count -ne 1){throw 'Could not identify the downloaded MongoDB executable.'}
 $data=Join-Path $root 'data';$logs=Join-Path $root 'logs';$null=New-Item -ItemType Directory -Path $data,$logs -Force
 $config=Join-Path $root 'mongod.cfg';$yaml="storage:`r`n  dbPath: '$data'`r`nsystemLog:`r`n  destination: file`r`n  path: '$(Join-Path $logs 'mongod.log')'`r`n  logAppend: true`r`nnet:`r`n  bindIp: 127.0.0.1`r`n  port: 27017`r`nreplication:`r`n  replSetName: rs0`r`n"
 [IO.File]::WriteAllText($config,$yaml,(New-Object Text.UTF8Encoding($false)))
 & $mongod[0].FullName --config $config --install --serviceName REMSMongo --serviceDisplayName 'REMS MongoDB (local only)'
 if($LASTEXITCODE -ne 0){throw 'MongoDB service installation failed.'};Set-Service REMSMongo -StartupType Automatic;Start-Service REMSMongo
 return Get-CimInstance Win32_Service -Filter "Name='REMSMongo'"
}
function Assert-ManagedServiceIdentity {
 $existing=Get-CimInstance Win32_Service|Where-Object {$_.Name -eq 'REMSOffice'}
 if(!$existing){return}
 $expected=Join-Path $script:StateRoot 'service\REMSOffice.exe';$command=$existing.PathName.Trim();$actual=if($command.StartsWith('"')){[regex]::Match($command,'^"([^"]+)"').Groups[1].Value}else{($command -split '\s+')[0]}
 if(![string]::Equals([IO.Path]::GetFullPath($actual),[IO.Path]::GetFullPath($expected),[StringComparison]::OrdinalIgnoreCase)){throw 'A different Windows application owns the REMSOffice service name. No service was stopped or replaced.'}
}
function Stop-ExistingBackend([int]$Port) {
 Assert-ManagedServiceIdentity
 $managed=Get-Service REMSOffice -ErrorAction SilentlyContinue;if($managed -and $managed.Status -ne 'Stopped'){Stop-Service REMSOffice;$managed.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(45))}
 $listeners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty OwningProcess -Unique)
 foreach($processId in $listeners){$p=Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
  if($p.Name -ne 'node.exe' -or $p.CommandLine -notmatch '(?i)(?:src[\\/])server\.js'){throw "Port $Port is occupied by another application. Nothing was terminated."}
  # A known development backend is stopped only after the administrator confirms its PID.
  Confirm-Setup "Port $Port is used by a Node development backend (process $processId). Stop that backend so setup can prepare this same database? Close other database writers before continuing."
  $parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)" -ErrorAction SilentlyContinue
  if($parent -and $parent.Name -eq 'node.exe' -and $parent.CommandLine -match '(?i)nodemon[\\/]bin[\\/]nodemon\.js.*src[\\/]server\.js'){Stop-Process -Id $parent.ProcessId -ErrorAction Stop}
  Stop-Process -Id $processId -ErrorAction SilentlyContinue
 }
 Start-Sleep -Milliseconds 500
 if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw 'The application port is still in use or a development watcher restarted it. Stop that launcher before continuing; MongoDB was not changed.'}
}
function New-ColdRecovery($Service,[string]$ConfigPath,[string]$EnvPath,[string]$DataPath) {
 if((Get-Item -LiteralPath $DataPath -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'A linked MongoDB data directory needs separate review.'}
 if(!(Test-Path -LiteralPath $DataPath -PathType Container)){throw 'The MongoDB data directory does not exist.'}
 if((Get-Service $Service.Name).Status -ne 'Stopped'){throw 'Cold recovery copying requires MongoDB to be stopped.'}
 $folder=Join-Path $script:StateRoot ('setup-recovery\'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N'));Protect-Directory $folder
 $items=@(Get-ChildItem -LiteralPath $DataPath -Recurse -Force)
 $bytes=($items|Where-Object {!$_.PSIsContainer}|Measure-Object Length -Sum).Sum;$drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($folder));if($drive.AvailableFreeSpace -lt ($bytes*1.2+256MB)){throw 'Not enough free space for a safe recovery copy. MongoDB configuration was not changed.'}
 Write-ProgressLine "Recovery copy: $folder"
 if(@($items|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Linked database files require a separately reviewed recovery copy.'}
 Copy-Item -LiteralPath $ConfigPath -Destination (Join-Path $folder 'mongod.cfg');Copy-Item -LiteralPath $EnvPath -Destination (Join-Path $folder 'server.env')
 & robocopy.exe $DataPath (Join-Path $folder 'data') /E /COPY:DAT /DCOPY:DAT /XJ /R:1 /W:1 /NFL /NDL /NP /NJH /NJS | Out-Null
 if($LASTEXITCODE -ge 8){throw 'Cold recovery copy failed. MongoDB configuration was not changed.'}
 $files=@();foreach($file in @($items|Where-Object {!$_.PSIsContainer})){$relative=$file.FullName.Substring($DataPath.TrimEnd('\').Length).TrimStart('\');$copy=Join-Path (Join-Path $folder 'data') $relative;$hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash;if(!(Test-Path -LiteralPath $copy) -or (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash -ne $hash){throw 'Cold recovery hash verification failed.'};$files+=@{path=$relative;length=$file.Length;sha256=$hash}}
 if(!$files.Count){throw 'The existing data directory was empty. Stop and review the selected service.'}
 foreach($extra in @(@{source=$ConfigPath;name='mongod.cfg'},@{source=$EnvPath;name='server.env'})){$hash=(Get-FileHash -LiteralPath $extra.source -Algorithm SHA256).Hash;if((Get-FileHash -LiteralPath (Join-Path $folder $extra.name) -Algorithm SHA256).Hash -ne $hash){throw 'Configuration recovery-copy verification failed.'};$files+=@{scope='configuration';path=$extra.name;sha256=$hash}}
 @{id=Split-Path $folder -Leaf;requestedBy=[Security.Principal.WindowsIdentity]::GetCurrent().Name;action='LOCAL_REPLICA_PREPARATION';kind='SETUP_COLD_COPY';state='FILES_HASH_CHECKED';createdAt=[DateTime]::UtcNow.ToString('o');service=$Service.Name;dataPath=$DataPath;files=$files;recoveryTested=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $folder 'manifest.json') -Encoding UTF8
 $history=Join-Path $script:StateRoot ('setup-history\'+(Split-Path $folder -Leaf));Protect-Directory $history -ServiceRead
 @{id=Split-Path $folder -Leaf;requestedBy=[Security.Principal.WindowsIdentity]::GetCurrent().Name;action='LOCAL_REPLICA_PREPARATION';kind='SETUP_COLD_COPY';state='FILES_HASH_CHECKED';createdAt=[DateTime]::UtcNow.ToString('o');service=$Service.Name;fileCount=$files.Count;recoveryTested=$false}|ConvertTo-Json|Set-Content (Join-Path $history 'manifest.json') -Encoding UTF8
 return $folder
}
function Repair-LocalMongo($Service,[string]$ServerDirectory,[string]$EnvPath,[int]$AppPort,[switch]$Fresh) {
 $config=Get-MongoConfigPath $Service;$private=Join-Path $script:StateRoot ('setup-plan-'+[guid]::NewGuid().ToString('N')+'.json')
 $summary=Invoke-Helper @{operation='plan';serverDirectory=$ServerDirectory;envFile=$EnvPath;configPath=$config;privatePlanPath=$private}
 try{
  $plan=Get-Content -LiteralPath $private -Raw|ConvertFrom-Json
  $liveService=Get-CimInstance Win32_Service|Where-Object {$_.Name -eq $Service.Name};$owners=@(Get-NetTCPConnection -LocalPort $summary.port -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty OwningProcess -Unique);if(@($owners|Where-Object {$_ -ne $liveService.ProcessId}).Count){throw 'The MongoDB port is owned by a different process/service. No automatic repair was attempted.'}
  if(!$Fresh){try{$ready=Invoke-Helper @{operation='verify';serverDirectory=$ServerDirectory;envFile=$EnvPath};Write-ProgressLine "Existing replica set is ready: $($ready.replicaSet). No database service change needed.";return $ready}catch{Write-ProgressLine 'Transaction verification needs attention; configuration will be reviewed before repair.'}}
  Confirm-Setup "Prepare MongoDB transaction support?`r`nDatabase: $($summary.database)`r`nService: $($Service.Name)`r`nData directory: $($summary.dbPath)`r`nReplica set: $($summary.setName)`r`n`r`nExisting records will be retained. The backend and MongoDB may stop briefly. An existing data directory is copied and hash-checked first. Confirm that other database writers are stopped. No historical index migration is automatically approved."
  Stop-ExistingBackend $AppPort
  $recovery=$null;$initializationAttempted=$false;$changed=$false
  try{
   if((Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash -ne $summary.configHash){throw 'MongoDB configuration changed after review.'}
   Stop-Service $Service.Name;(Get-Service $Service.Name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60))
   if(!$Fresh){Write-ProgressLine 'Creating and hash-checking the stopped database recovery copy...';$recovery=New-ColdRecovery $Service $config $EnvPath $summary.dbPath}
   if((Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash -ne $summary.configHash){throw 'Configuration changed during recovery verification.'}
   if($summary.changed){[IO.File]::WriteAllText($config,$plan.configuration,(New-Object Text.UTF8Encoding($false)));$changed=$true}
   Start-Service $Service.Name;(Get-Service $Service.Name).WaitForStatus('Running',[TimeSpan]::FromSeconds(60))
   if((Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash -ne $summary.envHash){throw 'Application configuration changed after review. No replica initialization was attempted.'}
   $initializationAttempted=$true
   $verified=Invoke-Helper @{operation='initialize';serverDirectory=$ServerDirectory;envFile=$EnvPath;setName=$summary.setName;port=$summary.port}
   if((Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash -ne $summary.envHash){throw 'Application configuration changed during verification. Preserve the recovery copy and review the new configuration.'}
   $temp=$EnvPath+'.setup-'+[guid]::NewGuid().ToString('N');$null=Invoke-Helper @{operation='write-service-env';serverDirectory=$ServerDirectory;envFile=$EnvPath;outputFile=$temp;replicaSet=$summary.setName};Move-Item -LiteralPath $temp -Destination $EnvPath -Force
   if($recovery){Write-ProgressLine "Recovery copy retained: $recovery"};return $verified
  }catch{
   if(!$initializationAttempted){if($changed -and $recovery){if((Get-Service $Service.Name).Status -ne 'Stopped'){Stop-Service $Service.Name};Copy-Item (Join-Path $recovery 'mongod.cfg') $config -Force};if((Get-Service $Service.Name).Status -eq 'Stopped'){Start-Service $Service.Name}}
   throw 'MongoDB preparation did not finish: '+$_.Exception.Message+' Recovery files were retained; no old database files were restored.'
  }
 }finally{Remove-Item -LiteralPath $private -ErrorAction SilentlyContinue}
}
function Initialize-DatabaseTools($Configured) {
 $result=@{};$missing=$false
 foreach($name in @('mongodump','bsondump','mongorestore')){if($Configured.$name){if(!(Test-Path -LiteralPath $Configured.$name -PathType Leaf)){throw "Configured $name path is missing. Its explicit setting was preserved; select a reviewed replacement."};$result[$name]=$Configured.$name}else{$found=Get-Command ($name+'.exe') -ErrorAction SilentlyContinue;$standard=Join-Path $env:ProgramFiles ("MongoDB\Tools\100\bin\$name.exe");if($found){$result[$name]=$found.Source}elseif(Test-Path $standard){$result[$name]=$standard}else{$missing=$true}}}
 if($missing){$archive=Get-VendorArtifact 'databaseTools';$folder=Join-Path $script:StateRoot 'database-tools';Protect-Directory $folder -ServiceRead;Expand-Archive -LiteralPath $archive -DestinationPath $folder -Force;foreach($name in @('mongodump','bsondump','mongorestore')){if(!$result.ContainsKey($name)){$file=@(Get-ChildItem $folder -Recurse -Filter ($name+'.exe'));if($file.Count -ne 1){throw 'Database Tools could not be identified after extraction.'};$result[$name]=$file[0].FullName}}}
 return $result
}
function Stage-Release {
 $source=$script:SourceRoot
 if((!(Test-Path (Join-Path $source 'package-manifest.json')) -and !(Test-Path (Join-Path $source 'release-manifest.json'))) -or !(Test-Path (Join-Path $source 'client\dist\index.html'))){Write-ProgressLine 'Building production frontend...';Invoke-Npm (Join-Path $source 'client') @('ci','--no-audit','--no-fund');$oldApiUrl=$env:VITE_API_URL;$env:VITE_API_URL='/api';try{Invoke-Npm (Join-Path $source 'client') @('run','build')}finally{if($null -eq $oldApiUrl){Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue}else{$env:VITE_API_URL=$oldApiUrl}}}
 $version=(Get-Content (Join-Path $source 'server\package.json') -Raw|ConvertFrom-Json).version
 $release=Join-Path $script:StateRoot ('releases\'+$version+'-'+(Get-Date -Format 'yyyyMMddHHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8));Protect-Directory $release -ServiceRead
 $null=New-Item -ItemType Directory -Path (Join-Path $release 'server'),(Join-Path $release 'client')
 Copy-Item (Join-Path $source 'server\src') (Join-Path $release 'server\src') -Recurse
 Copy-Item (Join-Path $source 'shared') (Join-Path $release 'shared') -Recurse
 Copy-Item (Join-Path $source 'client\dist') (Join-Path $release 'client\dist') -Recurse
 Copy-Item (Join-Path $source 'server\package.json'),(Join-Path $source 'server\package-lock.json') (Join-Path $release 'server')
 Write-ProgressLine 'Installing production backend dependencies...';Invoke-Npm (Join-Path $release 'server') @('ci','--omit=dev','--no-audit','--no-fund')
 @{version=$version;createdAt=[DateTime]::UtcNow.ToString('o');databaseIncluded=$false}|ConvertTo-Json|Set-Content (Join-Path $release 'release-manifest.json') -Encoding UTF8
 return $release
}
function Install-BackendService([string]$Release,[string]$EnvFile,[string]$MongoService,[int]$Port,[bool]$AllowLan,[string]$PreviousEnvFile,[int]$PriorAppPort,[string]$ExpectedInstance) {
 $serviceRoot=Join-Path $script:StateRoot 'service';Protect-Directory $serviceRoot -ServiceRead
 $logRoot=Join-Path $script:StateRoot 'logs';Protect-Directory $logRoot
 & icacls.exe $logRoot /grant '*S-1-5-19:(OI)(CI)M' | Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not allow service logging.'}
 $exe=Join-Path $serviceRoot 'REMSOffice.exe';$xml=Join-Path $serviceRoot 'REMSOffice.xml';$previous=Join-Path $serviceRoot ('REMSOffice.previous-'+(Get-Date -Format 'yyyyMMddHHmmss')+'.xml')
 Assert-ManagedServiceIdentity
 $existing=Get-Service REMSOffice -ErrorAction SilentlyContinue
 $vendorExe=Get-VendorArtifact 'winsw'
 if($existing){Confirm-Setup 'Replace the managed REMS application service with this reviewed release? Configuration, database and previous release files remain preserved. No database migration will run.';if(Test-Path $xml){Copy-Item $xml $previous}}
 if($PriorAppPort -ne $Port){Confirm-Setup "Change the application port from $PriorAppPort to $Port? The existing backend will be stopped after approval."}
 try{
 if($PriorAppPort -ne $Port){Stop-ExistingBackend $PriorAppPort}
 Stop-ExistingBackend $Port
 if($existing){& $exe uninstall;if($LASTEXITCODE -ne 0){throw 'Could not unregister the previous REMS service. Previous configuration retained.'}}
 Copy-Item -LiteralPath $vendorExe -Destination $exe -Force
 function Escape-Xml([string]$Value){return [Security.SecurityElement]::Escape($Value)}
 $node=Escape-Xml $script:Node;$argumentText=Escape-Xml ('--env-file="'+$EnvFile+'" "'+(Join-Path $Release 'server\src\server.js')+'"');$working=Escape-Xml (Join-Path $Release 'server');$logs=Escape-Xml $logRoot;$dependency=Escape-Xml $MongoService
 $body=@"
<service>
 <id>REMSOffice</id><name>REMS Office Server</name><description>REMS application; database records remain in the configured MongoDB service.</description>
 <executable>$node</executable><arguments>$argumentText</arguments><workingdirectory>$working</workingdirectory>
 <startmode>Automatic</startmode><delayedAutoStart>true</delayedAutoStart><depend>$dependency</depend>
 <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>
 <env name="REMS_MANAGED_SERVICE" value="true"/><logpath>$logs</logpath><log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>6</keepFiles></log>
 <onfailure action="restart" delay="10 sec"/><onfailure action="restart" delay="30 sec"/><onfailure action="none"/>
 <stoptimeout>30 sec</stoptimeout>
</service>
"@
 [IO.File]::WriteAllText($xml,$body,(New-Object Text.UTF8Encoding($false)))
 & $exe install;if($LASTEXITCODE -ne 0){throw 'REMS service registration failed.'};Start-Service REMSOffice
  $deadline=(Get-Date).AddSeconds(100);$health=$null
  do{try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3;if($health.product -eq 'REMS' -and $health.setupProtocol -eq 1 -and $health.instanceId -eq $ExpectedInstance){break}}catch{};Start-Sleep -Milliseconds 500;[Windows.Forms.Application]::DoEvents()}while((Get-Date) -lt $deadline)
  if(!$health -or $health.product -ne 'REMS' -or $health.instanceId -ne $ExpectedInstance){throw 'The backend did not pass HTTP startup verification. Inspect service logs.'}
  if($AllowLan){$rule=Get-NetFirewallRule -Name 'REMSOfficePrivate' -ErrorAction SilentlyContinue;if($rule){if($rule.Group -ne 'REMS'){throw 'An existing firewall rule with this name needs administrator review.'};Remove-NetFirewallRule -Name REMSOfficePrivate};New-NetFirewallRule -Name REMSOfficePrivate -Group 'REMS' -DisplayName 'REMS Office - private local subnet only' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program $script:Node -Profile Private -RemoteAddress LocalSubnet -EdgeTraversalPolicy Block | Out-Null}
  else{Get-NetFirewallRule -Name REMSOfficePrivate -ErrorAction SilentlyContinue|Where-Object {$_.Group -eq 'REMS'}|Remove-NetFirewallRule}
 }catch{
  # Application rollback only. Never roll back or restore database files automatically.
  if(Test-Path $previous){try{Stop-Service REMSOffice -ErrorAction SilentlyContinue;& $exe uninstall | Out-Null;if($PreviousEnvFile -and (Test-Path $PreviousEnvFile)){Copy-Item $PreviousEnvFile $EnvFile -Force};Copy-Item $previous $xml -Force;& $exe install | Out-Null;Start-Service REMSOffice;Write-ProgressLine 'Previous application service configuration restored. Database was not restored.'}catch{Write-ProgressLine 'Automatic application rollback needs administrator attention. Previous configuration remains available.'}}else{Stop-Service REMSOffice -ErrorAction SilentlyContinue}
  throw
 }
 return $health
}
function New-DesktopLink([string]$Name,[string]$Target,[string]$Arguments='',[string]$Icon='') {
 $shell=New-Object -ComObject WScript.Shell;$desktop=[Environment]::GetFolderPath('Desktop');$link=$shell.CreateShortcut((Join-Path $desktop ($Name+'.lnk')));$link.TargetPath=$Target;$link.Arguments=$Arguments;if($Icon){$link.IconLocation=$Icon};$link.Save()
}
function Save-SetupAssistant {
 $destination=Join-Path $script:StateRoot 'setup';Protect-Directory $destination
 # The persisted helper reuses the same shared index comparator as the backend.
 $common=Join-Path $script:StateRoot 'shared';Protect-Directory $common
 Copy-Item (Join-Path $script:SourceRoot 'shared\databaseIndexes.js') (Join-Path $common 'databaseIndexes.js') -Force
 foreach($item in @('windows','lib','downloads.json','package.json','package-lock.json','THIRD-PARTY.md','README.md','node_modules')){
  $from=Join-Path $script:InstallerRoot $item;$to=Join-Path $destination $item
  if([string]::Equals([IO.Path]::GetFullPath($from),[IO.Path]::GetFullPath($to),[StringComparison]::OrdinalIgnoreCase)){continue}
  if(Test-Path $from -PathType Container){& robocopy.exe $from $to /E /XJ /R:1 /W:1 /NFL /NDL /NP /NJH /NJS | Out-Null;if($LASTEXITCODE -ge 8){throw 'Could not preserve the setup assistant.'}}
  elseif(Test-Path $from){Copy-Item $from $to -Force}
 }
 return Join-Path $destination 'windows\Setup.ps1'
}
function Test-DistributionManifest {
 $file=Join-Path $script:SourceRoot 'package-manifest.json'
 if(!(Test-Path $file)){Write-ProgressLine 'Source checkout / installed release: production files will be built or copied locally.';return}
 $manifest=Get-Content $file -Raw|ConvertFrom-Json;$root=[IO.Path]::GetFullPath($script:SourceRoot).TrimEnd('\')+'\'
 foreach($entry in $manifest.files){if([IO.Path]::IsPathRooted($entry.path) -or ($entry.path -split '[\\/]') -contains '..'){throw 'Package manifest contains an unsafe path.'};$target=[IO.Path]::GetFullPath((Join-Path $root $entry.path));if(!$target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or !(Test-Path $target -PathType Leaf) -or (Get-FileHash $target -Algorithm SHA256).Hash -ne $entry.sha256){throw 'Package consistency check failed. Download a trusted, complete package again.'}}
 Write-ProgressLine 'Package file hashes match the distribution manifest.'
}
function Prepare-OfficeServer([string]$ExistingEnv,[string]$MongoName,[int]$Port,[bool]$AllowLan,[hashtable]$Admin) {
 if($Port -lt 1024 -or $Port -gt 65535){throw 'Choose a port from 1024 to 65535.'}
 Protect-Directory $script:StateRoot;Test-DistributionManifest;Initialize-SetupTools
 $release=Stage-Release;$server=Join-Path $release 'server';$configRoot=Join-Path $script:StateRoot 'config';Protect-Directory $configRoot -ServiceRead
 $serviceEnv=Join-Path $configRoot 'server.env';$fresh=$false
 $inputEnv=if($ExistingEnv){(Resolve-Path -LiteralPath $ExistingEnv).Path}elseif(Test-Path $serviceEnv){$serviceEnv}else{''}
 $service=Find-MongoService $MongoName
 if(!$inputEnv){
  if($service){throw 'An existing MongoDB service was found. Select your existing REMS server .env so its database name is preserved, or request a separate fresh-database review.'}
  if(Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue){throw 'Port 27017 is already in use. No additional MongoDB instance will be installed.'}
  Confirm-Setup 'Create a NEW REMS local database and Windows MongoDB service? This is only for a new office installation. Existing office data must be selected using its server .env instead.'
  $fresh=$true;$inputEnv=Join-Path $configRoot ('new-'+[guid]::NewGuid().ToString('N')+'.env');$null=Invoke-Helper @{operation='new-env';serverDirectory=$server;envFile=$inputEnv;port=$Port;allowLan=$AllowLan;backupDirectory=(Join-Path $script:StateRoot 'backups')}
  $service=Install-FreshMongo
 }
 if(!$service){throw 'No matching MongoDB Windows service was found for the existing configuration. No new database was substituted.'}
 $working=if($ExistingEnv){Split-Path $inputEnv -Parent}elseif(Test-Path (Join-Path $script:StateRoot 'setup-report.json')){Join-Path ((Get-Content (Join-Path $script:StateRoot 'setup-report.json') -Raw|ConvertFrom-Json).release) 'server'}else{$server}
 $locations=Invoke-Helper @{operation='locations';serverDirectory=$server;envFile=$inputEnv;sourceWorkingDirectory=$working}
 $databaseTools=Initialize-DatabaseTools $locations.tools
 $prior=if(Test-Path $serviceEnv){Get-Content $serviceEnv -Raw}else{$null}
 $priorEnvFile='';if(Test-Path $serviceEnv){$priorEnvFile=$serviceEnv+'.previous-'+(Get-Date -Format 'yyyyMMddHHmmss');Copy-Item $serviceEnv $priorEnvFile}
 $stagedEnv=Join-Path $configRoot ('staged-'+[guid]::NewGuid().ToString('N')+'.env')
 $target=Invoke-Helper @{operation='validate';serverDirectory=$server;envFile=$inputEnv}
 if((Test-Path $serviceEnv) -and $inputEnv -ne $serviceEnv){$currentTarget=Invoke-Helper @{operation='validate';serverDirectory=$server;envFile=$serviceEnv};if($target.targetFingerprint -ne $currentTarget.targetFingerprint){throw 'This managed REMS installation is bound to a different database/port. A company or database switch requires a separate reviewed deployment; no repair was performed.'}}
 $status=Repair-LocalMongo $service $server $inputEnv $locations.applicationPort -Fresh:$fresh
 Set-Service $service.Name -StartupType Automatic
 $instanceId=if($locations.instanceId){$locations.instanceId}else{[guid]::NewGuid().ToString()}
 $values=@{REMS_INSTANCE_ID=$instanceId;REMS_MONGODUMP_PATH=$databaseTools.mongodump;REMS_BSONDUMP_PATH=$databaseTools.bsondump;REMS_MONGORESTORE_PATH=$databaseTools.mongorestore;REMS_BACKUP_DIR=$locations.backupDirectory;FINANCIAL_BACKUP_DIR=$locations.financialDirectory;NODE_ENV='production';HOST=$(if($AllowLan){'0.0.0.0'}else{'127.0.0.1'});PORT=[string]$Port;REMS_SETUP_RECOVERY_DIR=(Join-Path $script:StateRoot 'setup-history');REMS_SETUP_REPORT_PATH=(Join-Path $script:StateRoot 'setup-history\installation.json')}
 # Preserve an existing backup directory; fresh environments already use the managed ProgramData folder.
 $null=Invoke-Helper @{operation='write-service-env';serverDirectory=$server;envFile=$inputEnv;outputFile=$stagedEnv;replicaSet=$status.replicaSet;values=$values}
 if($fresh){$null=Invoke-Helper @{operation='indexes';serverDirectory=$server;envFile=$stagedEnv};$null=Invoke-Helper @{operation='initial-admin';serverDirectory=$server;envFile=$stagedEnv;username=$Admin.username;email=$Admin.email;password=$Admin.password}}
 $verified=Invoke-Helper @{operation='verify';serverDirectory=$server;envFile=$stagedEnv}
 if(!$verified.transactionsSupported){throw 'Transaction verification failed. Normal operation was not enabled.'}
 Move-Item $stagedEnv $serviceEnv -Force
 # The application identity can read configuration. Backups/restore points must remain writable by that identity.
 foreach($folder in @($locations.backupDirectory,$locations.financialDirectory)){
  $full=[IO.Path]::GetFullPath($folder).TrimEnd('\');$forbidden=@([IO.Path]::GetPathRoot($full).TrimEnd('\'),$env:WINDIR,$env:ProgramFiles,$env:ProgramData,$env:USERPROFILE)
  if($full.StartsWith('\\') -or $forbidden -contains $full){throw 'Backup storage points to a broad system or network location. A private directory needs separate review.'}
  if(Test-Path $full){Confirm-Setup "Allow the managed REMS service to read/write this existing private backup directory?`r`n$full`r`nExisting backup files and other permissions are retained."}else{Protect-Directory $full}
  & icacls.exe $full /grant '*S-1-5-19:(OI)(CI)M' | Out-Null;if($LASTEXITCODE -ne 0){throw 'Cannot grant the managed service access to existing backup storage.'}
 }
 try{$health=Install-BackendService $release $serviceEnv $service.Name $Port $AllowLan $priorEnvFile $locations.applicationPort $instanceId}catch{if($prior){[IO.File]::WriteAllText($serviceEnv,$prior,(New-Object Text.UTF8Encoding($false)))};throw}
 $setup=Save-SetupAssistant;$icon=Join-Path $release 'client\dist\branding\rems.ico'
 New-DesktopLink 'REMS' "$env:WINDIR\explorer.exe" "http://localhost:$Port/" $icon
 New-DesktopLink 'REMS Setup and Status' "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" ('-NoProfile -STA -ExecutionPolicy Bypass -File "'+$setup+'" -Mode Status') $icon
 $contracts=$verified.contracts;$needsReview=(!$contracts.activeIndexPresent -or $contracts.legacyIndexes.Count -gt 0 -or $contracts.legacyAccounts -gt 0 -or $contracts.conflicts.Count -gt 0 -or $contracts.invalidLifecycles -gt 0 -or !$verified.indexes.ready -or ($verified.schemaVersion -gt $verified.expectedSchemaVersion))
 $officeUrls=@();if($AllowLan){$officeUrls=@(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue|Where-Object {$_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.AddressState -eq 'Preferred'}|ForEach-Object {@{interface=$_.InterfaceAlias;url=('http://'+$_.IPAddress+':'+$Port)}})}
 $report=@{targetFingerprint=$target.targetFingerprint;requestedBy=[Security.Principal.WindowsIdentity]::GetCurrent().Name;instanceId=$instanceId;officeAddresses=$officeUrls;schema=$verified.expectedSchemaVersion;verifiedSchemaVersion=$verified.schemaVersion;checkedAt=[DateTime]::UtcNow.ToString('o');state=$(if($needsReview){'NEEDS_DATABASE_REVIEW'}else{'READY'});database=$verified.database;databaseVersion=$verified.databaseVersion;transactionsSupported=$true;replicaSet=$verified.replicaSet;applicationVersion=$health.version;release=$release;port=$Port;privateLanEnabled=$AllowLan;contracts=$contracts;indexes=$verified.indexes;previousServiceConfigurationRetained=$true;windowsAcceptance='NOT_AUTOMATICALLY_CERTIFIED'}
 $report|ConvertTo-Json -Depth 15|Set-Content (Join-Path $script:StateRoot 'setup-report.json') -Encoding UTF8
 $historyRoot=Join-Path $script:StateRoot 'setup-history';Protect-Directory $historyRoot -ServiceRead
 $report|ConvertTo-Json -Depth 15|Set-Content (Join-Path $historyRoot 'installation.json') -Encoding UTF8
 if($needsReview){Write-ProgressLine 'Transaction support is ready. Existing database structures need the one-time approved repair in System Health & Database Readiness. No index migration ran.';Start-Process "http://localhost:$Port/database-maintenance"}else{Write-ProgressLine 'READY: application, database, transaction rollback and contract protection checks passed.';Start-Process "http://localhost:$Port/"}
 return $report
}
