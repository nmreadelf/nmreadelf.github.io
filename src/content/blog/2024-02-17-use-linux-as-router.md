---
title: '将Linux作为家用路由器操作系统使用'
description: '把Linux作为家用路由器操作系统使用'
pubDate: '2024-02-17T14:00:00+08:00'
lang: 'zh-cn'
tags: ["Linux", "Router"]
---

这篇文章是我将Linux系统作为路由器系统使用的一些心得。怎么配置Linux系统，碰到哪些问题，以及怎么解决这些问题

网络配置信息和操作系统信息如下:
1. 局域网网段是 192.168.0.0/24
2. 网关地址是 192.168.0.1/24
3. Linux发行版是 Debian

解释一下为什么操作系统是Debian，而不是专门用来面向网络的OpenWrt系统

主要是有一些开发上的需求，比如我想用 eBPF，但是因为 OpenWrt 的内核主要面向网络，内核模块上会做一些阉割，用 OpenWrt，我需要重新配置、编译内核，比较麻烦。

# 功能

先罗列一下家用路由器系统的功能有哪些


|功能|描述|
|----|----|
|DNS|负责域名解析|
|DHCP|给局域网设备分配IP地址|
|NAT|网络地址转换，局域网上网必备选项(IPv4必须，IPv6可以不要，但是考虑到隐私问题，建议IPv6也弄上)|

# 功能方案选型

