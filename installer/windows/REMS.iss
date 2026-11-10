#ifndef PayloadRoot
 #error PayloadRoot must point to the generated REMS-Setup package directory.
#endif
#ifndef AppVersion
 #define AppVersion "0.1.0"
#endif
[Setup]
AppId={{5CE33B3E-E91E-4E99-95D5-9B165B8115C1}
AppName=REMS Setup Assistant
AppVersion={#AppVersion}
AppPublisher=REMS
DefaultDirName={localappdata}\REMS Setup Assistant
DefaultGroupName=REMS
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\output
OutputBaseFilename=REMS-Setup-{#AppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile={#PayloadRoot}\client\dist\branding\rems.ico
UninstallDisplayIcon={app}\client\dist\branding\rems.ico
[Files]
Source: "{#PayloadRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\REMS Setup Assistant"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -ExecutionPolicy Bypass -File ""{app}\installer\windows\Setup.ps1"""; IconFilename: "{app}\client\dist\branding\rems.ico"
[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -ExecutionPolicy Bypass -File ""{app}\installer\windows\Setup.ps1"""; Description: "Open REMS setup and verify this computer"; Flags: postinstall nowait skipifsilent
[Code]
procedure InitializeWizard;
begin
 WizardForm.FinishedLabel.Caption := 'The setup assistant files are installed. REMS is ready only after the guided Office Server or Client Connection checks pass. Existing records and database migrations require their separate review.';
end;
