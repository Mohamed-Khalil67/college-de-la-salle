# ng serve port collisions on Windows

## Why it happens
Closing a terminal tab, an IDE terminal or a stopped task without Ctrl+C can leave the `node` process behind. That orphan keeps the port (default 4200), so the next `ng serve` asks to use another port, or you keep looking at a stale build served by the old process.

## Diagnose (PowerShell)
```powershell
Get-NetTCPConnection -LocalPort 4200 -State Listen | Select-Object LocalPort, OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId = <pid>" | Select-Object ProcessId, Name, CommandLine
```
Check that the command line is an `ng serve` / `@angular/cli` process of your project before killing it. `cmd` equivalent: `netstat -ano | findstr :4200`.

## Clear
```powershell
Stop-Process -Id <pid> -Force
```
or `taskkill /PID <pid> /F`. Kill by the PID you confirmed. Never `taskkill /IM node.exe` (it kills every Node process, including the IDE's language servers and other dev servers).

## Avoid
- Stop servers with Ctrl+C, or close the terminal only after the server has stopped.
- Run a second app on another port: `ng serve --port 4300`, or `--port 0` for any free port.
- If the project keeps its dev ports in `.claude/launch.json` or a README, use those so each app has a fixed port.

## If the port is free but the app looks stale
Hard-reload the browser, check that the tab points at the port you expect, and confirm only one `ng serve` is running (the diagnose command above should list one process).