DNS 和 DHCP 服务器我用的 [AdGuardHome](https://github.com/AdguardTeam/AdGuardHome)

简单说一下为什么选择`AdGuardHome`，`AdGuardHome` 除了基本的 DNS、DHCP 服务功能外， 还可以实现广告拦截。`AdGuardHome` 在 DNS 层面拦截广告，让广告域名解析不到IP地址，从而实现广告拦截的能力。虽然不是所有广告都有单独的域名，但是至少能拦截一部分广告。

DNS 和 DHCP 服务器还有另一个选型是 `Dnsmasq`，`Dnsmasq` 可以通过 DNS 配置来实现广告拦截，但是需要手动维护配置。AdguardHome 会定期从服务器上拉取广告域名名单([名单repo](https://github.com/AdguardTeam/AdGuardSDNSFilter))，相比 `Dnsmasq` 省事。

NAT 这个是操作系统提供的能力，Linux 上是防火墙提供这方面的功能。防火墙有两个方案，iptables 和 nftables。nftables可以理解为是新一代的iptables，iptables 是 1998 年首次发布，nftables 是 2014 年首次发布，使用上来说，iptables 比 nftables 更为常见。

# 网络和NAT配置

先说一下为什么必须要有NAT，每一台设备上网都需要有一个 IP 地址，但随着上网设备的增多，出现了 IP 地址不够用的情况。后面提出了NAT技术，缓解IP地址不够用的情况，当 IP 数据包经过路由器时，路由器会把 IP 数据包的源 IP 地址 或者目的 IP 地址进行转换。

罗列下路由器需要有哪些网络配置
1. 网桥，用来桥接局域网
2. NAT
3. 端口映射，将路由器上的个别端口映射到局域网内设备端端口上
4. 防火墙，拒绝部分来自公网的网络流量，比如对 ICMP 流量不做反应



## /etc/nftables.conf 配置

一些配置说明:

`inet.filter.input` 做了一些预先配置，`inet.filter.input` 允许 tcp 22 端口访问，允许 `lo` 网卡的流量，其他规则没有匹配到 就遵从默认配置 `drop`, 也就是丢弃流量。

`inet.filter.forward` 添加了 `TCP MSS clamping` 配置

关于 `TCP MSS clamping` 我碰到过一个问题，局域网内的电脑下载一个程序安装包，下载不下来，`wget` 下载报错，具体错误信息我忘了，但是在路由器上下载是没有问题的，后面发现是 `TCP MSS` 的问题，[TCP MSS](https://www.cloudflare.com/learning/network-layer/what-is-mss/) 可以看这边文章的介绍，我碰到的问题大体来说，客户端的MSS过大，在经过中间路由器的时候，中间路由器不支持数据包分片(按照 IP 协议的规定，如果数据包过大，超过MTU，当前接收到包的网络设备应该对此数据包进行分片，个人猜测是，网络攻击可以利用这种需要进行分片的规定，发送大量大于MTU大小的数据包，进而占用网络设备的计算资源，导致网络设备没有计算资源转发其他流量，进而导致网络瘫痪)，导致数据传输失败。添加 `TCP MSS clamping` 配置后，TCP 握手阶段商量好 MSS， 这样就能避免因中间路由器不支持数据包分片导致传输失败。

```nftables
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
        chain input {
                type filter hook input priority filter; policy accept;
                tcp dport 22 counter accept # allow 22 port traffic
                iif "lo" accept # allow local interface traffic
                ct state established,related accept
                drop # default policy is drop any traffic
        }

        chain forward {
                type filter hook forward priority filter; policy accept;
                tcp flags syn tcp option maxseg size set rt mtu # set tcp mss clamping
        }

        chain output {
                type filter hook output priority filter; policy accept;
        }
}
table inet mangle {
        chain forward {
                type filter hook forward priority mangle; policy accept;
        }
}
table ip nat {
        chain postrouting {
                type nat hook postrouting priority srcnat; policy accept;
        }

        chain prerouting {
                type nat hook prerouting priority dstnat; policy accept;
        }

        chain vserver {
                counter jump MINIUPNPD
        }

        chain output {
                type nat hook output priority filter + 9; policy accept;
        }

        chain MINIUPNPD {
        }

        chain MINIUPNPD-POSTROUTING {
        }
}
```

### /etc/network/interface 配置

`br0` 也就是网桥，接入网桥的设备有 `eno1`, 启动网桥设备的时候，添加两条规则分别是
1. `inet.filter.input` 允许来自 `br0` 网口的流量
2. `ip.nat.postrouting` 处理局域网中的流量

当关闭 `br0` 时，相应的，把启动时加的两条规则删掉

`eno2` 外接 `ppoe` 上网
ppoe 相关配置在下一个章节介绍

```
# The loopback network interface
auto lo br0
iface lo inet loopback

auto eno1
allow-hotplug eno1
iface eno1 inet manual
up ethtool -G eno1 tx 4096 rx 4096

iface br0 inet static
bridge_ports eno1 
address 192.168.0.1
broadcast 192.168.0.255
netmask 255.255.255.0
bridge_fd 0
bridge_waitport 0
up nft insert rule inet filter input iif "br0" accept comment br0allow
up nft add rule ip nat postrouting ip saddr == 192.168.0.0/24 ip daddr == 192.168.0.0/24 oifname br0 counter masquerade comment br0localnatMasq
down nft -a -n list ruleset inet | awk '$0 ~ /br0allow/{print "nft delete rule inet filter handle " $NF }' | bash
down nft -a -n list ruleset ip  | awk '$0 ~ /br0localnatMasq/{print "nft delete rule ip nat postrouting handle " $NF }' | bash


auto eno2
allow-hotplug eno2
iface eno2 inet manual
up ethtool -G eno2 tx 4096 rx 4096


auto dsl-provider
iface dsl-provider inet ppp
provider dsl-provider
```

## ppoe 配置

使用 `pppoeconf` 命令设置 `pppoe` 网口、账户和密码。
`/etc/ppp/chap-secrets` 设置 `ppoe` 拨号账户和密码

`ppp` 拨号成功或者关闭后，会调用 `/etc/ppp/` 目录下的脚本，进行网络配置设置，涉及到的脚本如下

`/etc/ppp/ip-up.d/0clampmss` 脚本配置如下
```bash
#!/bin/sh
# set masquerade
nft insert rule ip nat postrouting ip saddr != "$PPP_LOCAL" oifname "$PPP_IFACE" counter masquerade comment masqwan
# setup upup
nft insert rule ip nat postrouting oifname "$PPP_IFACE" counter jump MINIUPNPD-POSTROUTING comment postupup
nft insert rule ip nat prerouting ip daddr == "$PPP_LOCAL" counter jump vserver comment wantovserver
# set ttl
nft add rule inet mangle forward oifname "$PPP_IFACE" ip ttl gt 30 ip ttl lt 254 counter ip ttl set 64 comment pppttlseto64
nft add rule inet mangle forward oifname "$PPP_IFACE" ip ttl eq 254 counter ip ttl set 255 comment pppttlsetto255255
# Enable MSS clamping
nft add rule inet filter forward iifname "$PPP_IFACE" tcp flags syn tcp option maxseg size set rt mtu comment ppptcpmssclampingiff
nft add rule inet filter forward oifname "$PPP_IFACE" tcp flags syn tcp option maxseg size set rt mtu comment ppptcpmssclampingoff
ifconfig "$PPP_IFACE" mtu 1480
```

`/etc/ppp/ip-down.d/0clampmss` 脚本内容如下
```bash
#!/bin/sh
# remove masquerade
nft -a -n list chain ip nat postrouting | awk '$0 ~ /masqwan/{print "nft delete rule ip nat postrouting handle "$NF}' | bash
# remove upup
nft -a -n list chain ip nat postrouting | awk '$0 ~ /postupup/{print "nft delete rule ip nat postrouting handle "$NF}' | bash
nft -a -n list chain ip nat prerouting | awk '$0 ~ /wantovserver/{print "nft delete rule ip nat prerouting handle "$NF}' | bash
# remove modify ttl config
nft -a -n list chain inet mangle forward | awk '$0 ~ /pppttlsetto64/{print "nft delete rule inet mangle forward handle "$NF}' | bash
nft -a -n list chain inet mangle forward | awk '$0 ~ /pppttlsetto255255/{print "nft delete rule inet mangle forward handle "$NF}' | bash
# remove MSS clamping config
nft -a -n list chain inet filter forward | awk '$0 ~ /ppptcpmssclampingiff/{print "nft delete rule inet filter forward handle "$NF}' | bash
nft -a -n list chain inet filter forward | awk '$0 ~ /ppptcpmssclampingoff/{print "nft delete rule inet filter forward handle "$NF}' | bash
```