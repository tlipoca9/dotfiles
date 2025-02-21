#!/bin/bash

# 获取企业微信进程信息
WECOM_PROCESS=$(ps aux | grep "WXWork" | grep -v "grep")

if [[ $WECOM_PROCESS != "" ]]; then
    # 检查企业微信的 Dock 图标是否有未读消息标记
    UNREAD=$(osascript -e '
        tell application "System Events"
            tell process "WXWork"
                if exists (every window whose name contains "企业微信") then
                    return "1"
                else
                    return "0"
                end if
            end tell
        end tell
    ')
    
    if [[ $UNREAD == "1" ]]; then
        sketchybar --set wecom label="●" label.drawing=on label.color=0xff2590fe
    else
        sketchybar --set wecom label.drawing=off
    fi
else
    sketchybar --set wecom label.drawing=off
fi