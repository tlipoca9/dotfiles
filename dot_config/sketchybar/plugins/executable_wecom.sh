#!/bin/bash

# 获取企业微信进程信息
WECOM_PROCESS=$(ps aux | grep "WXWork" | grep -v "grep")

if [[ $WECOM_PROCESS != "" ]]; then
    UNREAD=$(lsappinfo -all info -only StatusLabel "企业微信" | sed -nr 's/\"StatusLabel\"=\{ \"label\"=\"(.+)\" \}$/\1/p')
    if [[ -z $UNREAD ]]; then
      UNREAD=$(lsappinfo -all list | grep "\"企业微信\"" | grep StatusLabel | tr "," "\n" | grep StatusLabel | sed -nr 's/\"StatusLabel\"=\{ \"label\"=\"(.+)\" \}$/\1/p')
    fi
    if [[ -z $UNREAD ]]; then
        sketchybar --set $NAME label.drawing=off icon.color=0xff2590fe
    else
        # 企业微信未读消息, 红色标签
        sketchybar --set $NAME label="● $UNREAD" label.drawing=on label.color=0xffd0021b icon.color=0xffd0021b
    fi
else
    sketchybar --set $NAME label.drawing=off icon.color=0xff2590fe
fi