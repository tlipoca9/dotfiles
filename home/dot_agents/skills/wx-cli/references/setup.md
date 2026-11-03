# wx-cli setup

Needs WeChat desktop 4.x installed and logged in. Every step that uses `sudo`,
`codesign`, or `tccutil` changes system state: describe it and get the user's
go-ahead first, or hand the commands to the user.

## Install

```bash
npm install -g @jackwener/wx-cli
wx --version
```

## Initialize on macOS (once; redo the re-sign after a WeChat update)

1. Re-sign WeChat so its memory can be scanned:

   ```bash
   codesign --force --deep --sign - /Applications/WeChat.app
   ```

   If it fails with `signature in use` or a broken dylib, remove that dylib's
   signature and retry, for example:

   ```bash
   codesign --remove-signature "/Applications/WeChat.app/Contents/Frameworks/vlc_plugins/librtp_mpeg4_plugin.dylib"
   codesign --force --deep --sign - /Applications/WeChat.app
   ```

2. Reset WeChat's privacy grants. macOS ties each grant to the code signature,
   so after re-signing the old grants silently stop working even though
   System Settings still shows them enabled:

   ```bash
   for s in ScreenCapture Camera Microphone AppleEvents AddressBook \
     SystemPolicyDocumentsFolder SystemPolicyDownloadsFolder SystemPolicyDesktopFolder; do
     tccutil reset "$s" com.tencent.xinWeChat
   done
   ```

   `No such bundle identifier` for a service means nothing was granted; ignore it.

3. Restart WeChat and wait until it is fully logged in:

   ```bash
   killall WeChat && open /Applications/WeChat.app
   ```

   Grant permissions again when WeChat asks. On macOS 26, add WeChat to the
   upper list of Privacy & Security → Screen & System Audio Recording; the
   “system audio only” list does not grant screen capture.

4. Extract the database keys:

   ```bash
   sudo wx init
   ```

   It detects the data directory, scans WeChat's memory for keys, and writes
   `~/.wx-cli/config.json`. Later commands need no `sudo`; the daemon starts on
   first use.
