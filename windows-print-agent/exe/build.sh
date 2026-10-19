#!/bin/sh
# Cross-compiles the Windows agent from anywhere Go runs. No Windows, no SDK,
# no modules to fetch - the whole thing is the standard library.
set -e
cd "$(dirname "$0")"
go vet ./...
GOOS=windows go vet ./...
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o chocoberry-print-agent.exe .
ls -lh chocoberry-print-agent.exe
