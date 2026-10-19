#!/bin/sh
# Cross-compiles the Windows agent from anywhere Go runs. No Windows, no SDK,
# no modules to fetch - the whole thing is the standard library.
set -e
cd "$(dirname "$0")"
go vet ./...
GOOS=windows go vet ./...
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o chocoberry-print-agent.exe .
# Keep the copy served from /apps in step with the source. Staff download
# that one, so a stale build there is worse than no build at all.
cp chocoberry-print-agent.exe ../../public/apps/ChocoberryPrintAgent.exe
ls -lh chocoberry-print-agent.exe ../../public/apps/ChocoberryPrintAgent.exe
