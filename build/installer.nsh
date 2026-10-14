!include "nsDialogs.nsh"
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!ifndef PLANNER_CONFIG_ROOT
  !define PLANNER_CONFIG_ROOT "$APPDATA\冲冲冲"
!endif
!ifndef BUILD_UNINSTALLER
Var PlannerStoragePath
Var PlannerOriginalPath
Var PlannerStorageInput
Var PlannerStorageDialog
Var PlannerStorageBrowse
Var PlannerConfigFile
Var PlannerScratch
Var PlannerPrefix
Var PlannerLength
Var PlannerFile
Var PlannerFileName
Var PlannerParams

!macro customInit
  SetShellVarContext current
  StrCpy $PlannerConfigFile "${PLANNER_CONFIG_ROOT}\storage-location.ini"
  ReadINIStr $PlannerOriginalPath $PlannerConfigFile "Storage" "Current"
  ${If} $PlannerOriginalPath == ""
    IfFileExists "$APPDATA\留白\*.*" 0 +3
      StrCpy $PlannerOriginalPath "$APPDATA\留白"
      Goto plannerDefaultReady
    StrCpy $PlannerOriginalPath "$APPDATA\liubai-planner"
    plannerDefaultReady:
  ${EndIf}
  StrCpy $PlannerStoragePath $PlannerOriginalPath
  ${GetParameters} $PlannerParams
  ClearErrors
  ${GetOptions} $PlannerParams "/DATA_DIR=" $PlannerScratch
  ${IfNot} ${Errors}
    StrCpy $PlannerStoragePath $PlannerScratch
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom PlannerStoragePage PlannerStorageLeave
!macroend

Function PlannerStoragePage
  !insertmacro MUI_HEADER_TEXT "日程数据存储位置" "与软件安装位置分开，升级默认保留原数据。"
  nsDialogs::Create 1018
  Pop $PlannerStorageDialog
  ${If} $PlannerStorageDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "选择日程、头像和本地设置的存储位置。更换位置后，首次打开软件会迁移原有数据；原目录会保留。"
  Pop $PlannerScratch
  ${NSD_CreateDirRequest} 0 45u 78% 14u "$PlannerStoragePath"
  Pop $PlannerStorageInput
  ${NSD_CreateBrowseButton} 81% 44u 19% 16u "浏览…"
  Pop $PlannerStorageBrowse
  ${NSD_OnClick} $PlannerStorageBrowse PlannerStorageBrowseClick
  ${NSD_CreateLabel} 0 78u 100% 36u "更换时请选择空文件夹。不要将数据放在软件安装目录内，以免卸载影响数据。"
  Pop $PlannerScratch
  nsDialogs::Show
FunctionEnd

Function PlannerStorageBrowseClick
  ${NSD_GetText} $PlannerStorageInput $PlannerStoragePath
  nsDialogs::SelectFolderDialog "选择日程数据文件夹" "$PlannerStoragePath"
  Pop $PlannerScratch
  ${If} $PlannerScratch != error
    ${NSD_SetText} $PlannerStorageInput $PlannerScratch
  ${EndIf}
FunctionEnd

Function PlannerStorageValidate
  ${If} $PlannerStoragePath == ""
    MessageBox MB_ICONEXCLAMATION "请选择数据存储位置。" /SD IDOK
    Abort
  ${EndIf}
  StrLen $PlannerLength $PlannerStoragePath
  ${If} $PlannerLength < 4
    MessageBox MB_ICONEXCLAMATION "请选择数据文件夹，不能使用磁盘根目录。" /SD IDOK
    Abort
  ${EndIf}
  ClearErrors
  CreateDirectory "$PlannerStoragePath"
  ${If} ${Errors}
    MessageBox MB_ICONEXCLAMATION "无法使用该文件夹，请检查路径和磁盘权限。" /SD IDOK
    Abort
  ${EndIf}
  GetFullPathName $PlannerScratch "$PlannerStoragePath"
  StrCpy $PlannerStoragePath $PlannerScratch
  StrLen $PlannerLength $PlannerStoragePath
  ${If} $PlannerLength < 4
    MessageBox MB_ICONEXCLAMATION "不能将磁盘根目录作为数据位置。" /SD IDOK
    Abort
  ${EndIf}
  ${If} $PlannerStoragePath == $PlannerOriginalPath
    Return
  ${EndIf}
  StrLen $PlannerLength $INSTDIR
  StrCpy $PlannerPrefix $PlannerStoragePath $PlannerLength
  ${If} $PlannerPrefix == $INSTDIR
    MessageBox MB_ICONEXCLAMATION "请将数据位置与软件安装目录分开。" /SD IDOK
    Abort
  ${EndIf}
  StrLen $PlannerLength $PlannerOriginalPath
  StrCpy $PlannerPrefix $PlannerStoragePath $PlannerLength
  ${If} $PlannerPrefix == $PlannerOriginalPath
    MessageBox MB_ICONEXCLAMATION "请选择原数据目录以外的位置。" /SD IDOK
    Abort
  ${EndIf}
  ClearErrors
  FindFirst $PlannerFile $PlannerFileName "$PlannerStoragePath\*"
  IfErrors plannerStorageEmpty
  plannerStorageScan:
    ${If} $PlannerFileName != "."
    ${AndIf} $PlannerFileName != ".."
    ${AndIf} $PlannerFileName != ""
      FindClose $PlannerFile
      MessageBox MB_ICONEXCLAMATION "请选择空文件夹，已有文件不会被覆盖。" /SD IDOK
      Abort
    ${EndIf}
    FindNext $PlannerFile $PlannerFileName
    IfErrors plannerStorageClose
    Goto plannerStorageScan
  plannerStorageClose:
    FindClose $PlannerFile
  plannerStorageEmpty:
FunctionEnd

Function PlannerStorageLeave
  ${NSD_GetText} $PlannerStorageInput $PlannerStoragePath
  Call PlannerStorageValidate
FunctionEnd

!macro customInstall
  SetShellVarContext current
  Call PlannerStorageValidate
  CreateDirectory "${PLANNER_CONFIG_ROOT}"
  ClearErrors
  FileOpen $PlannerFile "$PlannerConfigFile.tmp" w
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "无法保存数据位置，原设置已保留。" /SD IDOK
    Abort
  ${EndIf}
  ${If} $PlannerStoragePath == $PlannerOriginalPath
    FileWriteUTF16LE /BOM $PlannerFile "[Storage]$\r$\nCurrent=$PlannerOriginalPath$\r$\nPending=$\r$\n"
  ${Else}
    FileWriteUTF16LE /BOM $PlannerFile "[Storage]$\r$\nCurrent=$PlannerOriginalPath$\r$\nPending=$PlannerStoragePath$\r$\n"
  ${EndIf}
  FileClose $PlannerFile
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "无法保存数据位置，原设置已保留。" /SD IDOK
    Abort
  ${EndIf}
  System::Call 'kernel32::MoveFileExW(w "$PlannerConfigFile.tmp", w "$PlannerConfigFile", i 1) i .r0'
  ${If} $0 == 0
    MessageBox MB_ICONSTOP "无法更新数据位置，原设置已保留。" /SD IDOK
    Abort
  ${EndIf}
!macroend
!endif
