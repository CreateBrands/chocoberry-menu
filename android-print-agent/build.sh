#!/bin/sh
# Builds PrintAgent.apk with the stock Debian/Ubuntu Android tools (no Android Studio needed):
#   apt install android-sdk-platform-23 aapt dalvik-exchange apksigner zipalign openjdk-17-jdk-headless
set -e
AJ=/usr/lib/android-sdk/platforms/android-23/android.jar
DX=/usr/lib/android-sdk/build-tools/debian/dx
rm -rf gen obj && mkdir -p gen obj
aapt package -f -m -J gen -M AndroidManifest.xml -S res -I $AJ
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -bootclasspath $AJ -d obj $(find gen src -name "*.java")
$DX --dex --min-sdk-version=23 --output=classes.dex obj
aapt package -f -M AndroidManifest.xml -S res -I $AJ -F unaligned.apk
aapt add unaligned.apk classes.dex
zipalign -f 4 unaligned.apk aligned.apk
apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --out PrintAgent.apk aligned.apk
echo built PrintAgent.apk
