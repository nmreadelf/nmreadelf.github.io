---
title: '使用softcv vits 训练自己的声音转换模型'
description: '使用softcv vits 训练自己的声音转换模型'
pubDate: '2024-04-13T20:00:00+08:00'
lang: 'zh-cn'
tags: ["so-vits-svc", "machine leanring", "voice conversion"]
---

这篇文章介绍我使用`SoftVC VITS` 训练自己的声音转换模型，过程中遇到的一些坑。

按照 官方[github](https://github.com/voicepaw/so-vits-svc-fork/) 里面写的文档来训练，官方的文档不是特别详细，所以我这这篇文章算是对官方文档小小的补充吧

环境信息
- 操作系统: Debian 12
- CPU: amd64
- python: 3.11.9

## 环境和文件准备

### 系统软件准备
先安装一下 deb 包，这个包，在后续训练的过程中会用到，具体哪个步骤我忘了，在我的环境缺这个包，导致我无法继续进行训练
`apt-get install libportaudio2`

`so-vits-svc-fork` 这个包的安装教程，按照官方的 readme 来进行，这个我没有碰到什么坑

### 语音文件准备

准备一份wav文件。我是自己读了一篇文章，时长5分钟左右。
我创建了一个项目文件夹，讲自己的声音文件放到 项目文件夹下。
我的环境是这样的:
```bash
mkdir -p myvoice/raw
cp myvoice.wav myvoice/raw
cd myvoice
```

## 开始训练

### 数据切分

数据处理主要是切分声音文件，讲文件按照时长(时长不固定)切分。

这里另外说一句，因为我只需要训练我的声音，所以我用的svc pre-split, 如果有多个人，使用`svc pre-sd`命令切分，具体操作看文档

切分:
```bash
svc pre-split -i raw/  # 这个命令执行完后，会生成dataset_raw 文件夹，里面有切分好的声音文件
```

切分完成后，会生成`dataset_raw`文件夹，里面是有一堆wav文件。

需要把这些文件挪动一下位置，按照官方文档的说法, 挪动后的文位置应该是这样`dataset_raw/{speaker_id}/**/{wav_file}.{any_format}`。

但是经过我实际操作，应该是这样`dataset_raw/{speaker_id}/{wav_file}.{any_format}`

所以我是这样操作的
```bash
mkdir -p dataset_raw/bobo # 这里我的speaker id 是 bobo
mv dataset_raw/*wav dataset_raw/bobo
```

### Preprocessing part 1: resample

`resample` 执行完成后，会生成`dataset`文件夹
`svc pre-resample -i dataset_raw`

大概看了一下代码，`pre-resample` 调用 `librosa` 对声音文件进行处理，大概就是去掉每个`wav`文件开头和结尾静音的部分(或者说没有声音的部分)。


### Preprocessing part 2: config

这一步执行完后, 会生成 `configs` 和 `filelits` 目录 
`svc pre-config -i dataset_raw`

### Preprocessing part 3: hubert

使用`hubert`处理一下, 如果本地没有用到的模型，它会自动下载
`svc pre-hubert -i dataset_raw/`

### train

如果项目目录里面没有`so-vits-svc`模型，`train` 程序会自动下载模型，这一步训练步骤比较长，我训练自己的声音模型花了6个小时,4070 显卡
`svc train -t`

### infer 
训练玩以后，就可以推理拉，这里需要注意的是，推理一定要在自己项目目录里面, 我的环境项目目录是`myvoice`(不在项目目录里面也行，但是需要指定模型目录和配置文件，比较麻烦,具体如何使用查看`infer`命令帮助)

这里我找了一个文件`test.wav`，将`test.wav` 文件里面的人声换成我的声音, 转换后的内容输出到`conv_test.mp4`文件
`svc test.wav -o conv_test.mp3`
